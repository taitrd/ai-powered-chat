export const authConfig = {
  mode: (import.meta.env.VITE_AUTH_MODE || "local") as "local" | "cognito",
  userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || "",
  clientId: import.meta.env.VITE_COGNITO_CLIENT_ID || "",
  region: import.meta.env.VITE_AWS_REGION || "us-east-1",
};
