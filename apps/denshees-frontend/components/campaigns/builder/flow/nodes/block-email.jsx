"use client";

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { EmailIcon } from "mage-icons-react/bulk";

const OUTS = [
  { id: "out", label: "Out", color: "#111827", top: "35%" },
  { id: "resend", label: "Resend", color: "#b45309", top: "70%" },
];

const BlockEmail = ({ data }) => {
  const { pitch, isSelected, onOpen, onDelete, canDelete } = data;

  return (
    <div
      onClick={() => pitch && onOpen?.(pitch)}
      className={`relative h-full px-3 py-2 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] cursor-pointer ${
        isSelected ? "bg-black text-white" : "bg-white text-black"
      }`}
    >
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
            onDelete?.(data.node);
          }}
        >
          ×
        </button>
      )}

      <div className="text-[10px] uppercase tracking-wide opacity-60">Email</div>
      <div className="flex items-center gap-2 mt-0.5 pr-14">
        <EmailIcon className="w-4 h-4 shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-bold truncate">
            {pitch?.title || "Email"}
          </div>
          <div className="text-[11px] truncate opacity-70 max-w-[140px]">
            {pitch?.subject || "No subject"}
          </div>
        </div>
      </div>

      {OUTS.map((pin) => (
        <div key={pin.id}>
          <span
            className="absolute right-4 text-[9px] font-bold -translate-y-1/2 pointer-events-none"
            style={{
              top: pin.top,
              color: isSelected ? "rgba(255,255,255,0.85)" : pin.color,
            }}
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

export default memo(BlockEmail);
