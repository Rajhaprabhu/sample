// Sample invoices for the demo dashboard. Dates are offsets in days from today
// so the aging buckets always look realistic. Replace with an API call, e.g.
//   fetch('/api/invoices').then((r) => r.json())

const STATUSES = [
  { key: 'received', label: 'Received',         hint: 'Captured, awaiting review' },
  { key: 'pending',  label: 'Pending approval', hint: 'With approvers' },
  { key: 'approved', label: 'Approved',         hint: 'Ready to schedule' },
  { key: 'scheduled',label: 'Scheduled',        hint: 'Payment run booked' },
  { key: 'on_hold',  label: 'On hold',          hint: 'Exception / dispute' },
  { key: 'paid',     label: 'Paid',             hint: 'Last 30 days' },
  { key: 'rejected', label: 'Rejected',         hint: 'Last 30 days' },
];

// [invoice #, vendor, invoice-date offset, due-date offset, amount, status]
const RAW_INVOICES = [
  ['INV-10421', 'Northwind Office Supply', -3,  27,   1240.50, 'received'],
  ['INV-10422', 'Bluepeak Logistics',      -2,  28,   8930.00, 'received'],
  ['INV-10423', 'Cedar & Pine Facilities', -1,  44,   3150.00, 'received'],
  ['INV-10418', 'Metro Electric Co.',      -9,  21,   2475.80, 'pending'],
  ['INV-10415', 'Atlas IT Services',      -14,  16,  15600.00, 'pending'],
  ['INV-10409', 'Bluepeak Logistics',     -38,  -8,   7420.25, 'pending'],
  ['INV-10401', 'Harbor Print Works',     -52, -22,    865.00, 'pending'],
  ['INV-10412', 'Greenfield Catering',    -18,  12,   1980.00, 'approved'],
  ['INV-10406', 'Atlas IT Services',      -40, -10,  12300.00, 'approved'],
  ['INV-10397', 'Summit Legal LLP',       -71, -41,  22500.00, 'approved'],
  ['INV-10410', 'Metro Electric Co.',     -24,   6,   2310.40, 'scheduled'],
  ['INV-10407', 'Northwind Office Supply',-28,   2,    945.10, 'scheduled'],
  ['INV-10399', 'Cedar & Pine Facilities',-33,  -3,   4200.00, 'scheduled'],
  ['INV-10388', 'Riverbend Software',     -95, -65,   9875.00, 'on_hold'],
  ['INV-10379', 'Harbor Print Works',    -128, -98,   1430.00, 'on_hold'],
  ['INV-10402', 'Greenfield Catering',    -46, -16,    620.00, 'on_hold'],
  ['INV-10395', 'Atlas IT Services',      -55, -25,  14800.00, 'paid'],
  ['INV-10393', 'Metro Electric Co.',     -58, -28,   2290.00, 'paid'],
  ['INV-10390', 'Bluepeak Logistics',     -60, -30,   6710.00, 'paid'],
  ['INV-10404', 'Northwind Office Supply',-35,  -5,   1105.75, 'paid'],
  ['INV-10400', 'Unknown Vendor Ltd',     -41, -11,   3300.00, 'rejected'],
];

const INVOICES = RAW_INVOICES.map(([number, vendor, invOffset, dueOffset, amount, status]) => {
  const day = (offset) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + offset);
    return d;
  };
  return { number, vendor, invoiceDate: day(invOffset), dueDate: day(dueOffset), amount, status };
});
