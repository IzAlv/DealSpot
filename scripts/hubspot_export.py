#!/usr/bin/env python3
"""
HubSpot -> DealSpot migration: extract companies + activities + contacts.

Pulls all companies via the HubSpot CRM v3 API with their associated
notes, calls, emails, meetings, tasks and contacts. The bodies of each
activity are fetched in batches and embedded into each company under
`_activities`. Contacts get a flat artifact with their company links.

Output (gitignored, lives outside the repo as well via /out/):
    out/hubspot/companies.json   one record per company, activities embedded
    out/hubspot/contacts.json    one record per contact, with company ids
    out/hubspot/summary.txt      tallies + the dedup keys we will use

Resumability: the script writes companies.json incrementally per page,
so a re-run with --resume reads the existing file and only fetches IDs
that aren't already present. Activity batch reads are cheap so they
re-run from scratch each time (still under a minute).

Usage:
    # one-off (token from .env.hubspot in repo root)
    python scripts/hubspot_export.py

    # dry run on the first page
    python scripts/hubspot_export.py --limit 25

    # resume after a 429/timeout
    python scripts/hubspot_export.py --resume
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API_BASE = "https://api.hubapi.com"
REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = REPO_ROOT / "out" / "hubspot"
ENV_FILE = REPO_ROOT / ".env.hubspot"

COMPANY_PROPS = [
    "name", "domain", "phone", "city", "country", "state", "address",
    "website", "industry", "description", "linkedin_company_page",
    "linkedinbio", "lifecyclestage", "lead_status", "company_keywords",
    "type", "annualrevenue", "numberofemployees", "createdate",
    "hs_lastmodifieddate", "notes_last_contacted", "hubspot_owner_id",
    "zip", "twitterhandle",
]

CONTACT_PROPS = [
    "firstname", "lastname", "email", "phone", "mobilephone", "jobtitle",
    "company", "createdate", "lastmodifieddate", "hubspot_owner_id",
    "lifecyclestage",
]

ACTIVITY_SPEC = {
    "notes":    ["hs_note_body", "hs_timestamp", "hs_createdate", "hubspot_owner_id"],
    "calls":    ["hs_call_body", "hs_call_title", "hs_timestamp", "hs_call_direction",
                 "hs_call_disposition", "hubspot_owner_id"],
    "emails":   ["hs_email_subject", "hs_email_text", "hs_email_html",
                 "hs_email_direction", "hs_timestamp", "hubspot_owner_id"],
    "meetings": ["hs_meeting_title", "hs_meeting_body", "hs_timestamp",
                 "hs_meeting_outcome", "hubspot_owner_id"],
    "tasks":    ["hs_task_subject", "hs_task_body", "hs_timestamp",
                 "hs_task_status", "hubspot_owner_id"],
}


def load_token() -> str:
    token = os.environ.get("HUBSPOT_API_KEY")
    if token:
        return token
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line.startswith("HUBSPOT_API_KEY="):
                return line.split("=", 1)[1].strip()
    sys.exit("HUBSPOT_API_KEY not found. Export the env var or populate .env.hubspot")


def request_json(token: str, method: str, path: str, params: dict = None, body: dict = None) -> dict:
    url = f"{API_BASE}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    data = json.dumps(body).encode() if body is not None else None
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = min(2 ** attempt, 30)
                print(f"  rate-limited; sleeping {wait}s", file=sys.stderr)
                time.sleep(wait)
                continue
            if 500 <= e.code < 600:
                time.sleep(2 ** attempt)
                continue
            body_msg = e.read().decode(errors="replace")[:500]
            sys.exit(f"HTTP {e.code} {path}: {body_msg}")
        except urllib.error.URLError as e:
            time.sleep(2 ** attempt)
            continue
    sys.exit(f"failed after retries: {path}")


def paginate(token, path, properties, associations=None, limit=None):
    after = None
    fetched = 0
    while True:
        page_size = 100 if limit is None else min(100, limit - fetched)
        params = {"limit": page_size, "properties": properties}
        if associations:
            params["associations"] = associations
        if after:
            params["after"] = after
        data = request_json(token, "GET", path, params=params)
        results = data.get("results", [])
        for item in results:
            yield item
            fetched += 1
            if limit is not None and fetched >= limit:
                return
        nxt = data.get("paging", {}).get("next")
        if not nxt:
            return
        after = nxt.get("after")


def batch_read(token, object_type, ids, properties):
    out = []
    ids = list({str(i) for i in ids if i})
    for i in range(0, len(ids), 100):
        chunk = ids[i:i+100]
        body = {"inputs": [{"id": x} for x in chunk], "properties": properties}
        data = request_json(token, "POST",
                            f"/crm/v3/objects/{object_type}/batch/read", body=body)
        out.extend(data.get("results", []))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None,
                    help="cap number of companies (for testing)")
    ap.add_argument("--resume", action="store_true",
                    help="skip companies already in companies.json")
    args = ap.parse_args()

    token = load_token()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    companies_path = OUT_DIR / "companies.json"
    contacts_path = OUT_DIR / "contacts.json"
    summary_path = OUT_DIR / "summary.txt"

    existing = []
    existing_ids = set()
    if args.resume and companies_path.exists():
        existing = json.loads(companies_path.read_text())
        existing_ids = {c["id"] for c in existing}
        print(f"resume: {len(existing)} companies already on disk")

    company_props = ",".join(COMPANY_PROPS)
    associations = "contacts,notes,calls,emails,meetings,tasks"

    print("Fetching companies + association ids...")
    companies = list(existing)
    new_count = 0
    for c in paginate(token, "/crm/v3/objects/companies",
                      properties=company_props,
                      associations=associations,
                      limit=args.limit):
        if c["id"] in existing_ids:
            continue
        companies.append(c)
        new_count += 1
        if new_count and new_count % 200 == 0:
            print(f"  ...{new_count} new companies")
            companies_path.write_text(json.dumps(companies, indent=2))
    companies_path.write_text(json.dumps(companies, indent=2))
    print(f"  total: {len(companies)} companies ({new_count} new)")

    print("\nCollecting association ids per activity type...")
    assoc_ids = {k: set() for k in ACTIVITY_SPEC}
    for c in companies:
        assoc = c.get("associations", {}) or {}
        for kind in ACTIVITY_SPEC:
            for a in (assoc.get(kind, {}) or {}).get("results", []):
                if a.get("id"):
                    assoc_ids[kind].add(a["id"])
    for k, ids in assoc_ids.items():
        print(f"  {k:8s} {len(ids)}")

    print("\nBatch-fetching activity bodies...")
    activities = {}
    for kind, props in ACTIVITY_SPEC.items():
        ids = sorted(assoc_ids[kind])
        if not ids:
            activities[kind] = {}
            continue
        print(f"  {kind}: {len(ids)} records...")
        results = batch_read(token, kind, ids, props)
        activities[kind] = {r["id"]: r for r in results}

    print("\nStitching activities into each company...")
    for c in companies:
        embedded = []
        for kind in ACTIVITY_SPEC:
            for a in (c.get("associations", {}).get(kind, {}) or {}).get("results", []):
                rec = activities.get(kind, {}).get(a.get("id"))
                if rec:
                    embedded.append({"kind": kind, **rec})
        c["_activities"] = embedded
    companies_path.write_text(json.dumps(companies, indent=2))

    print("\nFetching contacts...")
    contacts = list(paginate(token, "/crm/v3/objects/contacts",
                             properties=",".join(CONTACT_PROPS),
                             associations="companies"))
    contacts_path.write_text(json.dumps(contacts, indent=2))
    print(f"  total: {len(contacts)} contacts")

    notes_total = sum(len(c["_activities"]) for c in companies)
    by_kind = {k: 0 for k in ACTIVITY_SPEC}
    for c in companies:
        for a in c["_activities"]:
            by_kind[a["kind"]] += 1
    with_domain = sum(1 for c in companies
                      if (c.get("properties") or {}).get("domain"))
    with_industry = sum(1 for c in companies
                        if (c.get("properties") or {}).get("industry"))

    summary = [
        f"Companies fetched: {len(companies)}",
        f"  with domain:    {with_domain}",
        f"  with industry:  {with_industry}",
        f"Activities embedded: {notes_total}",
    ] + [f"  {k:8s} {v}" for k, v in by_kind.items()] + [
        f"Contacts fetched: {len(contacts)}",
        "",
        "Next step: review out/hubspot/companies.json and run",
        "the classifier (Phase 4) to produce classification.csv.",
    ]
    summary_path.write_text("\n".join(summary) + "\n")
    print("\n" + "\n".join(summary))


if __name__ == "__main__":
    main()
