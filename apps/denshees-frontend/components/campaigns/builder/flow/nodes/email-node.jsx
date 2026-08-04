"use client";

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import {
  EmailIcon,
  AeroplaneIcon,
  MessageSquareIcon,
} from "mage-icons-react/bulk";
import { PIN_META } from "@/components/campaigns/builder/flow/pins";

const EmailNode = ({ data }) => {
  const {
    label,
    pitch,
    isSelected,
    isDeletable,
    onOpen,
    onDelete,
    contactCount,
    replyCount,
    totalContacts,
  } = data;

  const contactPercentage =
    totalContacts > 0 ? Math.round((contactCount / totalContacts) * 100) : 0;

  return (
    <div
      onClick={() => onOpen?.(pitch)}
      className={`relative h-full px-3 py-2 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] cursor-pointer transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] ${
        isSelected ? "bg-black text-white" : "bg-white text-black"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!bg-black !border-2 !border-white !w-3.5 !h-3.5"
      />

      {isDeletable && (
        <button
          type="button"
          title="Remove this email"
          onClick={(event) => {
            event.stopPropagation();
            onDelete?.(pitch);
          }}
          className="absolute -top-2.5 -right-2.5 w-5 h-5 z-10 flex items-center justify-center bg-white text-black border-2 border-black text-xs font-bold leading-none hover:bg-red-600 hover:text-white hover:border-red-600 transition-colors"
        >
          ×
        </button>
      )}

      <div className="flex items-center gap-2 pr-16">
        <EmailIcon className="w-[18px] h-[18px] shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-bold leading-tight">{label}</div>
          <div className="text-xs truncate max-w-[140px] opacity-80">
            {pitch.subject || "No subject"}
          </div>
        </div>
      </div>

      <div
        className={`mt-1.5 pt-1.5 border-t space-y-0.5 pr-14 ${
          isSelected ? "border-white/25" : "border-black/15"
        }`}
      >
        <div className="flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1">
            <AeroplaneIcon className="w-3 h-3" />
            Contacts
          </span>
          <span className="font-bold">
            {contactCount}
            <span
              className={`ml-1 text-[10px] ${
                isSelected ? "text-white/60" : "text-gray-500"
              }`}
            >
              ({contactPercentage}%)
            </span>
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span
            className={`flex items-center gap-1 ${
              isSelected ? "text-green-400" : "text-green-700"
            }`}
          >
            <MessageSquareIcon className="w-3 h-3" />
            Replies
          </span>
          <span className="font-bold">{replyCount}</span>
        </div>
        <div
          className={`text-[10px] ${
            isSelected ? "text-white/60" : "text-gray-500"
          }`}
        >
          Delay {pitch.delayDays ?? 1}d
        </div>
      </div>

      {PIN_META.map((pin, index) => {
        const top = `${((index + 1) / (PIN_META.length + 1)) * 100}%`;
        return (
          <div key={pin.id}>
            <span
              className="absolute right-4 text-[9px] font-bold -translate-y-1/2 pointer-events-none"
              style={{
                top,
                color: isSelected ? "rgba(255,255,255,0.85)" : pin.color,
              }}
            >
              {pin.label}
            </span>
            <Handle
              type="source"
              position={Position.Right}
              id={pin.id}
              style={{ top, background: pin.color }}
              className="!border-2 !border-white !w-3.5 !h-3.5"
            />
          </div>
        );
      })}
    </div>
  );
};

export default memo(EmailNode);
