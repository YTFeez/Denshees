export const BLOCK_HANDLES = {
  START: { inputs: [], outputs: [{ id: "out", label: "Out", color: "#111827" }] },
  EMAIL: {
    inputs: [{ id: "in", label: "In" }],
    outputs: [
      { id: "out", label: "Out", color: "#111827" },
      { id: "resend", label: "Resend", color: "#b45309" },
    ],
  },
  WAIT: {
    inputs: [{ id: "in", label: "In" }],
    outputs: [
      { id: "replied", label: "Replied", color: "#15803d" },
      { id: "opened", label: "Opened", color: "#1d4ed8" },
      { id: "no_reply", label: "No reply", color: "#4b5563" },
      { id: "mail", label: "Mail", color: "#7c3aed" },
    ],
  },
  END: { inputs: [{ id: "in", label: "In" }], outputs: [] },
};

export const HANDLE_COLORS = {
  out: "#111827",
  resend: "#b45309",
  replied: "#15803d",
  opened: "#1d4ed8",
  no_reply: "#4b5563",
  mail: "#7c3aed",
};

export const NODE_SIZE = {
  start: { width: 180, height: 72 },
  email: { width: 240, height: 130 },
  wait: { width: 220, height: 168 },
  end: { width: 130, height: 64 },
};
