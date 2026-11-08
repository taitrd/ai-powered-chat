import React from "react";
import { AlertCircle, CheckCircle, Info, RefreshCw, X } from "lucide-react";
import { useAppDispatch, useAppSelector } from "../stores/hooks";
import { sendMessage } from "../stores/features/chat/chatThunks";
import { toastRemoved } from "../stores/features/ui/uiSlice";

export const ToastContainer: React.FC = () => {
  const dispatch = useAppDispatch();
  const toasts = useAppSelector((s) => s.ui.toasts);
  const removeToast = (id: string) => dispatch(toastRemoved(id));

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col gap-2 max-w-md w-full pointer-events-none px-4">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl shadow-lg border text-sm transition-all animate-in slide-in-from-bottom-2 ${
            toast.type === "error"
              ? "bg-red-50 border-red-200 text-red-800"
              : toast.type === "success"
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-blue-50 border-blue-200 text-blue-800"
          }`}
        >
          {toast.type === "error" && <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />}
          {toast.type === "success" && <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />}
          {toast.type === "info" && <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />}

          <div className="flex-1">
            <p className="font-medium">{toast.message}</p>
            {toast.retryMessage && (
              <button
                onClick={() => {
                  removeToast(toast.id);
                  if (toast.retryMessage) dispatch(sendMessage(toast.retryMessage));
                }}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 hover:text-red-900 underline"
              >
                <RefreshCw className="w-3 h-3" /> Retry
              </button>
            )}
          </div>

          <button
            onClick={() => removeToast(toast.id)}
            className="text-gray-400 hover:text-gray-600 p-0.5 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};
