import type { ModelInfo } from "../../../types";
import { http } from "../../http/client";

/** Active AI providers. This endpoint never touches the database. */
export function fetchModels(): Promise<ModelInfo[]> {
  return http.get<ModelInfo[]>("/models", {
    errorMessage: "Couldn't load AI providers.",
  });
}
