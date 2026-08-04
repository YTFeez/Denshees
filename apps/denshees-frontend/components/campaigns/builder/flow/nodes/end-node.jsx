"use client";

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";

const EndNode = () => (
  <div className="h-full px-4 py-3 bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center gap-3 min-w-[120px]">
    <Handle
      type="target"
      position={Position.Left}
      id="in"
      className="!bg-black !border-2 !border-white !w-3 !h-3"
    />
    <div>
      <div className="text-sm font-bold leading-tight">End</div>
      <div className="text-[10px] text-gray-500">Stop sequence</div>
    </div>
  </div>
);

export default memo(EndNode);
