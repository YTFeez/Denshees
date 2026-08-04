"use client";

import { memo, useEffect, useState } from "react";
import { Handle, Position } from "@xyflow/react";

const OUTS = [
  { id: "replied", label: "Replied", color: "#15803d", top: "22%" },
  { id: "opened", label: "Opened", color: "#1d4ed8", top: "42%" },
  { id: "no_reply", label: "No reply", color: "#4b5563", top: "62%" },
  { id: "mail", label: "Mail", color: "#7c3aed", top: "82%" },
];

const BlockWait = ({ data }) => {
  const { node, onSaveDelay, onDelete, canDelete } = data;
  const delayDays = Number(node?.config?.delayDays ?? 1);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(delayDays));

  useEffect(() => {
    setValue(String(delayDays));
  }, [delayDays]);

  return (
    <div className="relative h-full px-3 py-2 bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!bg-black !border-2 !border-white !w-3.5 !h-3.5"
      />

      {canDelete && (
        <button
          type="button"
          className="absolute -top-2 -right-2 w-5 h-5 z-10 bg-white border-2 border-black text-xs font-bold hover:bg-red-600 hover:text-white"
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.(node);
          }}
        >
          ×
        </button>
      )}

      <div className="text-[10px] uppercase tracking-wide text-gray-500">
        Wait
      </div>
      <div className="text-sm font-bold mt-0.5">Delay</div>

      {editing ? (
        <form
          className="mt-1 flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(value);
            if (Number.isFinite(n) && n >= 0) onSaveDelay?.(node, n);
            setEditing(false);
          }}
        >
          <input
            autoFocus
            className="w-14 border border-black px-1 text-sm"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => {
              const n = Number(value);
              if (Number.isFinite(n) && n >= 0 && n !== delayDays) {
                onSaveDelay?.(node, n);
              }
              setEditing(false);
            }}
          />
          <span className="text-xs">days</span>
        </form>
      ) : (
        <button
          type="button"
          className="mt-1 text-xs underline"
          onClick={() => {
            setValue(String(delayDays));
            setEditing(true);
          }}
        >
          {delayDays} day{delayDays === 1 ? "" : "s"}
        </button>
      )}

      <div className="mt-1 text-[9px] text-gray-400 pr-14 leading-tight">
        Mail = fallback if branch unwired
      </div>

      {OUTS.map((pin) => (
        <div key={pin.id}>
          <span
            className="absolute right-4 text-[9px] font-bold -translate-y-1/2 pointer-events-none"
            style={{ top: pin.top, color: pin.color }}
          >
            {pin.label}
          </span>
          <Handle
            type="source"
            position={Position.Right}
            id={pin.id}
            style={{ top: pin.top, background: pin.color }}
            className="!border-2 !border-white !w-3.5 !h-3.5"
          />
        </div>
      ))}
    </div>
  );
};

export default memo(BlockWait);
