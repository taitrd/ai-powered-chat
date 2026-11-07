import React from "react";
import { ShieldAlert } from "lucide-react";

export const DemoNotice: React.FC = () => {
  return (
    <div className="bg-gray-100/80 border-t border-gray-200 text-gray-500 text-[11px] py-1.5 px-4 text-center flex items-center justify-center gap-1.5 select-none">
      <ShieldAlert className="w-3.5 h-3.5 text-gray-400 shrink-0" />
      <span>
        Demo mode active. Daily limits apply. Do not enter sensitive information.
      </span>
    </div>
  );
};
