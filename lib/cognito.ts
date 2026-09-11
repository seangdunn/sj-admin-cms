import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  AssociateSoftwareTokenCommand,
  VerifySoftwareTokenCommand,
  SetUserMFAPreferenceCommand,
  GlobalSignOutCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { env } from "./env";
import { saveSession, clearSession, type Session } from "./session";

// USER_PASSWORD_AUTH via the SDK directly, not Amplify Auth or the SRP
// flow in amazon-cognito-identity-js — Amplify is unjustified weight for
// a single login form used by 1-2 known admins, and SRP defends against a
// threat (password sent to the server) that TLS already covers here.
// Tradeoff named explicitly: USER_PASSWORD_AUTH must be enabled on the
// app client (off by default) and is less "textbook" than SRP — accepted
// given the tiny, known admin user base.
const client = new CognitoIdentityProviderClient({ region: env.awsRegion });

export interface MfaChallenge {
  challengeName: "SOFTWARE_TOKEN_MFA";
  session: string;
  email: string;
}

export type SignInResult =
  | { status: "success"; session: Session }
  | { status: "mfa_required"; challenge: MfaChallenge };

function sessionFromAuthResult(result: {
  IdToken?: string;
  AccessToken?: string;
  RefreshToken?: string;
  ExpiresIn?: number;
}): Session {
  if (!result.IdToken || !result.AccessToken || !result.RefreshToken || !result.ExpiresIn) {
    throw new Error("Cognito auth result is missing required tokens");
  }
  return {
    idToken: result.IdToken,
    accessToken: result.AccessToken,
    refreshToken: result.RefreshToken,
    expiresAt: Date.now() + result.ExpiresIn * 1000,
  };
}

export async function signIn(email: string, password: string): Promise<SignInResult> {
  const response = await client.send(
    new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: env.userPoolClientId,
      AuthParameters: { USERNAME: email, PASSWORD: password },
    })
  );

  if (response.ChallengeName === "SOFTWARE_TOKEN_MFA") {
    if (!response.Session) {
      throw new Error("Cognito MFA challenge is missing a session token");
    }
    return {
      status: "mfa_required",
      challenge: { challengeName: "SOFTWARE_TOKEN_MFA", session: response.Session, email },
    };
  }

  if (!response.AuthenticationResult) {
    throw new Error("Sign-in did not return tokens or a recognized challenge");
  }

  const session = sessionFromAuthResult(response.AuthenticationResult);
  saveSession(session);
  return { status: "success", session };
}

export async function respondToMfaChallenge(
  challenge: MfaChallenge,
  code: string
): Promise<Session> {
  const response = await client.send(
    new RespondToAuthChallengeCommand({
      ClientId: env.userPoolClientId,
      ChallengeName: "SOFTWARE_TOKEN_MFA",
      Session: challenge.session,
      ChallengeResponses: {
        USERNAME: challenge.email,
        SOFTWARE_TOKEN_MFA_CODE: code,
      },
    })
  );

  if (!response.AuthenticationResult) {
    throw new Error("MFA challenge did not return tokens");
  }

  const session = sessionFromAuthResult(response.AuthenticationResult);
  saveSession(session);
  return session;
}

export async function refreshSession(refreshToken: string): Promise<Session> {
  const response = await client.send(
    new InitiateAuthCommand({
      AuthFlow: "REFRESH_TOKEN_AUTH",
      ClientId: env.userPoolClientId,
      AuthParameters: { REFRESH_TOKEN: refreshToken },
    })
  );

  const result = response.AuthenticationResult;
  if (!result?.IdToken || !result.AccessToken || !result.ExpiresIn) {
    throw new Error("Refresh did not return new tokens");
  }

  // REFRESH_TOKEN_AUTH doesn't return a new refresh token (rotation isn't
  // enabled on this app client) — the original one is still valid.
  const session: Session = {
    idToken: result.IdToken,
    accessToken: result.AccessToken,
    refreshToken,
    expiresAt: Date.now() + result.ExpiresIn * 1000,
  };
  saveSession(session);
  return session;
}

export async function signOut(accessToken: string): Promise<void> {
  try {
    await client.send(new GlobalSignOutCommand({ AccessToken: accessToken }));
  } catch {
    // best-effort — still clear the local session even if the server-side
    // call fails (e.g. the token already expired)
  } finally {
    clearSession();
  }
}

// ---- MFA enrollment — requires an authenticated access token, so this
// only runs from an already-logged-in session (the /settings page), never
// from the login page itself. ----

export async function startMfaEnrollment(accessToken: string): Promise<string> {
  const response = await client.send(
    new AssociateSoftwareTokenCommand({ AccessToken: accessToken })
  );
  if (!response.SecretCode) {
    throw new Error("Cognito did not return a TOTP secret");
  }
  return response.SecretCode;
}

export async function confirmMfaEnrollment(accessToken: string, code: string): Promise<void> {
  const verifyResponse = await client.send(
    new VerifySoftwareTokenCommand({ AccessToken: accessToken, UserCode: code })
  );
  if (verifyResponse.Status !== "SUCCESS") {
    throw new Error("Invalid verification code");
  }
  await client.send(
    new SetUserMFAPreferenceCommand({
      AccessToken: accessToken,
      SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true },
    })
  );
}
