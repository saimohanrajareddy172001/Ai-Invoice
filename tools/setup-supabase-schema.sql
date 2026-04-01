-- ============================================================
-- Restaurant Invoice Automation — Supabase Schema
-- ============================================================
-- Instructions:
--   1. Go to your Supabase project → SQL Editor
--   2. Paste this entire file and click Run
--   3. All tables will be created in the public schema
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ── restaurants ──────────────────────────────────────────────
-- One row per client. Stores all credentials and config.
-- Credentials should be encrypted at rest (Supabase handles this at the
-- storage level, but treat these as sensitive).

CREATE TABLE IF NOT EXISTS restaurants (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name             TEXT        NOT NULL,
    rd_email         TEXT,                     -- Restaurant Depot login email
    rd_password      TEXT,                     -- Restaurant Depot password
    rd_store_number  TEXT,                     -- e.g. "79" — filters receipts to one store
    drive_folder_id  TEXT,                     -- Subfolder ID in YOUR central Google Drive
    vendor           TEXT        DEFAULT 'Restaurant Depot',
    is_active        BOOLEAN     DEFAULT true,
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now()
    -- NOTE: No per-client OAuth or sheet_id columns.
    -- Drive uploads use YOUR single central OAuth credential (stored in Apify actor input).
    -- Client output is via Metabase dashboard connected to Supabase, not Google Sheets.
);

-- Auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER restaurants_updated_at
    BEFORE UPDATE ON restaurants
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── vendor_prompts ────────────────────────────────────────────
-- Per-vendor AI extraction prompts. If a restaurant has no override,
-- n8n uses the default row (restaurant_id IS NULL).

CREATE TABLE IF NOT EXISTS vendor_prompts (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor         TEXT        NOT NULL,       -- e.g. "Restaurant Depot", "Sysco", "US Foods"
    restaurant_id  UUID        REFERENCES restaurants(id) ON DELETE CASCADE,
    prompt_text    TEXT        NOT NULL,       -- Full system prompt for OpenAI
    is_default     BOOLEAN     DEFAULT false,  -- true = fallback for this vendor
    created_at     TIMESTAMPTZ DEFAULT now(),
    UNIQUE(vendor, restaurant_id)              -- one override per vendor per client
);


-- ── invoice_files ─────────────────────────────────────────────
-- One row per downloaded XLSX file. Acts as the processing queue.
-- status lifecycle: pending → processing → done | failed | dead

CREATE TABLE IF NOT EXISTS invoice_files (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id   UUID        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    drive_file_id   TEXT        UNIQUE NOT NULL,  -- Google Drive file ID (dedup key)
    filename        TEXT        NOT NULL,
    file_date       DATE,                          -- parsed from filename
    file_total      NUMERIC(10,2),                 -- parsed from filename (e.g. $1665-64 → 1665.64)
    status          TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','processing','done','failed','dead')),
    retry_count     INT         NOT NULL DEFAULT 0,
    error_message   TEXT,
    uploaded_at     TIMESTAMPTZ DEFAULT now(),
    processing_started_at TIMESTAMPTZ,
    processed_at    TIMESTAMPTZ
);

-- Index for the queue poll query: WHERE status='pending' ORDER BY uploaded_at
CREATE INDEX IF NOT EXISTS idx_invoice_files_queue
    ON invoice_files (status, uploaded_at)
    WHERE status = 'pending';

-- Index for staleness monitoring: per restaurant, recent files
CREATE INDEX IF NOT EXISTS idx_invoice_files_restaurant_date
    ON invoice_files (restaurant_id, uploaded_at DESC);


-- ── invoice_headers ───────────────────────────────────────────
-- One row per invoice (extracted by AI). Header-level data.

CREATE TABLE IF NOT EXISTS invoice_headers (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id   UUID        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    file_id         UUID        NOT NULL REFERENCES invoice_files(id) ON DELETE CASCADE,
    invoice_number  TEXT,
    invoice_date    DATE,
    vendor          TEXT,
    subtotal        NUMERIC(10,2),
    tax             NUMERIC(10,2),
    total           NUMERIC(10,2),
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(restaurant_id, invoice_number)          -- prevents re-processing same invoice
);


-- ── invoice_lines ─────────────────────────────────────────────
-- One row per line item. The main data table.

CREATE TABLE IF NOT EXISTS invoice_lines (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    header_id       UUID        NOT NULL REFERENCES invoice_headers(id) ON DELETE CASCADE,
    restaurant_id   UUID        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    invoice_date    DATE,                          -- denormalized for fast querying
    item_name       TEXT,
    category        TEXT,
    unit_qty        NUMERIC,
    case_qty        NUMERIC,
    unit_price      NUMERIC(10,2),
    total           NUMERIC(10,2),
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Primary query pattern: client's items in a date range
CREATE INDEX IF NOT EXISTS idx_invoice_lines_restaurant_date
    ON invoice_lines (restaurant_id, invoice_date DESC);


-- ── processing_logs ───────────────────────────────────────────
-- Audit trail for every stage of processing. Never deleted.

CREATE TABLE IF NOT EXISTS processing_logs (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id         UUID        REFERENCES invoice_files(id) ON DELETE SET NULL,
    restaurant_id   UUID        REFERENCES restaurants(id) ON DELETE SET NULL,
    stage           TEXT        NOT NULL,   -- intake | extraction | validation | storage | monitoring
    status          TEXT        NOT NULL    CHECK (status IN ('success','warning','error')),
    message         TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Index for monitoring dashboard
CREATE INDEX IF NOT EXISTS idx_processing_logs_created
    ON processing_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_processing_logs_status
    ON processing_logs (status, created_at DESC)
    WHERE status IN ('warning','error');


-- ── Verification ──────────────────────────────────────────────
-- After running, you should see 5 tables and 1 function:

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('restaurants','vendor_prompts','invoice_files','invoice_headers','invoice_lines','processing_logs')
ORDER BY table_name;
