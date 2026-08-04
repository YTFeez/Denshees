"use client";

import { useEffect, useRef } from "react";
import { useReactFlow } from "@xyflow/react";

const AutoFit = ({ structureKey }) => {
  const { fitView } = useReactFlow();
  const prevKey = useRef("");

  useEffect(() => {
    if (!structureKey || structureKey === prevKey.current) return;
    const isFirst = !prevKey.current;
    prevKey.current = structureKey;

    const t = setTimeout(() => {
      fitView({ padding: 0.2, duration: isFirst ? 0 : 280 });
    }, 40);
    return () => clearTimeout(t);
  }, [structureKey, fitView]);

  return null;
};

export default AutoFit;
