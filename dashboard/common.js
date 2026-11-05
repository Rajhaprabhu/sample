// Shared by the dashboard pages whichever data source they use (the sample
// data in this folder, or the AP Portal API when served by the .NET backend).

const STATUSES = [
  { key: 'received', label: 'Received',         hint: 'Captured, awaiting review' },
  { key: 'pending',  label: 'Pending approval', hint: 'With approvers' },
  { key: 'approved', label: 'Approved',         hint: 'Ready to schedule' },
  { key: 'scheduled',label: 'Scheduled',        hint: 'Payment run booked' },
  { key: 'on_hold',  label: 'On hold',          hint: 'Exception / dispute' },
  { key: 'paid',     label: 'Paid',             hint: 'Last 30 days' },
  { key: 'rejected', label: 'Rejected',         hint: 'Last 30 days' },
];

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function dayDiff(later, earlier) {
  return Math.round((later - earlier) / 86400000);
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Next payment run: payments go out on Tuesdays and Fridays.
function nextPaymentRun(from) {
  let d = addDays(from, 1);
  while (![2, 5].includes(d.getDay())) d = addDays(d, 1);
  return d;
}
