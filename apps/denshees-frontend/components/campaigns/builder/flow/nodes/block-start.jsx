"use client";

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { AeroplaneIcon } from "mage-icons-react/bulk";

const BlockStart = ({ data }) => (
  <div className="h-full px-4 py-3 bg-black text-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center gap-3">
    <AeroplaneIcon className="w-5 h-5 shrink-0" />
    <div className="flex-1 min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-white/60">
        Block
      </div>
      <div className="text-sm font-bold">Start</div>
      <div className="text-[10px] text-white/70">{data.totalContacts ?? 0} leads</div>
    </div>
    <Handle
      type="source"
      position={Position.Right}
      id="out"
      className="!bg-white !border-2 !border-black !w-3.5 !h-3.5"
    />
  </div>
);

export default memo(BlockStart);
