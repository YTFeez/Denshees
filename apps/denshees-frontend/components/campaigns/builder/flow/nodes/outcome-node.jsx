"use client";

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import {
  MessageSquareIcon,
  EyeIcon,
  CancelIcon,
} from "mage-icons-react/bulk";
import { PlusIcon } from "mage-icons-react/stroke";

const VARIANTS = {
  replied: {
    icon: MessageSquareIcon,
    accent: "text-green-700",
    border: "border-green-700",
    bar: "bg-green-700",
  },
  opened: {
    icon: EyeIcon,
    accent: "text-blue-700",
    border: "border-blue-700",
    bar: "bg-blue-700",
  },
  noReply: {
    icon: CancelIcon,
    accent: "text-gray-600",
    border: "border-gray-600",
    bar: "bg-gray-600",
  },
};

const OutcomeNode = ({ data }) => {
  const {
    label,
    count,
    percentage,
    type,
    condition,
    fromPitchId,
    hasBranchEmail,
    branchPitch,
    showAdd,
    onAddBranch,
    onOpenPitch,
    disabled,
  } = data;
  const variant = VARIANTS[type] ?? VARIANTS.noReply;
  const Icon = variant.icon;

  return (
    <div
      className={`h-full px-3 py-2 bg-white border-2 ${variant.border} shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-black !border-2 !border-white !w-3 !h-3"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-black !border-2 !border-white !w-3 !h-3"
      />

      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 shrink-0 ${variant.accent}`} />
        <span className={`text-xs font-bold ${variant.accent}`}>{label}</span>
      </div>

      <div className="text-2xl font-bold leading-none">{count}</div>

      <div>
        <div className="flex items-center justify-between text-[10px] text-gray-500">
          <span>{percentage}%</span>
          {hasBranchEmail && branchPitch ? (
            <button
              type="button"
              className={`underline ${variant.accent}`}
              onClick={() => onOpenPitch?.(branchPitch)}
            >
              edit
            </button>
          ) : null}
        </div>
        <div className="mt-1 h-1 w-full bg-gray-200">
          <div
            className={`h-full ${variant.bar}`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
      </div>

      {showAdd && (
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            onAddBranch?.({
              condition,
              fromPitchId,
              delayDays: 2,
            })
          }
          className="mt-1 w-full text-[10px] font-medium border border-black px-1 py-0.5 hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center gap-0.5"
        >
          <PlusIcon className="w-3 h-3" /> email
        </button>
      )}
    </div>
  );
};

export default memo(OutcomeNode);
