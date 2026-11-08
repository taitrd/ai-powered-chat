import { createSlice, nanoid, type PayloadAction } from "@reduxjs/toolkit";
import type { ModelInfo, ToastItem } from "../../../types";
import type { RootState } from "../../index";
import { fetchModels } from "./uiThunks";

export interface UiState {
  sidebarOpen: boolean;
  isWakingUp: boolean;
  models: ModelInfo[];
  loadingModels: boolean;
  selectedModelId: string;
  toasts: ToastItem[];
}

export const initialState: UiState = {
  sidebarOpen: true,
  isWakingUp: false,
  models: [],
  loadingModels: false,
  selectedModelId: "",
  toasts: [],
};

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    sidebarToggled(state) {
      state.sidebarOpen = !state.sidebarOpen;
    },
    sidebarOpenSet(state, action: PayloadAction<boolean>) {
      state.sidebarOpen = action.payload;
    },
    wakingUpSet(state, action: PayloadAction<boolean>) {
      state.isWakingUp = action.payload;
    },
    modelSelected(state, action: PayloadAction<string>) {
      state.selectedModelId = action.payload;
    },
    toastAdded: {
      reducer(state, action: PayloadAction<ToastItem>) {
        state.toasts.push(action.payload);
      },
      prepare(toast: Omit<ToastItem, "id">) {
        return { payload: { ...toast, id: nanoid() } };
      },
    },
    toastRemoved(state, action: PayloadAction<string>) {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchModels.pending, (state) => {
        state.loadingModels = true;
      })
      .addCase(fetchModels.fulfilled, (state, action) => {
        state.loadingModels = false;
        state.models = action.payload;
        const stillAvailable = state.models.some((m) => m.id === state.selectedModelId);
        if (!stillAvailable) {
          state.selectedModelId = state.models[0]?.id ?? "";
        }
      })
      .addCase(fetchModels.rejected, (state) => {
        state.loadingModels = false;
      });
  },
});

export const {
  sidebarToggled,
  sidebarOpenSet,
  wakingUpSet,
  modelSelected,
  toastAdded,
  toastRemoved,
} = uiSlice.actions;

export const selectSelectedModel = (state: RootState): ModelInfo | undefined =>
  state.ui.models.find((m) => m.id === state.ui.selectedModelId);

export default uiSlice.reducer;
