import type { ServiceStatus } from "../../../types";
import { http } from "../../http/client";

/** Whether the demo is paused for today (daily cap reached). Never touches the database. */
export function fetchServiceStatus(): Promise<ServiceStatus> {
  return http.get<ServiceStatus>("/status", { errorMessage: "Couldn't check the service status." });
}
