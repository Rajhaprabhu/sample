-- =============================================================================
-- Checks that the database enforces the same rules as the screens.
-- Needs schema.sql and seed.sql loaded. Runs in a transaction and rolls back,
-- so it leaves the data unchanged.
--
-- Run:  psql -v ON_ERROR_STOP=1 -d <database> -f db/tests/workflow_test.sql
-- Each check prints "PASS: ..."; the first failure stops the run.
-- =============================================================================

-- Only the PASS / FAIL notices are printed.
\o /dev/null

BEGIN;
SET search_path = ap, public;
SET client_min_messages = notice;

-- Runs a statement that must fail with an error containing `expected`.
CREATE FUNCTION pg_temp.expect_error(label text, stmt text, expected text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%' || expected || '%' THEN
      RAISE NOTICE 'PASS: %', label;
      RETURN;
    END IF;
    RAISE EXCEPTION 'FAIL: % (wrong error: %)', label, SQLERRM;
  END;
  RAISE EXCEPTION 'FAIL: % (no error was raised)', label;
END;
$$;

CREATE FUNCTION pg_temp.expect(label text, ok boolean) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL: %', label;
  END IF;
  RAISE NOTICE 'PASS: %', label;
END;
$$;

CREATE FUNCTION pg_temp.uid(p_email text) RETURNS bigint
LANGUAGE sql AS $$ SELECT id FROM ap.users WHERE email = p_email $$;

CREATE FUNCTION pg_temp.inv(p_doc text) RETURNS bigint
LANGUAGE sql AS $$ SELECT id FROM ap.invoices WHERE doc_number = p_doc $$;

-- ---------- data entry: submit_invoice() ----------

SELECT pg_temp.expect_error('Submit is refused while lines are not coded',
  format('SELECT ap.submit_invoice(%s, %s)', pg_temp.inv('INV-10422'), pg_temp.uid('jane.doe@company.example')),
  'still need a description, GL account and cost center');

UPDATE invoice_lines SET gl_code = '5300', cost_center_code = 'CC-310'
 WHERE invoice_id = pg_temp.inv('INV-10422');
UPDATE invoices SET tax_amount = 600.00 WHERE doc_number = 'INV-10422';

SELECT pg_temp.expect_error('Submit is refused when lines, tax and shipping do not add up to the total',
  format('SELECT ap.submit_invoice(%s, %s)', pg_temp.inv('INV-10422'), pg_temp.uid('jane.doe@company.example')),
  'Out of balance');

UPDATE invoices SET tax_amount = 661.48 WHERE doc_number = 'INV-10422';

SELECT pg_temp.expect('Balanced, coded invoice is submitted and moves to pending_approval',
  ap.submit_invoice(pg_temp.inv('INV-10422'), pg_temp.uid('jane.doe@company.example')) = 'pending_approval');

SELECT pg_temp.expect('Approval chain for 8,930.00: budget owner (waiting), then finance controller',
  (SELECT string_agg(role_code || ':' || status, ', ' ORDER BY step_no)
     FROM invoice_approval_steps WHERE invoice_id = pg_temp.inv('INV-10422'))
  = 'budget_owner:waiting, finance_controller:not_started');

SELECT pg_temp.expect_error('A submitted invoice cannot be submitted again',
  format('SELECT ap.submit_invoice(%s, %s)', pg_temp.inv('INV-10422'), pg_temp.uid('anita.rao@company.example')),
  'Only received invoices can be submitted');

-- ---------- approvals: approve_invoice() ----------

SELECT pg_temp.expect_error('Approval needs comments of at least 10 characters',
  format('SELECT ap.approve_invoice(%s, %s, %L)', pg_temp.inv('INV-10422'), pg_temp.uid('priya.nair@company.example'), 'ok'),
  'comments are required');

SELECT pg_temp.expect_error('The person who submitted the invoice cannot approve it',
  format('SELECT ap.approve_invoice(%s, %s, %L)', pg_temp.inv('INV-10422'), pg_temp.uid('jane.doe@company.example'),
         'Looks fine to me, approving.'),
  'cannot approve it');

SELECT pg_temp.expect_error('An approver without the step''s role is refused',
  format('SELECT ap.approve_invoice(%s, %s, %L)', pg_temp.inv('INV-10422'), pg_temp.uid('tom.becker@company.example'),
         'Freight charges look right.'),
  'needs the budget_owner role');

SELECT pg_temp.expect('Budget owner approves step 1; the invoice stays pending for the next approver',
  ap.approve_invoice(pg_temp.inv('INV-10422'), pg_temp.uid('priya.nair@company.example'),
                     'Delivery confirmed by the warehouse.') = 'pending_approval');

-- Give Priya the admin role so only the one-decision-per-person rule can stop her.
INSERT INTO user_roles (user_id, role_code) VALUES (pg_temp.uid('priya.nair@company.example'), 'admin');
SELECT pg_temp.expect_error('One person cannot approve two steps of the same invoice',
  format('SELECT ap.approve_invoice(%s, %s, %L)', pg_temp.inv('INV-10422'), pg_temp.uid('priya.nair@company.example'),
         'Approving the second step as well.'),
  'uq_approval_one_decision_per_person');

SELECT pg_temp.expect('Finance controller gives the final approval and the invoice moves to approved',
  ap.approve_invoice(pg_temp.inv('INV-10422'), pg_temp.uid('daniel.ortiz@company.example'),
                     'Within the warehouse freight budget.') = 'approved');

SELECT pg_temp.expect('Invoice list shows the approval date and final approver',
  (SELECT approved_at IS NOT NULL AND final_approver_name = 'Daniel Ortiz'
          AND final_approval_comment = 'Within the warehouse freight budget.'
     FROM v_invoice_list WHERE doc_number = 'INV-10422'));

SELECT pg_temp.expect('Audit trail recorded the submission and both approvals with comments',
  (SELECT count(*) FROM invoice_events
    WHERE invoice_id = pg_temp.inv('INV-10422') AND event_type IN ('submitted', 'approved')) = 3);

-- ---------- data integrity ----------

SELECT pg_temp.expect_error('Audit trail rows cannot be edited',
  'UPDATE ap.invoice_events SET message = ''changed''', 'append-only');

SELECT pg_temp.expect_error('Audit trail rows cannot be deleted',
  'DELETE FROM ap.invoice_events', 'append-only');

SELECT pg_temp.expect_error('Duplicate supplier invoice number for the same vendor is refused',
  format($sql$INSERT INTO ap.invoices (doc_number, vendor_id, supplier_invoice_number, invoice_date, due_date,
            payment_terms_code, total_amount, intake_channel)
          SELECT 'INV-99999', vendor_id, upper(supplier_invoice_number), invoice_date, due_date,
                 payment_terms_code, total_amount, 'email' FROM ap.invoices WHERE id = %s$sql$, pg_temp.inv('INV-10409')),
  'uq_invoices_vendor_supplier_number');

SELECT pg_temp.expect_error('An approved invoice must stay balanced',
  'UPDATE ap.invoices SET tax_amount = tax_amount + 1 WHERE doc_number = ''INV-10406''', 'ck_invoices_balanced');

SELECT pg_temp.expect_error('Due date cannot be before the invoice date',
  'UPDATE ap.invoices SET due_date = invoice_date - 1 WHERE doc_number = ''INV-10409''', 'check constraint');

SELECT pg_temp.expect_error('Approving status without an approval date is refused',
  'UPDATE ap.invoices SET status = ''approved'' WHERE doc_number = ''INV-10409''', 'ck_invoices_approved_at');

SELECT pg_temp.expect_error('Whoever adds a vendor bank account cannot also verify it',
  format($sql$INSERT INTO ap.vendor_bank_accounts (vendor_id, bank_name, routing_number, account_number_encrypted,
            account_last4, verification_method, verified_at, verified_by, created_by)
          VALUES ((SELECT id FROM ap.vendors WHERE vendor_code = 'V-1001'), 'Test Bank', '000000000', '\x00',
                  '1234', 'call_back', now(), %1$s, %1$s)$sql$, pg_temp.uid('anita.rao@company.example')),
  'check constraint');

SELECT pg_temp.expect_error('Emails are unique regardless of case',
  'INSERT INTO ap.users (email, full_name, password_hash) VALUES (''Jane.Doe@Company.example'', ''Jane Two'', ''x'')',
  'uq_users_email');

SELECT pg_temp.expect('Line amounts are calculated as quantity x unit price',
  (SELECT bool_and(amount = round(quantity * unit_price, 2)) FROM invoice_lines));

SELECT pg_temp.expect('Seeded invoices past "received" all balance',
  (SELECT bool_and(subtotal_amount = (SELECT sum(amount) FROM invoice_lines l WHERE l.invoice_id = i.id))
     FROM invoices i WHERE status <> 'received'));

ROLLBACK;
