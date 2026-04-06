import { randomUUID } from "crypto";
import type { Response } from "express";
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

interface PendingSession {
  client: OAuthClientInformationFull;
  params: AuthorizationParams;
  expiresAt: number;
}

interface PendingCode {
  codeChallenge: string;
  clientId: string;
  scopes: string[];
  expiresAt: number;
}

interface IssuedToken {
  clientId: string;
  scopes: string[];
  expiresAt: number;
}

/**
 * Simple in-memory OAuth provider that wraps an existing Bearer token.
 *
 * Enables Claude Desktop (which requires OAuth) to authenticate using the
 * same MCP_AUTH_TOKEN that Claude Code uses via direct Bearer headers.
 *
 * Flow:
 *   1. Client redirects to /authorize
 *   2. Provider shows HTML form asking for MCP_AUTH_TOKEN
 *   3. User submits → POST /oauth/login
 *   4. If valid, issues auth code and redirects to client callback
 *   5. Client exchanges code for access token via /token
 *   6. Access token accepted by requireBearerAuth on /mcp
 *
 * verifyAccessToken accepts BOTH:
 *   - Raw MCP_AUTH_TOKEN (Claude Code via headers in ~/.claude.json)
 *   - OAuth-issued tokens (Claude Desktop after auth flow)
 */
export class SimpleOAuthProvider implements OAuthServerProvider {
  private _clientsStore: OAuthRegisteredClientsStore;
  private sessions = new Map<string, PendingSession>();
  private codes = new Map<string, PendingCode>();
  private tokens = new Map<string, IssuedToken>();
  private authToken: string;
  private serverName: string;

  private clients = new Map<string, OAuthClientInformationFull>();

  constructor(authToken: string, serverName = "Grafana MCP") {
    this.authToken = authToken;
    this.serverName = serverName;
    this._clientsStore = {
      getClient: async (clientId) => this.clients.get(clientId),
      registerClient: async (client) => {
        const full: OAuthClientInformationFull = {
          ...client,
          client_id: randomUUID(),
          client_id_issued_at: Math.floor(Date.now() / 1000),
        };
        this.clients.set(full.client_id, full);
        return full;
      },
    };
  }

  get clientsStore(): OAuthRegisteredClientsStore {
    return this._clientsStore;
  }

  /**
   * Auto-register an unknown client with its redirect_uri from the authorize request.
   * Called before mcpAuthRouter processes /authorize so cached client_ids survive restarts.
   */
  ensureClient(clientId: string, redirectUri: string): void {
    if (!this.clients.has(clientId)) {
      this.clients.set(clientId, {
        client_id: clientId,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        redirect_uris: [redirectUri],
      });
    }
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    const sessionId = randomUUID();
    this.sessions.set(sessionId, {
      client,
      params,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    const clientName = client.client_name || "Claude Desktop";
    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Authorize ${this.serverName}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 400px; margin: 80px auto; padding: 0 20px; color: #1a1a1a; }
    h2 { margin-bottom: 6px; }
    .sub { color: #666; margin-bottom: 24px; font-size: 14px; }
    label { display: block; margin-bottom: 6px; font-weight: 500; font-size: 14px; }
    input[type=password] { width: 100%; padding: 8px 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; box-sizing: border-box; }
    input[type=password]:focus { outline: none; border-color: #0066cc; box-shadow: 0 0 0 2px rgba(0,102,204,0.2); }
    button { margin-top: 14px; width: 100%; padding: 10px; background: #0066cc; color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 500; }
    button:hover { background: #0055b3; }
  </style>
</head>
<body>
  <h2>Authorize ${this.serverName}</h2>
  <p class="sub">${clientName} is requesting access. Enter your MCP auth token to continue.</p>
  <form method="POST" action="/oauth/login">
    <input type="hidden" name="session_id" value="${sessionId}">
    <label for="token">Auth Token</label>
    <input type="password" id="token" name="token" placeholder="Paste your MCP_AUTH_TOKEN" autofocus>
    <button type="submit">Authorize</button>
  </form>
</body>
</html>`);
  }

  async handleLogin(
    sessionId: string,
    token: string
  ): Promise<
    { success: true; redirectUrl: string } | { success: false; error: string }
  > {
    const session = this.sessions.get(sessionId);
    if (!session || session.expiresAt < Date.now()) {
      return { success: false, error: "Session expired. Please try again." };
    }

    if (token !== this.authToken) {
      return { success: false, error: "Invalid auth token." };
    }

    this.sessions.delete(sessionId);

    const code = randomUUID();
    this.codes.set(code, {
      codeChallenge: session.params.codeChallenge,
      clientId: session.client.client_id,
      scopes: session.params.scopes || [],
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    const redirectUrl = new URL(session.params.redirectUri);
    redirectUrl.searchParams.set("code", code);
    if (session.params.state) {
      redirectUrl.searchParams.set("state", session.params.state);
    }

    return { success: true, redirectUrl: redirectUrl.toString() };
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    const codeData = this.codes.get(authorizationCode);
    if (!codeData || codeData.expiresAt < Date.now()) {
      throw new Error("Invalid or expired authorization code");
    }
    return codeData.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string
  ): Promise<OAuthTokens> {
    const codeData = this.codes.get(authorizationCode);
    if (!codeData || codeData.expiresAt < Date.now()) {
      throw new Error("Invalid or expired authorization code");
    }
    if (codeData.clientId !== client.client_id) {
      throw new Error("Authorization code was not issued to this client");
    }
    this.codes.delete(authorizationCode);

    const token = randomUUID();
    const expiresIn = 86400 * 365;
    this.tokens.set(token, {
      clientId: client.client_id,
      scopes: codeData.scopes,
      expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
    });

    return {
      access_token: token,
      token_type: "bearer",
      expires_in: expiresIn,
      scope: codeData.scopes.join(" "),
    };
  }

  async exchangeRefreshToken(
    _client: OAuthClientInformationFull,
    _refreshToken: string
  ): Promise<OAuthTokens> {
    throw new Error("Refresh tokens not supported");
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const longLived = Math.floor(Date.now() / 1000) + 86400 * 365 * 10;

    if (token === this.authToken) {
      return { token, clientId: "claude-code", scopes: ["mcp"], expiresAt: longLived };
    }

    const tokenData = this.tokens.get(token);
    if (!tokenData) {
      throw new Error("Invalid token");
    }
    return {
      token,
      clientId: tokenData.clientId,
      scopes: tokenData.scopes,
      expiresAt: tokenData.expiresAt,
    };
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest
  ): Promise<void> {
    this.tokens.delete(request.token);
  }
}
