import * as modelsApi from "../../../services/api/models/modelsApi";
import * as statusApi from "../../../services/api/status/statusApi";
import { ApiError } from "../../../services/http/client";
import type { ToastItem } from "../../../types";
import type { AppThunk } from "../../index";
import { createAppAsyncThunk, errorMessage } from "../../hooks";
import { toastAdded, toastRemoved } from "./uiSlice";

const TOAST_TIMEOUT_MS = 5000;

export const fetchModels = createAppAsyncThunk(
  "ui/fetchModels",
  async (_: void, { rejectWithValue }) => {
    try {
      return await modelsApi.fetchModels();
    } catch (error) {
      return rejectWithValue(errorMessage(error, "Couldn't load AI providers."));
    }
  }
);

export const fetchServiceStatus = createAppAsyncThunk(
  "ui/fetchServiceStatus",
  async (_: void, { rejectWithValue }) => {
    try {
      return await statusApi.fetchServiceStatus();
    } catch (error) {
      return rejectWithValue(errorMessage(error, "Couldn't check the service status."));
    }
  }
);

/** True when the backend refused a call because the daily demo limit was reached. */
export function isDailyLimitError(error: unknown): boolean {
  return error instanceof ApiError && error.code === "daily_limit";
}

/** Shows a toast. Errors stay until dismissed; other toasts close after 5 seconds. */
export const showToast =
  (toast: Omit<ToastItem, "id">): AppThunk =>
  (dispatch) => {
    const { payload } = dispatch(toastAdded(toast));
    if (toast.type !== "error") {
      setTimeout(() => dispatch(toastRemoved(payload.id)), TOAST_TIMEOUT_MS);
    }
  };
