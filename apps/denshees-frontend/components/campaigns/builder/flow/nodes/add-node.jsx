"use client";

import { memo, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { EmailIcon } from "mage-icons-react/bulk";
import { cn } from "@/lib/utils";

export const BLOCK_OPTIONS = [
  {
    kind: "followup",
    delayDays: 3,
    label: "Follow-up (3 days)",
    hint: "Relance après 3 jours",
  },
  {
    kind: "followup",
    delayDays: 5,
    label: "Follow-up (5 days)",
    hint: "Relance après 5 jours",
  },
  {
    kind: "breakup",
    delayDays: 4,
    label: "Break-up (4 days)",
    hint: "Dernier mail, ton soft",
  },
];

const AddNode = ({ data }) => {
  const [open, setOpen] = useState(false);
  const disabled = data.disabled;

  const pick = (option) => {
    if (disabled) return;
    setOpen(false);
    data.onAdd?.(option);
  };

  return (
    <div className="h-full relative">
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-gray-500 !border-2 !border-white !w-2.5 !h-2.5"
      />

      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className={cn(
          "w-full h-full flex items-center justify-center gap-1 text-sm font-medium",
          "bg-white text-black border-2 border-dashed border-gray-500",
          "hover:border-black hover:border-solid hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]",
          "transition-all disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        <span className="text-base leading-none">+</span> Add block
      </button>

      {open && !disabled && (
        <>
          <button
            type="button"
            aria-label="Close block menu"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full mt-2 z-50 w-56 border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div className="px-3 py-2 border-b border-black">
              <p className="text-xs font-bold">Add to sequence</p>
              <p className="text-[10px] text-gray-500 mt-0.5">
                Appends a real email step (linear)
              </p>
            </div>
            <div className="p-1">
              {BLOCK_OPTIONS.map((option) => (
                <button
                  key={`${option.kind}-${option.delayDays}`}
                  type="button"
                  onClick={() => pick(option)}
                  className="w-full text-left px-2 py-2 hover:bg-gray-50 flex items-start gap-2"
                >
                  <EmailIcon className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    <span className="block text-sm font-medium">
                      {option.label}
                    </span>
                    <span className="block text-[11px] text-gray-500">
                      {option.hint}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default memo(AddNode);
