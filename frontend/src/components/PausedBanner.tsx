import React from "react";
import { MoonStar } from "lucide-react";
import { useAppSelector } from "../stores/hooks";

/** Formats the resume time in the visitor's own time zone, e.g. "7:00 AM". */
function localTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Shown while the demo is paused for the day (daily database budget reached). */
export const PausedBanner: React.FC = () => {
  const pausedUntil = useAppSelector((s) => s.ui.pausedUntil);
  if (!pausedUntil) return null;

  return (
    <div
      role="status"
      className="bg-indigo-600 text-white text-xs md:text-sm px-4 py-2.5 flex items-center justify-center gap-2 shadow-sm"
    >
      <MoonStar className="w-4 h-4 shrink-0" />
      <span>
        <strong>The demo is resting for today.</strong> It has reached its daily limit and will be
        back at {localTime(pausedUntil)} your time. Your saved chats are still here to read.
      </span>
    </div>
  );
};
