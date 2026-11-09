/**
 * AWS Cognito client-side authentication.
 * Uses AWS Cognito Identity Provider HTTPS API directly from the browser.
 */
import { authConfig } from "../../lib/config/auth";

export interface CognitoTokens {
  accessToken: string;
  idToken: string;
  refreshToken?: string;
}

export class CognitoError extends Error {
  constructor(
    message: string,
    readonly type?: string,
  ) {
    super(message);
    this.name = "CognitoError";
  }
}

async function cognitoRequest<T>(
  target: string,
  params: Record<string, unknown>,
): Promise<T> {
  const endpoint = `https://cognito-idp.${authConfig.region}.amazonaws.com/`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(params),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const errorType = data.__type || "";
    const message =
      data.message || data.Message || errorType || "Cognito request failed";
    throw new CognitoError(message, errorType);
  }

  return data as T;
}

export async function cognitoSignUp(
  email: string,
  password: string,
): Promise<{ userSub: string; userConfirmed: boolean }> {
  const data = await cognitoRequest<{
    UserSub: string;
    UserConfirmed: boolean;
  }>("SignUp", {
    ClientId: authConfig.clientId,
    Username: email,
    Password: password,
    UserAttributes: [{ Name: "email", Value: email }],
  });
  return { userSub: data.UserSub, userConfirmed: data.UserConfirmed };
}

export async function cognitoConfirmSignUp(
  email: string,
  code: string,
): Promise<void> {
  await cognitoRequest("ConfirmSignUp", {
    ClientId: authConfig.clientId,
    Username: email,
    ConfirmationCode: code,
  });
}

export async function cognitoSignIn(
  email: string,
  password: string,
): Promise<CognitoTokens> {
  interface AuthResponse {
    AuthenticationResult?: {
      AccessToken: string;
      IdToken: string;
      RefreshToken?: string;
    };
  }

  const data = await cognitoRequest<AuthResponse>("InitiateAuth", {
    ClientId: authConfig.clientId,
    AuthFlow: "USER_PASSWORD_AUTH",
    AuthParameters: {
      USERNAME: email,
      PASSWORD: password,
    },
  });

  const result = data.AuthenticationResult;
  if (!result?.AccessToken || !result?.IdToken) {
    throw new CognitoError("Missing authentication tokens in response");
  }

  return {
    accessToken: result.AccessToken,
    idToken: result.IdToken,
    refreshToken: result.RefreshToken,
  };
}

export async function cognitoRefreshToken(
  refreshToken: string,
): Promise<CognitoTokens> {
  interface RefreshResponse {
    AuthenticationResult?: {
      AccessToken: string;
      IdToken: string;
    };
  }

  const data = await cognitoRequest<RefreshResponse>("InitiateAuth", {
    ClientId: authConfig.clientId,
    AuthFlow: "REFRESH_TOKEN_AUTH",
    AuthParameters: {
      REFRESH_TOKEN: refreshToken,
    },
  });

  const result = data.AuthenticationResult;
  if (!result?.AccessToken || !result?.IdToken) {
    throw new CognitoError("Missing authentication tokens in response");
  }

  return {
    accessToken: result.AccessToken,
    idToken: result.IdToken,
    refreshToken,
  };
}

export async function cognitoForgotPassword(email: string): Promise<void> {
  await cognitoRequest("ForgotPassword", {
    ClientId: authConfig.clientId,
    Username: email,
  });
}

export async function cognitoConfirmForgotPassword(
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  await cognitoRequest("ConfirmForgotPassword", {
    ClientId: authConfig.clientId,
    Username: email,
    ConfirmationCode: code,
    Password: newPassword,
  });
}
