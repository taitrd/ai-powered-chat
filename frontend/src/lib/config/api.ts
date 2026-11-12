/** Base path for backend calls. Same origin by default: Vite proxies it locally, API Gateway / FastAPI in production. */
export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "/api/v1";
