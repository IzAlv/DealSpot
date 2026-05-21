export const TRADE_STATUS_CONFIG = {
  'confirmation': { label: 'Biz. Confirmation', color: 'bg-blue-100 text-blue-800', order: 1 },
  'draft-contract': { label: 'Draft Contract', color: 'bg-indigo-100 text-indigo-800', order: 2 },
  'nomination-sent': { label: 'Nomination Sent', color: 'bg-cyan-100 text-cyan-800', order: 3 },
  'di-sent': { label: 'DI (Docs. Inst.) Sent', color: 'bg-teal-100 text-teal-800', order: 4 },
  'drafts-confirmation': { label: 'Drafts Confirmation', color: 'bg-sky-100 text-sky-800', order: 5 },
  'appropriation': { label: 'Vessel Nominated', color: 'bg-violet-100 text-violet-800', order: 6 },
  'dox': { label: 'Documents', color: 'bg-purple-100 text-purple-800', order: 7 },
  'pmt': { label: 'Waiting Payment', color: 'bg-fuchsia-100 text-fuchsia-800', order: 8 },
  'disch': { label: 'Vessel Discharge', color: 'bg-pink-100 text-pink-800', order: 9 },
  'shortage': { label: 'Shortage', color: 'bg-orange-100 text-orange-800', order: 10 },
  'demurrage': { label: 'Demurrage', color: 'bg-amber-100 text-amber-800', order: 11 },
  'dispatch': { label: 'Dispatch', color: 'bg-lime-100 text-lime-800', order: 12 },
  'brokerage': { label: 'Brokerage', color: 'bg-emerald-100 text-emerald-800', order: 13 },
  'completed': { label: 'Completed', color: 'bg-slate-100 text-slate-600', order: 14 },
  'cancelled': { label: 'Cancelled', color: 'bg-red-100 text-red-800', order: 15 },
  'washout': { label: 'Washout', color: 'bg-rose-100 text-rose-800', order: 16 },
  'pending': { label: 'Confirmation', color: 'bg-blue-100 text-blue-800', order: 1 },
  'ongoing': { label: 'Ongoing', color: 'bg-emerald-100 text-emerald-800', order: 7 },
  'wash-out': { label: 'Washout', color: 'bg-rose-100 text-rose-800', order: 16 },
  'draft': { label: 'Confirmation', color: 'bg-blue-100 text-blue-800', order: 1 },
  'active': { label: 'Ongoing', color: 'bg-emerald-100 text-emerald-800', order: 7 },
};

export const PENDING_STATUSES = ['confirmation', 'draft-contract', 'nomination-sent', 'pending', 'draft'];
export const ONGOING_STATUSES = ['di-sent', 'drafts-confirmation', 'appropriation', 'dox', 'pmt', 'disch', 'shortage', 'demurrage', 'dispatch', 'brokerage', 'ongoing', 'active'];
export const COMPLETED_STATUSES = ['completed'];
export const WASHOUT_STATUSES = ['washout', 'wash-out'];
export const CANCELLED_STATUSES = ['cancelled'];

export const STATUS_OPTIONS = [
  { value: 'confirmation', label: 'Biz. Confirmation' },
  { value: 'draft-contract', label: 'Draft Contract' },
  { value: 'nomination-sent', label: 'Nomination Sent' },
  { value: 'di-sent', label: 'DI (Docs. Inst.) Sent' },
  { value: 'drafts-confirmation', label: 'Drafts Confirmation' },
  { value: 'appropriation', label: 'Vessel Nominated' },
  { value: 'dox', label: 'Documents' },
  { value: 'pmt', label: 'Waiting Payment' },
  { value: 'disch', label: 'Vessel Discharge' },
  { value: 'shortage', label: 'Shortage' },
  { value: 'demurrage', label: 'Demurrage' },
  { value: 'dispatch', label: 'Dispatch' },
  { value: 'brokerage', label: 'Brokerage' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'washout', label: 'Washout' },
];

export const DOCUMENT_TYPES = [
  { id: 'bill_of_lading', name: 'Bill of Lading', shortName: 'B/L' },
  { id: 'commercial_invoice', name: 'Commercial Invoice', shortName: 'C/I' },
  { id: 'phytosanitary', name: 'Phytosanitary Certificate', shortName: 'Phyto' },
  { id: 'certificate_of_origin', name: 'Certificate of Origin', shortName: 'C/O' },
  { id: 'quality_certificate', name: 'Quality Certificate', shortName: 'Q/C' },
  { id: 'weight_certificate', name: 'Weight Certificate', shortName: 'W/C' },
  { id: 'fumigation_certificate', name: 'Fumigation Certificate', shortName: 'Fumi' },
];

export const EVENT_TYPES = {
  payment: { label: 'Payment', color: 'bg-green-100 text-green-800 border-green-200' },
  meeting: { label: 'Meeting', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  conference: { label: 'Conference', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  other: { label: 'Other', color: 'bg-slate-100 text-slate-800 border-slate-200' },
};
