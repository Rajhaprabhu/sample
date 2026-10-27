-- =============================================================================
-- AP Portal sample data: matches the demo app (same vendors, people and
-- invoices), with one invoice in each status. Dates are relative to today so
-- the aging buckets look realistic whenever this is loaded.
--
-- Run after schema.sql:  psql -d <database> -f db/seed.sql
-- Demo users have no usable password: the application must set real hashes.
-- Encrypted columns hold placeholder bytes, not real bank or tax numbers.
-- =============================================================================

BEGIN;
SET search_path = ap, public;

-- ---------- reference data ----------

INSERT INTO roles (code, name, description) VALUES
  ('ap_processor',       'AP processor',       'Enters, codes and submits invoices'),
  ('budget_owner',       'Budget owner',       'First approval for spend in their cost center'),
  ('finance_controller', 'Finance controller', 'Approves invoices of 5,000 or more'),
  ('cfo',                'CFO',                'Approves invoices of 20,000 or more'),
  ('procurement',        'Procurement buyer',  'Owns purchase orders and price variances'),
  ('admin',              'Administrator',      'Manages users and settings; can act for any role');

INSERT INTO currencies (code, name) VALUES
  ('USD', 'US dollar'), ('EUR', 'Euro'), ('GBP', 'Pound sterling'), ('INR', 'Indian rupee'), ('CAD', 'Canadian dollar');

INSERT INTO payment_terms (code, label, net_days, discount_percent, discount_days) VALUES
  ('DUE_ON_RECEIPT', 'Due on receipt', 0,  0, NULL),
  ('NET15',          'Net 15',         15, 0, NULL),
  ('NET30',          'Net 30',         30, 0, NULL),
  ('NET45',          'Net 45',         45, 0, NULL),
  ('NET60',          'Net 60',         60, 0, NULL),
  ('2_10_NET30',     '2/10 Net 30',    30, 2, 10);

INSERT INTO gl_accounts (code, name) VALUES
  ('5300', 'Freight inbound'),        ('6100', 'Office supplies'),
  ('6200', 'Utilities'),              ('6300', 'Marketing materials'),
  ('6400', 'Repairs and maintenance'), ('6500', 'IT services'),
  ('6510', 'Software subscriptions'), ('6600', 'Staff meals and events'),
  ('6700', 'Professional fees');

-- ---------- people ----------

INSERT INTO users (email, full_name, password_hash) VALUES
  ('anita.rao@company.example',    'Anita Rao',    '!no-password-set'),
  ('priya.nair@company.example',   'Priya Nair',   '!no-password-set'),
  ('sam.patel@company.example',    'Sam Patel',    '!no-password-set'),
  ('daniel.ortiz@company.example', 'Daniel Ortiz', '!no-password-set'),
  ('meera.iyer@company.example',   'Meera Iyer',   '!no-password-set'),
  ('grace.kim@company.example',    'Grace Kim',    '!no-password-set'),
  ('tom.becker@company.example',   'Tom Becker',   '!no-password-set'),
  ('jane.doe@company.example',     'Jane Doe',     '!no-password-set');

INSERT INTO user_roles (user_id, role_code)
SELECT u.id, r.role_code
  FROM (VALUES
    ('anita.rao@company.example',    'ap_processor'),
    ('priya.nair@company.example',   'budget_owner'),
    ('sam.patel@company.example',    'budget_owner'),
    ('grace.kim@company.example',    'budget_owner'),
    ('daniel.ortiz@company.example', 'finance_controller'),
    ('meera.iyer@company.example',   'cfo'),
    ('tom.becker@company.example',   'procurement'),
    ('jane.doe@company.example',     'ap_processor'),
    ('jane.doe@company.example',     'budget_owner')
  ) AS r (email, role_code)
  JOIN users u ON u.email = r.email;

INSERT INTO cost_centers (code, name, owner_user_id) VALUES
  ('CC-100', 'Head office', (SELECT id FROM users WHERE email = 'priya.nair@company.example')),
  ('CC-210', 'Operations',  (SELECT id FROM users WHERE email = 'priya.nair@company.example')),
  ('CC-310', 'Warehouse',   (SELECT id FROM users WHERE email = 'priya.nair@company.example')),
  ('CC-400', 'Technology',  (SELECT id FROM users WHERE email = 'sam.patel@company.example')),
  ('CC-500', 'Marketing',   (SELECT id FROM users WHERE email = 'priya.nair@company.example'));

INSERT INTO approval_rules (step_no, role_code, min_amount, description) VALUES
  (1, 'budget_owner',       0,        'Every invoice: the budget owner'),
  (2, 'finance_controller', 5000.00,  '5,000 or more: also the finance controller'),
  (3, 'cfo',                20000.00, '20,000 or more: also the CFO');

-- ---------- vendor master ----------

INSERT INTO vendors (vendor_code, name, category, status, matching_type, default_terms_code,
                     default_gl_code, default_cost_center_code, payment_method, billing_email, tax_id_last4) VALUES
  ('V-1001', 'Northwind Office Supply', 'Office supplies',        'active', 'three_way', 'NET30',      '6100', 'CC-210', 'ach',   'billing@northwind-supply.example',  '7731'),
  ('V-1002', 'Bluepeak Logistics',      'Freight and logistics',  'active', 'three_way', '2_10_NET30', '5300', 'CC-310', 'ach',   'ar@bluepeak-logistics.example',     '2210'),
  ('V-1003', 'Cedar & Pine Facilities', 'Facilities maintenance', 'active', 'two_way',   'NET45',      '6400', 'CC-210', 'ach',   'invoices@cedarpine.example',        '9014'),
  ('V-1004', 'Metro Electric Co.',      'Utilities',              'active', 'non_po',    'NET30',      '6200', 'CC-100', 'ach',   'billing@metroelectric.example',     '3388'),
  ('V-1005', 'Atlas IT Services',       'IT services',            'active', 'two_way',   'NET30',      '6500', 'CC-400', 'wire',  'accounts@atlas-it.example',         '6652'),
  ('V-1006', 'Harbor Print Works',      'Printing',               'active', 'three_way', 'NET30',      '6300', 'CC-500', 'check', 'accounts@harborprint.example',      '1176'),
  ('V-1007', 'Greenfield Catering',     'Catering',               'active', 'two_way',   'NET30',      '6600', 'CC-100', 'ach',   'orders@greenfieldcatering.example', '4409'),
  ('V-1008', 'Summit Legal LLP',        'Legal services',         'active', 'non_po',    'NET30',      '6700', 'CC-100', 'wire',  'billing@summitlegal.example',       '5590'),
  ('V-1009', 'Riverbend Software',      'Software subscriptions', 'active', 'two_way',   'NET30',      '6510', 'CC-400', 'ach',   'billing@riverbend.example',         '8823'),
  ('V-9001', 'Unknown Vendor Ltd',      'Unverified',             'pending_verification', 'non_po', 'NET30', NULL, NULL, 'ach', 'payments@unknown-vendor.example', NULL);

-- Placeholder bytes stand in for encrypted account numbers.
INSERT INTO vendor_bank_accounts (vendor_id, bank_name, routing_number, account_number_encrypted, account_last4,
                                  is_primary, verification_method, verified_at, verified_by, created_by)
SELECT v.id, b.bank_name, b.routing, '\x00'::bytea, b.last4, true, 'call_back', now() - interval '200 days',
       (SELECT id FROM users WHERE email = 'daniel.ortiz@company.example'),
       (SELECT id FROM users WHERE email = 'anita.rao@company.example')
  FROM (VALUES
    ('V-1001', 'First Harbor Bank', '021000021', '4821'),
    ('V-1002', 'Union Trust',       '026009593', '0937'),
    ('V-1003', 'First Harbor Bank', '021000021', '5512'),
    ('V-1004', 'Metro Savings',     '011000138', '7745'),
    ('V-1005', 'Pacific National',  '121000358', '3309'),
    ('V-1007', 'Union Trust',       '026009593', '6620'),
    ('V-1008', 'Pacific National',  '121000358', '2284'),
    ('V-1009', 'Metro Savings',     '011000138', '9051')
  ) AS b (vendor_code, bank_name, routing, last4)
  JOIN vendors v ON v.vendor_code = b.vendor_code;

INSERT INTO company_bank_accounts (name, bank_name, account_number_encrypted, account_last4, currency_code)
VALUES ('Operating account', 'First Harbor Bank', '\x00'::bytea, '1180', 'USD');

-- ---------- purchase orders and goods receipts ----------

INSERT INTO purchase_orders (po_number, vendor_id, status, ordered_on, buyer_user_id)
SELECT p.po_number, v.id, p.status::po_status, current_date + p.ordered_offset,
       (SELECT id FROM users WHERE email = 'tom.becker@company.example')
  FROM (VALUES
    ('PO-4827', 'V-1002', 'open',     -10),
    ('PO-4772', 'V-1002', 'received', -45),
    ('PO-4795', 'V-1005', 'open',     -50),
    ('PO-4858', 'V-1009', 'open',    -100),
    ('PO-4901', 'V-1002', 'closed',   -65)
  ) AS p (po_number, vendor_code, status, ordered_offset)
  JOIN vendors v ON v.vendor_code = p.vendor_code;

INSERT INTO purchase_order_lines (purchase_order_id, line_no, description, quantity, unit_price, gl_code, cost_center_code)
SELECT po.id, l.line_no, l.description, l.qty, l.price, l.gl, l.cc
  FROM (VALUES
    ('PO-4827', 1, 'Full truckload, Chicago to Dallas',   1,  2850.00, '5300', 'CC-310'),
    ('PO-4827', 2, 'Pallet handling fee',                  4,  1354.63, '5300', 'CC-310'),
    ('PO-4772', 1, 'Full truckload, Chicago to Dallas',   2,  3435.30, '5300', 'CC-310'),
    ('PO-4795', 1, 'Managed IT support, quarterly',       1, 11388.89, '6500', 'CC-400'),
    ('PO-4858', 1, 'Analytics platform, annual seats',   16,   506.17, '6510', 'CC-400'),
    ('PO-4901', 1, 'Pallet handling fee',                 62,    45.00, '5300', 'CC-310'),
    ('PO-4901', 2, 'Fuel surcharge',                       8,   427.87, '5300', 'CC-310')
  ) AS l (po_number, line_no, description, qty, price, gl, cc)
  JOIN purchase_orders po ON po.po_number = l.po_number;

INSERT INTO goods_receipts (receipt_number, purchase_order_id, received_on, received_by)
SELECT g.receipt_number, po.id, current_date + g.offset_days, (SELECT id FROM users WHERE email = 'priya.nair@company.example')
  FROM (VALUES ('GR-4772', 'PO-4772', -40), ('GR-4901', 'PO-4901', -61)) AS g (receipt_number, po_number, offset_days)
  JOIN purchase_orders po ON po.po_number = g.po_number;

INSERT INTO goods_receipt_lines (goods_receipt_id, purchase_order_line_id, quantity_received)
SELECT gr.id, pol.id, pol.quantity
  FROM goods_receipts gr
  JOIN purchase_order_lines pol ON pol.purchase_order_id = gr.purchase_order_id;

-- ---------- invoices: one in each status ----------

INSERT INTO invoices (doc_number, vendor_id, supplier_invoice_number, invoice_date, due_date, payment_terms_code,
                      purchase_order_id, subtotal_amount, tax_amount, shipping_amount, total_amount, status,
                      intake_channel, received_at, submitted_at, submitted_by, approved_at)
SELECT i.doc_number, v.id, i.doc_number, current_date + i.inv_offset, current_date + i.due_offset, i.terms,
       (SELECT id FROM purchase_orders WHERE po_number = i.po_number),
       i.subtotal, i.tax, 0, i.total, i.status::invoice_status, i.channel::intake_channel,
       (current_date + i.inv_offset + 1) + time '09:12',
       CASE WHEN i.submitted THEN (current_date + i.inv_offset + 2) + time '11:40' END,
       CASE WHEN i.submitted THEN (SELECT id FROM users WHERE email = 'anita.rao@company.example') END,
       CASE WHEN i.approved_offset IS NOT NULL THEN (current_date + i.approved_offset) + time '11:15' END
  FROM (VALUES
    -- doc_number  vendor    inv  due  terms         PO         subtotal   tax      total     status              channel            submitted approved
    ('INV-10422', 'V-1002',  -2,  28, '2_10_NET30', 'PO-4827',  8268.52,  661.48,  8930.00, 'received',         'supplier_portal', false, NULL),
    ('INV-10409', 'V-1002', -38,  -8, '2_10_NET30', 'PO-4772',  6870.60,  549.65,  7420.25, 'pending_approval', 'email',           true,  NULL),
    ('INV-10406', 'V-1005', -40, -10, 'NET30',      'PO-4795', 11388.89,  911.11, 12300.00, 'approved',         'edi',             true,  -35),
    ('INV-10410', 'V-1004', -24,   6, 'NET30',      NULL,       2139.26,  171.14,  2310.40, 'scheduled',        'email',           true,  -21),
    ('INV-10388', 'V-1009', -95, -65, 'NET30',      'PO-4858',  9143.52,  731.48,  9875.00, 'on_hold',          'email',           true,  NULL),
    ('INV-10390', 'V-1002', -60, -30, '2_10_NET30', 'PO-4901',  6212.96,  497.04,  6710.00, 'paid',             'edi',             true,  -55),
    ('INV-10400', 'V-9001', -41, -11, 'NET30',      NULL,       3055.56,  244.44,  3300.00, 'rejected',         'email',           false, NULL)
  ) AS i (doc_number, vendor_code, inv_offset, due_offset, terms, po_number, subtotal, tax, total, status, channel, submitted, approved_offset)
  JOIN vendors v ON v.vendor_code = i.vendor_code;

-- Lines. INV-10422 is freshly captured, so its lines are not coded yet.
INSERT INTO invoice_lines (invoice_id, line_no, description, quantity, unit_price, gl_code, cost_center_code)
SELECT inv.id, l.line_no, l.description, l.qty, l.price, l.gl, l.cc
  FROM (VALUES
    ('INV-10422', 1, 'Full truckload, Chicago to Dallas',      1, 2850.00,  NULL,   NULL),
    ('INV-10422', 2, 'Pallet handling fee',                     4, 1354.63,  NULL,   NULL),
    ('INV-10409', 1, 'Full truckload, Chicago to Dallas',      2, 3435.30,  '5300', 'CC-310'),
    ('INV-10406', 1, 'Managed IT support, quarterly',          1, 11388.89, '6500', 'CC-400'),
    ('INV-10410', 1, 'Electricity, head office (kWh)',      4159, 0.18,     '6200', 'CC-100'),
    ('INV-10410', 2, 'Electricity, warehouse (kWh)',           8, 173.83,   '6200', 'CC-310'),
    ('INV-10388', 1, 'Analytics platform, annual seats',      16, 571.47,   '6510', 'CC-400'),
    ('INV-10390', 1, 'Pallet handling fee',                   62, 45.00,    '5300', 'CC-310'),
    ('INV-10390', 2, 'Fuel surcharge',                         8, 427.87,   '5300', 'CC-310'),
    ('INV-10400', 1, 'Consulting services',                    1, 3055.56,  NULL,   NULL)
  ) AS l (doc_number, line_no, description, qty, price, gl, cc)
  JOIN invoices inv ON inv.doc_number = l.doc_number;

INSERT INTO invoice_documents (invoice_id, file_name, content_type, size_bytes, storage_key, sha256)
SELECT id, doc_number || '.pdf', 'application/pdf', 180000 + id * 1000,
       'invoices/' || doc_number || '/original.pdf', sha256(convert_to(doc_number, 'UTF8'))
  FROM invoices;

INSERT INTO invoice_match_results (invoice_id, matching_type, po_result, receipt_result, invoice_result, variance_amount)
SELECT inv.id, m.mtype::matching_type, m.po::match_result, m.gr::match_result, m.inv::match_result, m.variance
  FROM (VALUES
    ('INV-10422', 'three_way', 'ok', 'pending',        'pending',  NULL),
    ('INV-10409', 'three_way', 'ok', 'ok',             'ok',       0),
    ('INV-10406', 'two_way',   'ok', 'not_applicable', 'ok',       0),
    ('INV-10388', 'two_way',   'variance', 'not_applicable', 'variance', 1044.80),
    ('INV-10390', 'three_way', 'ok', 'ok',             'ok',       0)
  ) AS m (doc_number, mtype, po, gr, inv, variance)
  JOIN invoices inv ON inv.doc_number = m.doc_number;

-- ---------- approvals ----------

INSERT INTO invoice_approval_steps (invoice_id, step_no, role_code, status, waiting_since, decided_by, decided_at, comment)
SELECT inv.id, a.step_no, a.role_code, a.status::approval_step_status,
       CASE WHEN a.status = 'waiting' THEN (current_date + a.day_offset) + time '10:15' END,
       (SELECT id FROM users WHERE email = a.approver),
       CASE WHEN a.status = 'approved' THEN (current_date + a.day_offset) + time '10:15' END,
       a.comment
  FROM (VALUES
    ('INV-10409', 1, 'budget_owner',       'approved', -35, 'priya.nair@company.example',   'Delivery confirmed by the warehouse team.'),
    ('INV-10409', 2, 'finance_controller', 'waiting',  -35, NULL,                           NULL),
    ('INV-10406', 1, 'budget_owner',       'approved', -36, 'sam.patel@company.example',    'Support hours match the service report.'),
    ('INV-10406', 2, 'finance_controller', 'approved', -35, 'daniel.ortiz@company.example', 'Within the Technology budget for the quarter.'),
    ('INV-10410', 1, 'budget_owner',       'approved', -21, 'priya.nair@company.example',   'Usage is in line with the previous month.'),
    ('INV-10390', 1, 'budget_owner',       'approved', -57, 'priya.nair@company.example',   'Pallets and fuel surcharge agree with the receipt.'),
    ('INV-10390', 2, 'finance_controller', 'approved', -55, 'daniel.ortiz@company.example', 'Approved; pay within the discount window.')
  ) AS a (doc_number, step_no, role_code, status, day_offset, approver, comment)
  JOIN invoices inv ON inv.doc_number = a.doc_number;

-- ---------- holds and rejections ----------

INSERT INTO invoice_holds (invoice_id, hold_type, detail, next_step, owner_user_id, placed_at)
SELECT id, 'price_variance',
       'Invoiced at $571.47 per seat; the purchase order price is $506.17 per seat. That is 12.9% over, and the tolerance is 2%.',
       'Buyer to confirm the new price with the vendor, or ask for a credit note for the difference.',
       (SELECT id FROM users WHERE email = 'tom.becker@company.example'),
       (current_date - 92) + time '15:05'
  FROM invoices WHERE doc_number = 'INV-10388';

INSERT INTO invoice_rejections (invoice_id, reason, detail, rejected_by, rejected_at, vendor_notified_at)
SELECT id, 'Vendor not in vendor master',
       'The vendor is not registered and the bank details could not be verified.',
       (SELECT id FROM users WHERE email = 'daniel.ortiz@company.example'),
       (current_date - 39) + time '14:20', (current_date - 39) + time '14:21'
  FROM invoices WHERE doc_number = 'INV-10400';

-- ---------- payments ----------

INSERT INTO payment_runs (run_date, status, created_by) VALUES
  (current_date - 51, 'completed', (SELECT id FROM users WHERE email = 'anita.rao@company.example')),
  (current_date + 3,  'scheduled', (SELECT id FROM users WHERE email = 'anita.rao@company.example'));

INSERT INTO payments (payment_ref, payment_run_id, vendor_id, method, from_account_id, to_bank_account_id, amount,
                      currency_code, status, scheduled_date, sent_at, paid_at, bank_reference,
                      remittance_email, remittance_sent_at, created_by)
SELECT p.ref, (SELECT id FROM payment_runs WHERE run_date = current_date + p.run_offset),
       v.id, 'ach', (SELECT id FROM company_bank_accounts WHERE name = 'Operating account'),
       (SELECT id FROM vendor_bank_accounts WHERE vendor_id = v.id AND is_primary),
       p.amount, 'USD', p.status::payment_status, current_date + p.run_offset,
       CASE WHEN p.status = 'paid' THEN (current_date + p.run_offset) + time '07:00' END,
       CASE WHEN p.status = 'paid' THEN (current_date + p.run_offset) + time '07:00' END,
       p.bank_reference, CASE WHEN p.status = 'paid' THEN v.billing_email END,
       CASE WHEN p.status = 'paid' THEN (current_date + p.run_offset) + time '07:05' END,
       (SELECT id FROM users WHERE email = 'anita.rao@company.example')
  FROM (VALUES
    ('PAY-70410', 'V-1004',   3, 2310.40, 'scheduled', NULL),
    ('PAY-70390', 'V-1002', -51, 6575.80, 'paid',      'ACH trace 037860739')
  ) AS p (ref, vendor_code, run_offset, amount, status, bank_reference)
  JOIN vendors v ON v.vendor_code = p.vendor_code;

INSERT INTO payment_allocations (payment_id, invoice_id, amount_applied, discount_taken)
SELECT pay.id, inv.id, a.applied, a.discount
  FROM (VALUES ('PAY-70410', 'INV-10410', 2310.40, 0), ('PAY-70390', 'INV-10390', 6575.80, 134.20))
       AS a (payment_ref, doc_number, applied, discount)
  JOIN payments pay ON pay.payment_ref = a.payment_ref
  JOIN invoices inv ON inv.doc_number = a.doc_number;

-- ---------- audit trail ----------

INSERT INTO invoice_events (invoice_id, occurred_at, event_type, actor_user_id, message)
SELECT id, received_at, 'received'::invoice_event_type, NULL::bigint, 'Invoice received (' || replace(intake_channel::text, '_', ' ') || ')'
  FROM invoices
UNION ALL
SELECT id, received_at + interval '1 minute', 'captured', NULL, 'Details captured and checked for duplicates'
  FROM invoices
UNION ALL
SELECT id, submitted_at, 'submitted', submitted_by, 'Coded and submitted for approval'
  FROM invoices WHERE submitted_at IS NOT NULL
UNION ALL
SELECT s.invoice_id, s.decided_at, 'approved', s.decided_by, 'Approved: "' || s.comment || '"'
  FROM invoice_approval_steps s WHERE s.status = 'approved'
UNION ALL
SELECT h.invoice_id, h.placed_at, 'hold_placed', NULL, 'Placed on hold: price variance'
  FROM invoice_holds h
UNION ALL
SELECT r.invoice_id, r.rejected_at, 'rejected', r.rejected_by, 'Rejected: ' || r.reason
  FROM invoice_rejections r
UNION ALL
SELECT a.invoice_id, p.created_at, 'payment_scheduled', p.created_by, 'Added to payment run on ' || to_char(p.scheduled_date, 'Mon DD')
  FROM payments p JOIN payment_allocations a ON a.payment_id = p.id WHERE p.status = 'scheduled'
UNION ALL
SELECT a.invoice_id, p.paid_at, 'paid', NULL, 'Paid by ACH: ' || p.bank_reference
  FROM payments p JOIN payment_allocations a ON a.payment_id = p.id WHERE p.status = 'paid'
UNION ALL
SELECT a.invoice_id, p.remittance_sent_at, 'remittance_sent', NULL, 'Remittance advice emailed to ' || p.remittance_email
  FROM payments p JOIN payment_allocations a ON a.payment_id = p.id WHERE p.status = 'paid';

COMMIT;
