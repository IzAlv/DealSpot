#!/usr/bin/env python3
"""
HubSpot -> DealSpot importer.

Reads:
    out/hubspot/companies.json    (raw HubSpot export)
    out/hubspot/contacts.json     (raw HubSpot contacts)
    out/hubspot/classification.csv (with user overrides in userKind/userType)

Builds a partner payload per row:
    - HubSpot properties     -> companyName, companyDomain, website,
                                linkedinUrl, industry, description,
                                lifecycleStage, phone, address, city,
                                country, hubspotId
    - classification.csv     -> kind + type[]
    - _activities (HubSpot)  -> notesTimeline[] (HTML stripped)
    - contacts.json          -> tradeContacts[] / executionContacts[]
                                (split by job-title keywords)

Dedup against existing DealSpot partners:
    1. hubspotId match           -> skip (idempotent re-run)
    2. companyDomain match       -> dedup_review.csv (no auto-merge)
    3. fuzzy companyName >= 92   -> dedup_review.csv
    4. otherwise insert via POST /api/partners

Required env (or .env.hubspot, gitignored):
    DEALSPOT_API_URL    e.g. https://brok-ai-production-6eb2.up.railway.app
    DEALSPOT_USERNAME   admin username
    DEALSPOT_PASSWORD   admin password

Usage:
    # Validate plan without touching the DB
    python scripts/hubspot_import.py --dry-run

    # Import for real (after reviewing import_plan.json)
    python scripts/hubspot_import.py

    # Test on a handful first
    python scripts/hubspot_import.py --limit 10
"""

import argparse
import csv
import html as _html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out" / "hubspot"
ENV_FILE = ROOT / ".env.hubspot"

EXECUTION_KEYWORDS = ("logistics", "execution", "shipping", "operations", "ops",
                      "documentation", "vessel", "freight")
MAX_NOTE_LEN = 4000  # cap per timeline entry (emails get huge with signatures)
FUZZY_THRESHOLD = 92


class _TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)

    def text(self):
        return " ".join(p.strip() for p in self.parts if p.strip())


def strip_html(s):
    if not s:
        return ""
    p = _TextExtractor()
    try:
        p.feed(s)
        return _html.unescape(p.text()).strip()
    except Exception:
        return re.sub(r"<[^>]+>", " ", s).strip()


def load_env_file():
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


def http_json(method, url, body=None, headers=None):
    headers = dict(headers or {})
    headers.setdefault("Accept", "application/json")
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, method=method, data=data, headers=headers)
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code in (429, 502, 503, 504):
                time.sleep(2 ** attempt)
                continue
            body_msg = e.read().decode(errors="replace")[:500]
            raise RuntimeError(f"HTTP {e.code} {method} {url}: {body_msg}")
        except urllib.error.URLError:
            time.sleep(2 ** attempt)
    raise RuntimeError(f"failed after retries: {method} {url}")


def login(api_url, username, password):
    res = http_json("POST", f"{api_url.rstrip('/')}/api/auth/login",
                    body={"username": username, "password": password})
    token = res.get("token") or res.get("access_token")
    if not token:
        raise RuntimeError(f"login response missing token: {res}")
    return token


def normalize_text(s):
    return re.sub(r"\s+", " ", (s or "").lower()).strip()


def fuzzy_score(a, b):
    """Token-set Jaccard * 100, with a small length penalty."""
    A = set(normalize_text(a).split())
    B = set(normalize_text(b).split())
    if not A or not B:
        return 0
    return int(100 * len(A & B) / len(A | B))


def activity_to_note(a):
    p = a.get("properties") or {}
    kind = a.get("kind") or "note"
    ts = p.get("hs_timestamp") or p.get("hs_createdate")
    parts = []
    if kind == "notes":
        parts.append(strip_html(p.get("hs_note_body")))
    elif kind == "calls":
        if p.get("hs_call_title"):
            parts.append(p["hs_call_title"])
        body = strip_html(p.get("hs_call_body"))
        if body:
            parts.append(body)
        if p.get("hs_call_direction"):
            parts.append(f"[{p['hs_call_direction']}]")
    elif kind == "emails":
        if p.get("hs_email_subject"):
            parts.append(f"Subject: {p['hs_email_subject']}")
        text = p.get("hs_email_text") or strip_html(p.get("hs_email_html"))
        if text:
            parts.append(text)
        if p.get("hs_email_direction"):
            parts.append(f"[{p['hs_email_direction']}]")
    elif kind == "meetings":
        if p.get("hs_meeting_title"):
            parts.append(p["hs_meeting_title"])
        body = strip_html(p.get("hs_meeting_body"))
        if body:
            parts.append(body)
    elif kind == "tasks":
        if p.get("hs_task_subject"):
            parts.append(p["hs_task_subject"])
        body = strip_html(p.get("hs_task_body"))
        if body:
            parts.append(body)
    text = "\n".join(s for s in parts if s).strip()
    if not text:
        return None
    if len(text) > MAX_NOTE_LEN:
        text = text[:MAX_NOTE_LEN] + "\n\n[...truncated]"
    return {
        "ts": ts,
        "source": kind.rstrip("s"),
        "author": p.get("hubspot_owner_id") or "",
        "text": text,
    }


def build_contact_map(contacts):
    by_company = {}
    for ct in contacts:
        props = ct.get("properties") or {}
        ids = {a["id"] for a in
               ((ct.get("associations") or {}).get("companies") or {}).get("results", [])
               if a.get("id")}
        if not ids:
            continue
        full = f"{props.get('firstname') or ''} {props.get('lastname') or ''}".strip()
        email = props.get("email") or ""
        if not (full or email):
            continue
        entry = {
            "name": full or email,
            "email": email,
            "phone": props.get("phone") or props.get("mobilephone") or "",
            "jobtitle": props.get("jobtitle") or "",
        }
        for cid in ids:
            by_company.setdefault(cid, []).append(entry)
    return by_company


def build_payload(row, company, contacts_for_co):
    props = company.get("properties") or {}
    user_kind = (row.get("userKind") or "").strip().lower()
    user_type = (row.get("userType") or "").strip().lower()
    kind = user_kind or row["suggestedKind"]
    type_ = user_type or row["suggestedType"]

    timeline = [activity_to_note(a) for a in (company.get("_activities") or [])]
    timeline = [t for t in timeline if t]
    timeline.sort(key=lambda t: t.get("ts") or "")

    trade_contacts, exec_contacts = [], []
    for c in contacts_for_co:
        jt = (c.get("jobtitle") or "").lower()
        target = exec_contacts if any(k in jt for k in EXECUTION_KEYWORDS) else trade_contacts
        target.append({"name": c["name"], "email": c["email"], "phone": c["phone"]})

    payload = {
        "companyName": row["companyName"] or "Unknown",
        "kind": kind,
        "type": [type_] if type_ and type_ != "skip" else [],
        "companyDomain": (props.get("domain") or "").strip().lower() or None,
        "website": props.get("website") or None,
        "linkedinUrl": props.get("linkedin_company_page") or None,
        "industry": props.get("industry") or None,
        "description": props.get("description") or None,
        "hubspotId": row["hubspotId"],
        "lifecycleStage": props.get("lifecyclestage") or None,
        "phone": props.get("phone") or None,
        "address": props.get("address") or None,
        "city": props.get("city") or None,
        "country": props.get("country") or None,
        "tradeContacts": trade_contacts,
        "executionContacts": exec_contacts,
        "notesTimeline": timeline,
    }
    # Drop None/empty (but keep companyName even if blank-but-required)
    cleaned = {k: v for k, v in payload.items()
               if v not in (None, "", []) or k == "companyName"}
    return cleaned


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true",
                    help="don't POST; write planned actions to import_plan.json")
    ap.add_argument("--limit", type=int, default=None,
                    help="cap rows considered (for testing)")
    args = ap.parse_args()

    load_env_file()
    api_url = os.environ.get("DEALSPOT_API_URL")
    username = os.environ.get("DEALSPOT_USERNAME")
    password = os.environ.get("DEALSPOT_PASSWORD")

    if not args.dry_run and not (api_url and username and password):
        sys.exit("Set DEALSPOT_API_URL, DEALSPOT_USERNAME, DEALSPOT_PASSWORD "
                 "(or run with --dry-run).")

    for required in ("companies.json", "contacts.json", "classification.csv"):
        if not (OUT / required).exists():
            sys.exit(f"missing out/hubspot/{required}")

    companies = json.loads((OUT / "companies.json").read_text())
    contacts = json.loads((OUT / "contacts.json").read_text())
    by_hubspot_id = {c["id"]: c for c in companies}
    class_rows = list(csv.DictReader((OUT / "classification.csv").open()))
    contacts_by_company = build_contact_map(contacts)

    # Existing partners (for dedup) — only when we have a live API
    existing_partners = []
    existing_by_hubspot = {}
    existing_by_domain = {}
    token = None
    if not args.dry_run:
        token = login(api_url, username, password)
        existing_partners = http_json("GET", f"{api_url.rstrip('/')}/api/partners",
                                       headers={"Authorization": f"Bearer {token}"})
        for p in existing_partners:
            if p.get("hubspotId"):
                existing_by_hubspot[p["hubspotId"]] = p
            if p.get("companyDomain"):
                existing_by_domain[p["companyDomain"].lower()] = p

    plan = []
    dedup_review = []
    skipped_existing = 0
    skipped_marked = 0
    considered = 0

    for row in class_rows:
        if args.limit is not None and considered >= args.limit:
            break
        considered += 1

        kind = ((row.get("userKind") or "").strip().lower()
                or row["suggestedKind"])
        if kind == "skip":
            skipped_marked += 1
            continue

        hubspot_id = row["hubspotId"]
        if hubspot_id in existing_by_hubspot:
            skipped_existing += 1
            continue

        company = by_hubspot_id.get(hubspot_id)
        if not company:
            continue

        props = company.get("properties") or {}
        domain = (props.get("domain") or "").strip().lower()
        if domain and domain in existing_by_domain:
            dedup_review.append({
                "hubspotId": hubspot_id,
                "hubspotName": row["companyName"],
                "matchedPartnerId": existing_by_domain[domain].get("id"),
                "matchedPartnerName": existing_by_domain[domain].get("companyName"),
                "matchType": "domain",
                "score": 100,
            })
            continue

        best_score, best_partner = 0, None
        for p in existing_partners:
            s = fuzzy_score(row["companyName"], p.get("companyName"))
            if s > best_score:
                best_score, best_partner = s, p
        if best_score >= FUZZY_THRESHOLD:
            dedup_review.append({
                "hubspotId": hubspot_id,
                "hubspotName": row["companyName"],
                "matchedPartnerId": best_partner.get("id") if best_partner else None,
                "matchedPartnerName": best_partner.get("companyName") if best_partner else None,
                "matchType": "name_fuzzy",
                "score": best_score,
            })
            continue

        plan.append(build_payload(row, company, contacts_by_company.get(hubspot_id, [])))

    (OUT / "import_plan.json").write_text(json.dumps(plan, indent=2))
    if dedup_review:
        with (OUT / "dedup_review.csv").open("w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(dedup_review[0].keys()))
            w.writeheader()
            w.writerows(dedup_review)

    print(f"Considered:  {considered}")
    print(f"  to insert: {len(plan)}")
    print(f"  needs review (dedup): {len(dedup_review)}")
    print(f"  already in DealSpot:  {skipped_existing}")
    print(f"  marked skip:          {skipped_marked}")

    if args.dry_run:
        print()
        print("Dry run complete.")
        print(f"  inspect out/hubspot/import_plan.json")
        if dedup_review:
            print(f"  resolve out/hubspot/dedup_review.csv")
        return

    headers = {"Authorization": f"Bearer {token}"}
    inserted, failed = [], []
    for i, partner in enumerate(plan, 1):
        try:
            res = http_json("POST", f"{api_url.rstrip('/')}/api/partners",
                            body=partner, headers=headers)
            inserted.append({"id": res.get("id"), "name": partner["companyName"]})
        except Exception as e:
            failed.append({"name": partner["companyName"], "error": str(e)[:300]})
        if i % 25 == 0:
            print(f"  imported {i}/{len(plan)} (failed so far: {len(failed)})")

    report = {
        "inserted": len(inserted),
        "failed": len(failed),
        "needs_review": len(dedup_review),
        "skipped_existing": skipped_existing,
        "skipped_marked": skipped_marked,
        "failures": failed,
    }
    (OUT / "import_report.json").write_text(json.dumps(report, indent=2))
    print()
    print(json.dumps({k: report[k] for k in
                      ("inserted", "failed", "needs_review",
                       "skipped_existing", "skipped_marked")}, indent=2))
    if failed:
        print(f"\nFailures recorded in out/hubspot/import_report.json")


if __name__ == "__main__":
    main()
