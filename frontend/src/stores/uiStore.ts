import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ModelInfo, ToastItem } from "../types";
import { fetchModels } from "../services/api";

interface UiState {
  sidebarOpen: boolean;
  isWakingUp: boolean;
  models: ModelInfo[];
  selectedModelId: string;
  toasts: ToastItem[];
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setIsWakingUp: (waking: boolean) => void;
  setSelectedModelId: (id: string) => void;
  loadModels: () => Promise<void>;
  addToast: (toast: Omit<ToastItem, "id">) => void;
  removeToast: (id: string) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      sidebarOpen: true,
      isWakingUp: false,
      models: [],
      selectedModelId: "",
      toasts: [],

      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open: boolean) => set({ sidebarOpen: open }),
      setIsWakingUp: (isWakingUp: boolean) => set({ isWakingUp }),
      setSelectedModelId: (selectedModelId: string) => set({ selectedModelId }),

      loadModels: async () => {
        try {
          const models = await fetchModels();
          set({ models });
          const current = get().selectedModelId;
          if (!current && models.length > 0) {
            set({ selectedModelId: models[0].id });
          }
        } catch {
          // ignore error on model fetch or show toast
        }
      },

      addToast: (toast) => {
        const id = Math.random().toString(36).substring(2, 9);
        const newToast: ToastItem = { ...toast, id };
        set((state) => ({ toasts: [...state.toasts, newToast] }));

        // Auto remove success/info toasts after 5s
        if (toast.type !== "error") {
          setTimeout(() => {
            get().removeToast(id);
          }, 5000);
        }
      },

      removeToast: (id: string) => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
      },
    }),
    {
      name: "ui-preferences",
      partialize: (state) => ({
        selectedModelId: state.selectedModelId,
      }),
    }
  )
);
