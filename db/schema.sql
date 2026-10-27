-- =============================================================================
-- AP Portal database schema
-- PostgreSQL 14 or later.
--
-- Covers the screens built so far:
--   Sign in, forgot / reset password ..... users, roles, user_sessions, password_reset_tokens
--   Invoice dashboard ..................... invoices + views v_dashboard_status_summary,
--                                           v_dashboard_aging, v_invoice_list
--   Invoice details panel ................. invoices, invoice_lines, invoice_match_results,
--                                           invoice_approval_steps, invoice_holds,
--                                           invoice_rejections, payments, invoice_documents,
--                                           invoice_events (audit trail)
--   Data entry ............................ invoices, invoice_lines, reference tables,
--                                           function submit_invoice()
--   Approve with comments ................. invoice_approval_steps, function approve_invoice()
--
-- Run:  psql -d <database> -f db/schema.sql
-- Everything lives in the "ap" schema. Money is numeric(14,2); never float.
-- =============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS ap;
SET search_path = ap, public;

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------

CREATE TYPE user_status          AS ENUM ('active', 'locked', 'disabled');
CREATE TYPE vendor_status        AS ENUM ('pending_verification', 'active', 'blocked');
CREATE TYPE matching_type        AS ENUM ('three_way', 'two_way', 'non_po');
CREATE TYPE payment_method       AS ENUM ('ach', 'wire', 'check');
CREATE TYPE po_status            AS ENUM ('open', 'partially_received', 'received', 'closed', 'cancelled');
CREATE TYPE intake_channel       AS ENUM ('email', 'supplier_portal', 'edi', 'manual');
CREATE TYPE invoice_status       AS ENUM ('received', 'pending_approval', 'approved', 'scheduled',
                                          'on_hold', 'paid', 'rejected');
CREATE TYPE match_result         AS ENUM ('ok', 'variance', 'missing', 'duplicate', 'pending', 'not_applicable');
CREATE TYPE approval_step_status AS ENUM ('not_started', 'waiting', 'approved', 'rejected', 'skipped');
CREATE TYPE hold_type            AS ENUM ('price_variance', 'quantity_variance', 'missing_receipt',
                                          'possible_duplicate', 'vendor_mismatch', 'tax_variance', 'other');
CREATE TYPE payment_run_status   AS ENUM ('draft', 'scheduled', 'sent', 'completed', 'cancelled');
CREATE TYPE payment_status       AS ENUM ('scheduled', 'sent', 'paid', 'failed', 'cancelled');
CREATE TYPE invoice_event_type   AS ENUM ('received', 'captured', 'updated', 'submitted', 'approved',
                                          'rejected', 'hold_placed', 'hold_released',
                                          'payment_scheduled', 'paid', 'remittance_sent', 'comment');

-- Keeps updated_at current on every UPDATE.
CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- Users, roles and sign-in  (Sign in, Forgot password, Reset password)
-- -----------------------------------------------------------------------------

CREATE TABLE roles (
  code        text PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  description text
);

CREATE TABLE users (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email               text NOT NULL CHECK (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  full_name           text NOT NULL CHECK (length(btrim(full_name)) > 0),
  -- Store a slow, salted hash (argon2id or bcrypt), never the password.
  password_hash       text NOT NULL,
  password_changed_at timestamptz,
  status              user_status NOT NULL DEFAULT 'active',
  failed_login_count  integer NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  locked_until        timestamptz,
  last_login_at       timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
-- Emails are unique regardless of case.
CREATE UNIQUE INDEX uq_users_email ON users (lower(email));
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_roles (
  user_id    bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role_code  text   NOT NULL REFERENCES roles (code),
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by bigint REFERENCES users (id),
  PRIMARY KEY (user_id, role_code)
);

-- "Keep me signed in" = remember_me with a longer expiry.
CREATE TABLE user_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash   bytea NOT NULL UNIQUE,          -- hash of the cookie value, never the value itself
  remember_me  boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,                    -- set on sign out
  ip_address   inet,
  user_agent   text,
  CHECK (expires_at > created_at)
);
CREATE INDEX ix_user_sessions_user ON user_sessions (user_id) WHERE revoked_at IS NULL;

-- Single-use, 30-minute reset links.
CREATE TABLE password_reset_tokens (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash   bytea NOT NULL UNIQUE,
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
  used_at      timestamptz,
  requested_ip inet,
  CHECK (expires_at > requested_at),
  CHECK (used_at IS NULL OR used_at <= expires_at)
);
CREATE INDEX ix_password_reset_tokens_user ON password_reset_tokens (user_id);

-- -----------------------------------------------------------------------------
-- Reference data  (dropdowns on the data entry page)
-- -----------------------------------------------------------------------------

CREATE TABLE currencies (
  code        char(3) PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$'),
  name        text NOT NULL,
  minor_units smallint NOT NULL DEFAULT 2 CHECK (minor_units BETWEEN 0 AND 4)
);

-- e.g. 'NET30' = Net 30; '2_10_NET30' = 2% off if paid within 10 days, otherwise net 30.
CREATE TABLE payment_terms (
  code             text PRIMARY KEY,
  label            text NOT NULL UNIQUE,
  net_days         integer NOT NULL CHECK (net_days >= 0),
  discount_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent < 100),
  discount_days    integer CHECK (discount_days >= 0),
  CHECK ((discount_percent = 0) = (discount_days IS NULL)),
  CHECK (discount_days IS NULL OR discount_days < net_days)
);

CREATE TABLE gl_accounts (
  code      text PRIMARY KEY CHECK (code ~ '^\d{4}$'),
  name      text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE cost_centers (
  code          text PRIMARY KEY CHECK (code ~ '^CC-\d{3}$'),
  name          text NOT NULL,
  owner_user_id bigint REFERENCES users (id),   -- the budget owner who approves first
  is_active     boolean NOT NULL DEFAULT true
);

-- -----------------------------------------------------------------------------
-- Vendor master
-- -----------------------------------------------------------------------------

CREATE TABLE vendors (
  id                         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vendor_code                text NOT NULL UNIQUE CHECK (vendor_code ~ '^V-\d{4,}$'),
  name                       text NOT NULL,
  category                   text,
  status                     vendor_status NOT NULL DEFAULT 'pending_verification',
  matching_type              matching_type NOT NULL DEFAULT 'two_way',
  default_terms_code         text NOT NULL REFERENCES payment_terms (code),
  default_gl_code            text REFERENCES gl_accounts (code),
  default_cost_center_code   text REFERENCES cost_centers (code),
  payment_method             payment_method NOT NULL DEFAULT 'ach',
  billing_email              text CHECK (billing_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  -- Encrypted by the application (e.g. with a KMS key); only the last 4 digits are shown.
  tax_id_encrypted           bytea,
  tax_id_last4               char(4),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_vendors_name ON vendors (lower(name));
CREATE TRIGGER trg_vendors_updated_at BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Bank details change only here (never from data entry), after a call-back check.
-- Old accounts are retired, not edited, so the history of where money went is kept.
CREATE TABLE vendor_bank_accounts (
  id                       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vendor_id                bigint NOT NULL REFERENCES vendors (id),
  bank_name                text NOT NULL,
  routing_number           text NOT NULL,
  account_number_encrypted bytea NOT NULL,
  account_last4            char(4) NOT NULL CHECK (account_last4 ~ '^\d{4}$'),
  is_primary               boolean NOT NULL DEFAULT false,
  verification_method      text CHECK (verification_method IN ('call_back', 'micro_deposit')),
  verified_at              timestamptz,
  verified_by              bigint REFERENCES users (id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by               bigint REFERENCES users (id),
  retired_at               timestamptz,
  CHECK ((verified_at IS NULL) = (verified_by IS NULL)),
  -- A primary account must be verified, and the verifier can't be the person who added it.
  CHECK (NOT is_primary OR verified_at IS NOT NULL),
  CHECK (verified_by IS NULL OR created_by IS NULL OR verified_by <> created_by)
);
CREATE UNIQUE INDEX uq_vendor_primary_bank ON vendor_bank_accounts (vendor_id)
  WHERE is_primary AND retired_at IS NULL;

-- The company's own accounts that payments are made from.
CREATE TABLE company_bank_accounts (
  id                       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name                     text NOT NULL UNIQUE,      -- e.g. 'Operating account'
  bank_name                text NOT NULL,
  account_number_encrypted bytea NOT NULL,
  account_last4            char(4) NOT NULL CHECK (account_last4 ~ '^\d{4}$'),
  currency_code            char(3) NOT NULL REFERENCES currencies (code),
  is_active                boolean NOT NULL DEFAULT true
);

-- -----------------------------------------------------------------------------
-- Purchasing  (2-way and 3-way matching)
-- -----------------------------------------------------------------------------

CREATE TABLE purchase_orders (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  po_number     text NOT NULL UNIQUE CHECK (po_number ~ '^PO-\d{4,}$'),
  vendor_id     bigint NOT NULL REFERENCES vendors (id),
  status        po_status NOT NULL DEFAULT 'open',
  currency_code char(3) NOT NULL REFERENCES currencies (code) DEFAULT 'USD',
  ordered_on    date NOT NULL,
  buyer_user_id bigint REFERENCES users (id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_purchase_orders_vendor ON purchase_orders (vendor_id);

CREATE TABLE purchase_order_lines (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  purchase_order_id bigint NOT NULL REFERENCES purchase_orders (id) ON DELETE CASCADE,
  line_no          smallint NOT NULL CHECK (line_no > 0),
  description      text NOT NULL,
  quantity         numeric(14,4) NOT NULL CHECK (quantity > 0),
  unit_price       numeric(14,4) NOT NULL CHECK (unit_price >= 0),
  gl_code          text REFERENCES gl_accounts (code),
  cost_center_code text REFERENCES cost_centers (code),
  UNIQUE (purchase_order_id, line_no)
);

CREATE TABLE goods_receipts (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  receipt_number    text NOT NULL UNIQUE CHECK (receipt_number ~ '^GR-\d{4,}$'),
  purchase_order_id bigint NOT NULL REFERENCES purchase_orders (id),
  received_on       date NOT NULL,
  received_by       bigint REFERENCES users (id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE goods_receipt_lines (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  goods_receipt_id       bigint NOT NULL REFERENCES goods_receipts (id) ON DELETE CASCADE,
  purchase_order_line_id bigint NOT NULL REFERENCES purchase_order_lines (id),
  quantity_received      numeric(14,4) NOT NULL CHECK (quantity_received > 0)
);

-- -----------------------------------------------------------------------------
-- Invoices  (dashboard, details panel, data entry)
-- -----------------------------------------------------------------------------

CREATE TABLE invoices (
  id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  doc_number              text NOT NULL UNIQUE CHECK (doc_number ~ '^INV-\d+$'),  -- our reference, never changes
  vendor_id               bigint NOT NULL REFERENCES vendors (id),
  supplier_invoice_number text NOT NULL CHECK (supplier_invoice_number ~ '^[A-Za-z0-9][A-Za-z0-9\-/.]{1,29}$'),
  invoice_date            date NOT NULL,
  due_date                date NOT NULL,
  payment_terms_code      text NOT NULL REFERENCES payment_terms (code),
  purchase_order_id       bigint REFERENCES purchase_orders (id),
  currency_code           char(3) NOT NULL REFERENCES currencies (code) DEFAULT 'USD',
  subtotal_amount         numeric(14,2) NOT NULL DEFAULT 0 CHECK (subtotal_amount >= 0),
  tax_amount              numeric(14,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  shipping_amount         numeric(14,2) NOT NULL DEFAULT 0 CHECK (shipping_amount >= 0),
  total_amount            numeric(14,2) NOT NULL CHECK (total_amount > 0),  -- as printed on the invoice
  status                  invoice_status NOT NULL DEFAULT 'received',
  intake_channel          intake_channel NOT NULL,
  received_at             timestamptz NOT NULL DEFAULT now(),
  notes                   text CHECK (length(notes) <= 500),                -- notes for the approver
  submitted_at            timestamptz,
  submitted_by            bigint REFERENCES users (id),
  approved_at             timestamptz,
  row_version             integer NOT NULL DEFAULT 1,   -- optimistic locking for data entry saves
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  updated_by              bigint REFERENCES users (id),
  CHECK (due_date >= invoice_date),
  CHECK ((submitted_at IS NULL) = (submitted_by IS NULL)),
  -- Captured invoices may not balance yet; anything past "received" must.
  CONSTRAINT ck_invoices_balanced CHECK (
    status = 'received' OR subtotal_amount + tax_amount + shipping_amount = total_amount
  ),
  CONSTRAINT ck_invoices_approved_at CHECK (
    (status IN ('approved', 'scheduled', 'paid')) <= (approved_at IS NOT NULL)
  )
);
-- Duplicate check: one live invoice per vendor and supplier invoice number.
CREATE UNIQUE INDEX uq_invoices_vendor_supplier_number
  ON invoices (vendor_id, lower(supplier_invoice_number)) WHERE status <> 'rejected';
CREATE INDEX ix_invoices_status_due ON invoices (status, due_date);
CREATE INDEX ix_invoices_vendor ON invoices (vendor_id);
CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE invoice_lines (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id             bigint NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  line_no                smallint NOT NULL CHECK (line_no > 0),
  description            text NOT NULL DEFAULT '',
  quantity               numeric(14,4) NOT NULL CHECK (quantity > 0),
  unit_price             numeric(14,4) NOT NULL CHECK (unit_price >= 0),
  amount                 numeric(14,2) GENERATED ALWAYS AS (round(quantity * unit_price, 2)) STORED,
  -- Null until the AP processor codes the line on the data entry page.
  gl_code                text REFERENCES gl_accounts (code),
  cost_center_code       text REFERENCES cost_centers (code),
  purchase_order_line_id bigint REFERENCES purchase_order_lines (id),
  UNIQUE (invoice_id, line_no)
);

-- The original document (the "Original invoice" beside the data entry form).
CREATE TABLE invoice_documents (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id   bigint NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  file_name    text NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('application/pdf', 'image/png', 'image/jpeg', 'image/tiff')),
  size_bytes   bigint NOT NULL CHECK (size_bytes > 0),
  storage_key  text NOT NULL UNIQUE,     -- object storage path; the file itself is not in the database
  sha256       bytea NOT NULL CHECK (length(sha256) = 32),
  is_original  boolean NOT NULL DEFAULT true,
  uploaded_at  timestamptz NOT NULL DEFAULT now(),
  uploaded_by  bigint REFERENCES users (id)   -- null = received automatically
);
CREATE INDEX ix_invoice_documents_invoice ON invoice_documents (invoice_id);

-- Latest 2-way / 3-way match result (the "3-way match" section of the details panel).
CREATE TABLE invoice_match_results (
  invoice_id        bigint PRIMARY KEY REFERENCES invoices (id) ON DELETE CASCADE,
  matching_type     matching_type NOT NULL,
  po_result         match_result NOT NULL,
  receipt_result    match_result NOT NULL,
  invoice_result    match_result NOT NULL,
  variance_amount   numeric(14,2),
  tolerance_percent numeric(5,2) NOT NULL DEFAULT 2.00,
  checked_at        timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Approvals  (approval chain + Approve with comments)
-- -----------------------------------------------------------------------------

-- Which roles must approve, by amount: everyone needs the budget owner,
-- >= 5,000 also the finance controller, >= 20,000 also the CFO.
CREATE TABLE approval_rules (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  step_no     smallint NOT NULL UNIQUE CHECK (step_no > 0),
  role_code   text NOT NULL REFERENCES roles (code),
  min_amount  numeric(14,2) NOT NULL DEFAULT 0 CHECK (min_amount >= 0),
  description text
);

CREATE TABLE invoice_approval_steps (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id       bigint NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  step_no          smallint NOT NULL CHECK (step_no > 0),
  role_code        text NOT NULL REFERENCES roles (code),
  assigned_user_id bigint REFERENCES users (id),
  status           approval_step_status NOT NULL DEFAULT 'not_started',
  waiting_since    timestamptz,
  decided_by       bigint REFERENCES users (id),
  decided_at       timestamptz,
  comment          text CHECK (length(comment) <= 500),
  UNIQUE (invoice_id, step_no),
  CHECK ((status IN ('approved', 'rejected')) = (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CHECK (status <> 'waiting' OR waiting_since IS NOT NULL),
  -- Approving or rejecting needs a real comment (at least 10 characters).
  CONSTRAINT ck_approval_comment CHECK (
    status NOT IN ('approved', 'rejected') OR length(btrim(coalesce(comment, ''))) >= 10
  )
);
-- One person can decide only one step of the same invoice.
CREATE UNIQUE INDEX uq_approval_one_decision_per_person
  ON invoice_approval_steps (invoice_id, decided_by) WHERE decided_by IS NOT NULL;
-- At most one step is waiting at a time.
CREATE UNIQUE INDEX uq_approval_one_waiting_step
  ON invoice_approval_steps (invoice_id) WHERE status = 'waiting';
CREATE INDEX ix_approval_waiting_role ON invoice_approval_steps (role_code) WHERE status = 'waiting';

-- Separation of duties: whoever submitted an invoice cannot approve it.
CREATE FUNCTION enforce_approver_is_not_submitter() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.decided_by IS NOT NULL AND NEW.decided_by = (
       SELECT submitted_by FROM invoices WHERE id = NEW.invoice_id) THEN
    RAISE EXCEPTION 'The person who submitted invoice % cannot approve it', NEW.invoice_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_approval_separation_of_duties
  BEFORE INSERT OR UPDATE OF decided_by ON invoice_approval_steps
  FOR EACH ROW EXECUTE FUNCTION enforce_approver_is_not_submitter();

-- -----------------------------------------------------------------------------
-- Exceptions: holds and rejections
-- -----------------------------------------------------------------------------

CREATE TABLE invoice_holds (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id    bigint NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  hold_type     hold_type NOT NULL,
  detail        text NOT NULL,
  next_step     text,
  owner_user_id bigint REFERENCES users (id),
  placed_at     timestamptz NOT NULL DEFAULT now(),
  placed_by     bigint REFERENCES users (id),          -- null = placed automatically by matching
  released_at   timestamptz,
  released_by   bigint REFERENCES users (id),
  release_note  text,
  CHECK ((released_at IS NULL) = (released_by IS NULL)),
  CHECK (released_at IS NULL OR released_at >= placed_at)
);
CREATE UNIQUE INDEX uq_invoice_open_hold_per_type
  ON invoice_holds (invoice_id, hold_type) WHERE released_at IS NULL;

CREATE TABLE invoice_rejections (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id         bigint NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  reason             text NOT NULL CHECK (length(btrim(reason)) >= 3),
  detail             text,
  rejected_by        bigint NOT NULL REFERENCES users (id),
  rejected_at        timestamptz NOT NULL DEFAULT now(),
  vendor_notified_at timestamptz
);
CREATE INDEX ix_invoice_rejections_invoice ON invoice_rejections (invoice_id);

-- -----------------------------------------------------------------------------
-- Payments  (Scheduled and Paid statuses, remittance advice)
-- -----------------------------------------------------------------------------

-- Payment runs go out on Tuesdays and Fridays.
CREATE TABLE payment_runs (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_date   date NOT NULL UNIQUE,
  status     payment_run_status NOT NULL DEFAULT 'draft',
  created_by bigint REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payments (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payment_ref            text NOT NULL UNIQUE CHECK (payment_ref ~ '^PAY-\d+$'),
  payment_run_id         bigint REFERENCES payment_runs (id),
  vendor_id              bigint NOT NULL REFERENCES vendors (id),
  method                 payment_method NOT NULL,
  from_account_id        bigint NOT NULL REFERENCES company_bank_accounts (id),
  to_bank_account_id     bigint REFERENCES vendor_bank_accounts (id),
  amount                 numeric(14,2) NOT NULL CHECK (amount > 0),
  currency_code          char(3) NOT NULL REFERENCES currencies (code),
  status                 payment_status NOT NULL DEFAULT 'scheduled',
  scheduled_date         date NOT NULL,
  sent_at                timestamptz,
  paid_at                timestamptz,
  bank_reference         text,          -- ACH trace number, wire reference or check number
  remittance_email       text,
  remittance_sent_at     timestamptz,
  created_by             bigint REFERENCES users (id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  CHECK (method = 'check' OR to_bank_account_id IS NOT NULL),
  CHECK (status <> 'paid' OR (paid_at IS NOT NULL AND bank_reference IS NOT NULL))
);
CREATE INDEX ix_payments_vendor ON payments (vendor_id);
CREATE INDEX ix_payments_run ON payments (payment_run_id);

-- One payment can settle several invoices; discount_taken records early payment discounts.
CREATE TABLE payment_allocations (
  payment_id     bigint NOT NULL REFERENCES payments (id) ON DELETE CASCADE,
  invoice_id     bigint NOT NULL REFERENCES invoices (id),
  amount_applied numeric(14,2) NOT NULL CHECK (amount_applied > 0),
  discount_taken numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount_taken >= 0),
  PRIMARY KEY (payment_id, invoice_id)
);
CREATE INDEX ix_payment_allocations_invoice ON payment_allocations (invoice_id);

-- -----------------------------------------------------------------------------
-- Audit trail  (Activity section of the details panel). Append-only.
-- -----------------------------------------------------------------------------

CREATE TABLE invoice_events (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id    bigint NOT NULL REFERENCES invoices (id),
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  event_type    invoice_event_type NOT NULL,
  actor_user_id bigint REFERENCES users (id),   -- null = the system
  message       text NOT NULL,
  details       jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX ix_invoice_events_invoice ON invoice_events (invoice_id, occurred_at);

CREATE FUNCTION forbid_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: rows cannot be changed or deleted', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
CREATE TRIGGER trg_invoice_events_append_only
  BEFORE UPDATE OR DELETE ON invoice_events
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- -----------------------------------------------------------------------------
-- Workflow functions. The application calls these so the rules shown on the
-- screens are also enforced by the database.
-- -----------------------------------------------------------------------------

-- "Submit for approval" on the data entry page.
CREATE FUNCTION submit_invoice(p_invoice_id bigint, p_user_id bigint)
RETURNS invoice_status
LANGUAGE plpgsql AS $$
DECLARE
  inv        invoices%ROWTYPE;
  v_vendor   vendors%ROWTYPE;
  v_lines    integer;
  v_uncoded  integer;
  v_subtotal numeric(14,2);
  v_first    boolean := true;
  r          record;
BEGIN
  SELECT * INTO inv FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id USING ERRCODE = 'no_data_found';
  END IF;
  IF inv.status <> 'received' THEN
    RAISE EXCEPTION 'Only received invoices can be submitted (this one is %)', inv.status;
  END IF;

  SELECT * INTO v_vendor FROM vendors WHERE id = inv.vendor_id;
  IF v_vendor.status <> 'active' THEN
    RAISE EXCEPTION 'Vendor % is not active in the vendor master', v_vendor.vendor_code;
  END IF;
  IF v_vendor.matching_type <> 'non_po' AND inv.purchase_order_id IS NULL THEN
    RAISE EXCEPTION 'A purchase order is required for vendor %', v_vendor.vendor_code;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE gl_code IS NULL OR cost_center_code IS NULL OR btrim(description) = ''),
         coalesce(sum(amount), 0)
    INTO v_lines, v_uncoded, v_subtotal
    FROM invoice_lines WHERE invoice_id = p_invoice_id;
  IF v_lines = 0 THEN
    RAISE EXCEPTION 'Add at least one line item';
  END IF;
  IF v_uncoded > 0 THEN
    RAISE EXCEPTION '% line(s) still need a description, GL account and cost center', v_uncoded;
  END IF;
  IF v_subtotal + inv.tax_amount + inv.shipping_amount <> inv.total_amount THEN
    RAISE EXCEPTION 'Out of balance: lines % + tax % + shipping % <> invoice total %',
      v_subtotal, inv.tax_amount, inv.shipping_amount, inv.total_amount;
  END IF;

  UPDATE invoices
     SET status = 'pending_approval', subtotal_amount = v_subtotal,
         submitted_at = now(), submitted_by = p_user_id, updated_by = p_user_id,
         row_version = row_version + 1
   WHERE id = p_invoice_id;

  -- Build the approval chain from the rules for this amount.
  DELETE FROM invoice_approval_steps WHERE invoice_id = p_invoice_id;
  FOR r IN SELECT * FROM approval_rules WHERE min_amount <= inv.total_amount ORDER BY step_no LOOP
    INSERT INTO invoice_approval_steps (invoice_id, step_no, role_code, status, waiting_since)
    VALUES (p_invoice_id, r.step_no, r.role_code,
            CASE WHEN v_first THEN 'waiting'::approval_step_status ELSE 'not_started' END,
            CASE WHEN v_first THEN now() END);
    v_first := false;
  END LOOP;

  INSERT INTO invoice_events (invoice_id, event_type, actor_user_id, message)
  VALUES (p_invoice_id, 'submitted', p_user_id, 'Submitted for approval');
  RETURN 'pending_approval';
END;
$$;

-- "Approve" with required comments in the details panel. Completes the waiting
-- step; after the last step the invoice moves to Approved.
CREATE FUNCTION approve_invoice(p_invoice_id bigint, p_user_id bigint, p_comment text)
RETURNS invoice_status
LANGUAGE plpgsql AS $$
DECLARE
  inv    invoices%ROWTYPE;
  v_step invoice_approval_steps%ROWTYPE;
  v_next bigint;
BEGIN
  IF length(btrim(coalesce(p_comment, ''))) < 10 THEN
    RAISE EXCEPTION 'Approval comments are required (at least 10 characters)' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO inv FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND OR inv.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Invoice % is not waiting for approval', p_invoice_id;
  END IF;

  SELECT * INTO v_step FROM invoice_approval_steps
   WHERE invoice_id = p_invoice_id AND status = 'waiting' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % has no approval step waiting', p_invoice_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = p_user_id AND role_code IN (v_step.role_code, 'admin')) THEN
    RAISE EXCEPTION 'This step needs the % role', v_step.role_code USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The separation-of-duties trigger and unique index reject a submitter or repeat approver here.
  UPDATE invoice_approval_steps
     SET status = 'approved', decided_by = p_user_id, decided_at = now(), comment = btrim(p_comment)
   WHERE id = v_step.id;

  SELECT id INTO v_next FROM invoice_approval_steps
   WHERE invoice_id = p_invoice_id AND step_no > v_step.step_no AND status = 'not_started'
   ORDER BY step_no LIMIT 1;

  INSERT INTO invoice_events (invoice_id, event_type, actor_user_id, message, details)
  VALUES (p_invoice_id, 'approved', p_user_id, 'Approved: "' || btrim(p_comment) || '"',
          jsonb_build_object('step_no', v_step.step_no, 'role', v_step.role_code));

  IF v_next IS NOT NULL THEN
    UPDATE invoice_approval_steps SET status = 'waiting', waiting_since = now() WHERE id = v_next;
    RETURN 'pending_approval';
  END IF;

  UPDATE invoices
     SET status = 'approved', approved_at = now(), updated_by = p_user_id, row_version = row_version + 1
   WHERE id = p_invoice_id;
  RETURN 'approved';
END;
$$;

-- -----------------------------------------------------------------------------
-- Views for the dashboard
-- -----------------------------------------------------------------------------

-- Status buckets: count, total and how many are overdue.
CREATE VIEW v_dashboard_status_summary AS
SELECT s.status,
       count(i.id)                                   AS invoice_count,
       coalesce(sum(i.total_amount), 0)::numeric(14,2) AS total_amount,
       count(i.id) FILTER (WHERE i.status NOT IN ('paid', 'rejected') AND i.due_date < current_date)
                                                     AS overdue_count
  FROM unnest(enum_range(NULL::invoice_status)) AS s (status)
  LEFT JOIN invoices i ON i.status = s.status
 GROUP BY s.status
 ORDER BY s.status;

-- Unpaid invoices by days past due.
CREATE VIEW v_dashboard_aging AS
WITH open_invoices AS (
  SELECT total_amount,
         CASE
           WHEN current_date - due_date <= 0  THEN 1
           WHEN current_date - due_date <= 30 THEN 2
           WHEN current_date - due_date <= 60 THEN 3
           WHEN current_date - due_date <= 90 THEN 4
           ELSE 5
         END AS bucket_order
    FROM invoices
   WHERE status NOT IN ('paid', 'rejected')
)
SELECT b.bucket_order,
       b.bucket,
       count(o.total_amount)                           AS invoice_count,
       coalesce(sum(o.total_amount), 0)::numeric(14,2) AS total_amount
  FROM (VALUES (1, 'Not yet due'), (2, '1-30 days'), (3, '31-60 days'), (4, '61-90 days'), (5, '90+ days'))
       AS b (bucket_order, bucket)
  LEFT JOIN open_invoices o USING (bucket_order)
 GROUP BY b.bucket_order, b.bucket
 ORDER BY b.bucket_order;

-- The invoice list, including "Approved on" and who gave the final approval.
CREATE VIEW v_invoice_list AS
SELECT i.id,
       i.doc_number,
       i.supplier_invoice_number,
       v.name                                  AS vendor_name,
       i.invoice_date,
       i.due_date,
       i.total_amount,
       i.currency_code,
       i.status,
       CASE WHEN i.status IN ('paid', 'rejected') THEN 0
            ELSE greatest(current_date - i.due_date, 0) END AS days_overdue,
       i.approved_at,                                   -- the "Approved on" column
       CASE WHEN i.approved_at IS NOT NULL THEN final_approval.approver_name END AS final_approver_name,
       CASE WHEN i.approved_at IS NOT NULL THEN final_approval.comment END       AS final_approval_comment
  FROM invoices i
  JOIN vendors v ON v.id = i.vendor_id
  LEFT JOIN LATERAL (
    SELECT u.full_name AS approver_name, s.comment
      FROM invoice_approval_steps s
      JOIN users u ON u.id = s.decided_by
     WHERE s.invoice_id = i.id AND s.status = 'approved'
     ORDER BY s.step_no DESC
     LIMIT 1
  ) final_approval ON true;

COMMIT;
