import React from "react";
import { Loader2 } from "lucide-react";
import { useUiStore } from "../stores/uiStore";

export const WakingBanner: React.FC = () => {
  const isWakingUp = useUiStore((s) => s.isWakingUp);

  if (!isWakingUp) return null;

  return (
    <div className="bg-amber-500 text-white text-xs md:text-sm px-4 py-2 flex items-center justify-center gap-2 shadow-sm animate-pulse">
      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      <span>
        <strong>Waking up the demo:</strong> The database scales to zero when idle. This first request may take 15–30 seconds.
      </span>
    </div>
  );
};
