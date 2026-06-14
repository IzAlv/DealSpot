-- DealSpot — PostgreSQL 18 schema (MongoDB → PostgreSQL migration, Phase 1)
--
-- Modeling philosophy (per Phase-1 decision): HYBRID.
--   * Clean/fixed collections      -> typed columns (+ a `data jsonb` catch-all for stray keys).
--   * Schemaless documents          -> promote FK + queried fields to typed columns,
--                                      keep the arbitrary long tail in `data jsonb`.
--   * Nested trees / time-series    -> jsonb for the tree, real columns for what gets aggregated.
--
-- Invariants that preserve the frozen API contract (serialize_doc):
--   * `id`        : every row's PK is a fresh UUID; the API casts it to text -> matches old str(_id).
--   * `mongo_id`  : original 24-char ObjectId hex. The migration builds an old_id->new_uuid map
--                   keyed on this, remaps FK columns AND in-`data` references (see below), and
--                   stays idempotent. NEVER serialized.
--   * FK fields   : ON DELETE SET NULL — Mongo allowed dangling refs and never blocked deletes.
--   * `data jsonb`: holds every field NOT promoted to a column, so `$set`/`$unset`/unknown-keys
--                   round-trip exactly (an unset key is a key absent from `data`, not a NULL column).
--   * timestamps  : timestamptz; serialized with .isoformat() to match the old ISO strings.
--
-- Serializer contract (row -> JSON), reimplementing serialize_doc:
--   result = { **row.data, <each promoted column under its ORIGINAL camelCase key>,
--              "id": str(row.id) }   # promoted cols are authoritative; they are NOT duplicated
--   into `data`. Snake_case columns map back to camelCase keys, e.g.
--   seller_id->"sellerId", company_name->"companyName", invoice_number->"invoiceNumber".
--   Note: a promoted FK set to NULL serializes as key:null (present); a non-promoted field that
--   was $unset is absent. trades use key-absence for the long tail; events do a full $set and
--   emit promoted FKs as null. port_lineups daily reports emit NO `id` at all (see that table).
--
-- DECISION (PK strategy): fresh UUIDs. References that live INSIDE `data` are NOT covered by
-- column-level FK remap and MUST be remapped by the migration using the same old->new map.
-- Declared in-`data` reference paths (Phase 3 must remap, then Phase 5 must re-verify):
--   trades.data.vesselId                  -> vessels   (resolved server-side, email_sender.py:372)
--   trades.data.portVariations[].portId   -> ports     (resolved server-side, business_confirmation.py:206)
--   doc_instructions.data.consigneeBuyerId-> partners  (resolved server-side, doc_instructions.py:125)
--   doc_instructions.data.notifyBuyerId   -> partners  (resolved server-side, doc_instructions.py:127)
--   documents.trade_id (text column)      -> trades    (remap values that match a known trade)
--   trades.data.excludedDisports[] / excludedSurveyors[] : frontend-only selections, never
--       resolved server-side. Remap IF the stored values are ids (verify shape in Phase 3);
--       otherwise leave as-is. doc_instructions.data.agentId: denormalized alongside agentName/
--       agentEmail and not resolved by id server-side — remap only if id-shaped.
--   (bankIds is a request-time query param, not stored — no migration remap needed.)
--
-- Apply:  psql "$DATABASE_URL" -f backend/schema.sql

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- accelerates the ILIKE search that replaces $regex

-- gen_random_uuid() is in core (PG13+); no extension needed.

-- Shared trigger to maintain updated_at on tables that carry it.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- AUTH
-- ============================================================================
CREATE TABLE users (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mongo_id   text UNIQUE,
    username   text NOT NULL UNIQUE,
    password   text,                         -- bcrypt hash
    role       text NOT NULL DEFAULT 'user', -- admin | user | accountant
    name       text,
    email      text,
    whatsapp   text,
    mobile     text,
    status     text DEFAULT 'active',
    data       jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- REFERENCE DATA (small, mostly static)
-- ============================================================================
CREATE TABLE commodities (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mongo_id    text UNIQUE,
    name        text NOT NULL,
    code        text,
    "group"     text,
    hs_code     text,
    description text,
    specs       text,
    documents   jsonb,                       -- Optional[List[str]]
    data        jsonb NOT NULL DEFAULT '{}',
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE origins (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mongo_id   text UNIQUE,
    name       text NOT NULL,
    adjective  text,
    code       text,
    data       jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ports (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mongo_id     text UNIQUE,
    name         text NOT NULL,
    type         text DEFAULT 'loading',     -- loading | discharge
    country      text,
    country_code text,
    data         jsonb NOT NULL DEFAULT '{}',
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE surveyors (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mongo_id         text UNIQUE,
    name             text NOT NULL,
    contact          text,
    countries_served jsonb,                  -- array of strings
    data             jsonb NOT NULL DEFAULT '{}',
    created_at       timestamptz NOT NULL DEFAULT now()
);

-- loadport_agents and disport_agents share the DisportAgentCreate shape.
CREATE TABLE loadport_agents (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mongo_id   text UNIQUE,
    name       text NOT NULL,
    port       text,
    contact    text,
    email      text,
    tel        text,
    whatsapp   text,
    address    text,
    data       jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE disport_agents (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mongo_id   text UNIQUE,
    name       text NOT NULL,
    port       text,
    contact    text,
    email      text,
    tel        text,
    whatsapp   text,
    address    text,
    data       jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vessels (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mongo_id    text UNIQUE,
    name        text NOT NULL,               -- also looked up by exact name in email_sender
    imo_number  text,
    flag        text,
    built_year  integer,
    vessel_type text DEFAULT 'Bulk Carrier',
    data        jsonb NOT NULL DEFAULT '{}',  -- certificates[]
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- PARTNERS (~1,418 rows; schemaless; HubSpot-imported long tail in data)
-- ============================================================================
CREATE TABLE partners (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mongo_id       text UNIQUE,
    company_name   text NOT NULL,
    kind           text DEFAULT 'trading',   -- trading | service | network
    -- type is scalar string ("broker") for legacy/seed rows AND array (["buyer","co-broker"])
    -- for HubSpot rows. PRESERVE the original shape per-row — do NOT coerce to array.
    -- The route filter must match BOTH: (type = '"x"'::jsonb OR type @> '["x"]'::jsonb).
    type           jsonb,
    company_code   text,
    contact_person text,
    email          text,
    phone          text,
    company_domain text,
    hubspot_id     text,                      -- unique-when-present (partial index below)
    -- Long tail in data: address, city, country, whatsapp, tradeContacts,
    -- executionContacts, departments, origins, notes, notesTimeline,
    -- taxIdNo/taxOffice, website, linkedinUrl, industry, description, lifecycleStage, ...
    data           jsonb NOT NULL DEFAULT '{}',
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX partners_hubspot_id_key ON partners (hubspot_id) WHERE hubspot_id IS NOT NULL;
CREATE INDEX partners_kind_idx          ON partners (kind);
CREATE INDEX partners_type_gin          ON partners USING gin (type jsonb_path_ops);
CREATE INDEX partners_company_name_trgm ON partners USING gin (company_name gin_trgm_ops);
CREATE INDEX partners_data_gin          ON partners USING gin (data jsonb_path_ops);
-- Turkish-aware ordering (replaces pymongo Collation("tr")):
CREATE INDEX partners_company_name_tr   ON partners (company_name COLLATE "tr-TR-x-icu");
CREATE TRIGGER partners_set_updated_at BEFORE UPDATE ON partners
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- TRADES (core entity; ~169 fields; almost everything lives in data jsonb)
-- ============================================================================
CREATE TABLE trades (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mongo_id         text UNIQUE,
    status           text DEFAULT 'confirmation',
    -- Foreign keys (all four counterparties point at partners):
    seller_id        uuid REFERENCES partners(id)    ON DELETE SET NULL,
    buyer_id         uuid REFERENCES partners(id)    ON DELETE SET NULL,
    broker_id        uuid REFERENCES partners(id)    ON DELETE SET NULL,
    co_broker_id     uuid REFERENCES partners(id)    ON DELETE SET NULL,
    commodity_id     uuid REFERENCES commodities(id) ON DELETE SET NULL,
    origin_id        uuid REFERENCES origins(id)     ON DELETE SET NULL,
    loading_port_id  uuid REFERENCES ports(id)       ON DELETE SET NULL,
    discharge_port_id uuid REFERENCES ports(id)      ON DELETE SET NULL,
    base_port_id     uuid REFERENCES ports(id)       ON DELETE SET NULL,
    surveyor_id      uuid REFERENCES surveyors(id)   ON DELETE SET NULL,
    -- Everything else (cached *Name/*Code, prices, dates-as-strings, portVariations,
    -- *TradeContact/*ExecutionContact, draftDocuments, file paths, shortage*, swift*,
    -- blQuantity/blDate/blNumber, cropYear, exchangeRate, totalCommission, ...) -> data.
    data             jsonb NOT NULL DEFAULT '{}',
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trades_status_idx       ON trades (status);
CREATE INDEX trades_seller_idx       ON trades (seller_id);
CREATE INDEX trades_buyer_idx        ON trades (buyer_id);
CREATE INDEX trades_commodity_idx    ON trades (commodity_id);
CREATE INDEX trades_created_at_idx   ON trades (created_at DESC);
CREATE INDEX trades_data_gin         ON trades USING gin (data jsonb_path_ops);
CREATE TRIGGER trades_set_updated_at BEFORE UPDATE ON trades
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- ACCOUNTING
-- ============================================================================
CREATE TABLE invoices (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mongo_id       text UNIQUE,
    invoice_number text,
    vendor_name    text,
    vendor_code    text,
    amount         double precision,         -- BSON double; avoids Decimal/format drift in JSON
    currency       text DEFAULT 'USD',
    invoice_date   text DEFAULT '',           -- frontend stores dd/mm/yyyy strings
    due_date       text DEFAULT '',
    payment_date   text,
    category       text DEFAULT 'other',
    description    text,
    status         text DEFAULT 'pending',
    direction      text DEFAULT 'outgoing',
    trade_id       uuid REFERENCES trades(id) ON DELETE SET NULL,
    auto_generated boolean DEFAULT false,     -- queried with tradeId + autoGenerated + direction
    data           jsonb NOT NULL DEFAULT '{}',  -- invoiceFileName / invoiceFilePath
    created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invoices_trade_idx ON invoices (trade_id, auto_generated, direction);

CREATE TABLE bank_statements (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mongo_id         text UNIQUE,
    month            integer,
    year             integer,
    description      text,
    bank_account_id  text,
    file_name        text,
    stored_file_name text,
    data             jsonb NOT NULL DEFAULT '{}',
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz
);

-- bank_accounts: fully free-form (route takes a raw dict). Keep it all in data.
CREATE TABLE bank_accounts (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mongo_id   text UNIQUE,
    data       jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz
);

CREATE TABLE vendors (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mongo_id   text UNIQUE,
    name       text,                          -- sorted by name
    data       jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz
);

-- ============================================================================
-- DOCUMENTS / CARDS / EVENTS / NOTIFICATIONS / DOC-INSTRUCTIONS
-- ============================================================================
CREATE TABLE documents (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mongo_id    text UNIQUE,
    file_name   text,
    saved_name  text,
    file_url    text,
    file_size   bigint,
    doc_type    text DEFAULT 'other',
    doc_name    text,
    trade_id    text,                          -- frontend sends raw string; not enforced FK
    trade_ref   text,
    uploaded_by text,
    data        jsonb NOT NULL DEFAULT '{}',
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX documents_trade_idx ON documents (trade_id);

CREATE TABLE business_cards (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mongo_id    text UNIQUE,
    name        text,
    title       text,
    company     text,
    email       text,
    phone       text,
    mobile      text,
    website     text,
    address     text,
    city        text,
    country     text,
    keywords    jsonb,                         -- array of strings
    notes       text,
    image_url   text,
    uploaded_by text,
    data        jsonb NOT NULL DEFAULT '{}',
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz
);

CREATE TABLE events (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mongo_id         text UNIQUE,
    title            text NOT NULL,
    date             text NOT NULL,            -- frontend date string; sorted lexically
    date_to          text,
    type             text DEFAULT 'other',
    description      text,
    trade_id         uuid REFERENCES trades(id)   ON DELETE SET NULL,
    partner_id       uuid REFERENCES partners(id) ON DELETE SET NULL,
    payment_due_date text,
    data             jsonb NOT NULL DEFAULT '{}',
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mongo_id     text UNIQUE,
    type         text,
    message      text,
    entity_ref   text,
    username     text DEFAULT 'system',
    display_name text,
    read_by      jsonb NOT NULL DEFAULT '[]',  -- $addToSet of usernames
    data         jsonb NOT NULL DEFAULT '{}',
    created_at   timestamptz NOT NULL DEFAULT now()  -- range-queried (last 7 days)
);
CREATE INDEX notifications_created_at_idx ON notifications (created_at DESC);

CREATE TABLE doc_instructions (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mongo_id   text UNIQUE,
    trade_id   uuid REFERENCES trades(id) ON DELETE SET NULL,
    -- agent_*, surveyor, consignee*, notify*, requiredDocuments, etc. -> data
    data       jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz
);
CREATE INDEX doc_instructions_trade_idx ON doc_instructions (trade_id);

-- ============================================================================
-- APP CONFIG (key/value; e.g. active_url)
-- ============================================================================
CREATE TABLE app_config (
    id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key   text NOT NULL UNIQUE,
    value text
);

-- ============================================================================
-- MARKET DATA
-- ============================================================================
CREATE TABLE market_prices (
    id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mongo_id  text UNIQUE,
    symbol    text NOT NULL UNIQUE,           -- route upserts one row per symbol
    timestamp timestamptz,                     -- latest-per-symbol lookups order by this desc
    price     double precision,
    data      jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX market_prices_symbol_ts_idx ON market_prices (symbol, timestamp DESC);

CREATE TABLE turkish_exchange_prices (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mongo_id   text UNIQUE,
    exchange   text,                           -- KTB | GTB
    product    text,
    -- Manual-add rows carry `price`; scraped rows carry avgPrice/minPrice/maxPrice in `data`.
    -- The monthly aggregation reads avg(avgPrice)/min(minPrice)/max(maxPrice) from `data`.
    price      double precision,
    unit       text,
    date       text,                           -- 'DD.MM.YYYY'; monthly endpoint regex-matches month
    category   text DEFAULT '',
    data       jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX turkish_exchange_prices_date_idx ON turkish_exchange_prices (exchange, date DESC);

CREATE TABLE market_notes (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mongo_id   text UNIQUE,
    commodity  text,
    period     text,                           -- daily | monthly | yearly
    content    text,
    tags       jsonb DEFAULT '[]',
    data       jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX market_notes_created_at_idx ON market_notes (created_at DESC);

CREATE TABLE tmo_tenders (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mongo_id              text UNIQUE,
    tender_date           text,
    commodity             text,
    total_quantity        double precision DEFAULT 0,
    shipment_period_start text DEFAULT '',
    shipment_period_end   text DEFAULT '',
    status                text DEFAULT 'open', -- open | closed | awarded
    results               jsonb DEFAULT '[]',  -- list of TMOTenderResult dicts
    data                  jsonb NOT NULL DEFAULT '{}',
    created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE telegram_channels (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mongo_id    text UNIQUE,
    name        text,
    channel_id  text,
    description text DEFAULT '',
    is_active   boolean DEFAULT true,
    data        jsonb NOT NULL DEFAULT '{}',
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE market_commodities (
    id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mongo_id text UNIQUE,
    name     text,
    symbol   text,
    data     jsonb NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX market_commodities_symbol_key ON market_commodities (symbol) WHERE symbol IS NOT NULL;

-- ============================================================================
-- PORT LINE-UPS (nested report -> ports[] -> vessels[])
-- NOTE: get_report/get_monthly return find_one(..., {"_id":0}) — NO `id` field.
-- The route serializer for port_lineups must omit id to preserve that contract.
-- ============================================================================
CREATE TABLE port_lineups (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mongo_id    text UNIQUE,
    report_date text NOT NULL,                 -- 'DD.MM.YYYY'; distinct + lookup key
    ports       jsonb NOT NULL DEFAULT '[]',   -- [{portName, vessels:[...]}]
    uploaded_at timestamptz,
    uploaded_by text
);
CREATE INDEX port_lineups_report_date_idx ON port_lineups (report_date);

CREATE TABLE monthly_lineups (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mongo_id         text UNIQUE,
    file_name        text,
    stored_file_name text,
    ports            jsonb DEFAULT '[]',
    total_vessels    integer,
    total_ports      integer,
    uploaded_at      timestamptz,
    uploaded_by      text,
    data             jsonb NOT NULL DEFAULT '{}'  -- legacy 'sheets' format
);

COMMIT;
