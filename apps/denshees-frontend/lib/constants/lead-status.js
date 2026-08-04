


export const LEAD_STATUSES = [
  { value: "PENDING", label: "Pending" },
  { value: "RUNNING", label: "Running" },
  { value: "REPLIED", label: "Replied" },
  { value: "COMPLETED", label: "Completed" },
  { value: "BOUNCED", label: "Bounced" },
  { value: "FAILED", label: "Failed" },
];

export const LEAD_STATUS_VALUES = LEAD_STATUSES.map((s) => s.value);



export const DEFAULT_LEAD_STATUSES = ["PENDING", "RUNNING", "REPLIED"];



export const ACTIVE_LEAD_STATUSES = ["PENDING", "RUNNING"];



export function parseStatusFilter(param) {
  if (!param) return null;
  const statuses = param
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => LEAD_STATUS_VALUES.includes(s));
  return statuses.length ? statuses : null;
}
