import fs from "node:fs/promises";
import process from "process";

import { Client, type OAuth2Token } from "@xdevplatform/xdk";

export type LocalToken = OAuth2Token & {
  // epoch ms
  expires_at: number;
  // optional debugging
  obtained_at?: number;
};

const TOKEN_PATH = "secrets/.twitter.tokens.json";
const EXPIRY_SAFETY_MS = 60_000;

async function loadTokens(): Promise<LocalToken> {
  const raw = await fs.readFile(TOKEN_PATH, "utf8");
  return JSON.parse(raw) as LocalToken;
}

async function saveTokens(tokens: LocalToken) {
  await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2), "utf8");
}

function computeExpiresAt(nowMs: number, expiresInSec?: number) {
  // If expires_in is missing, force refresh-on-failure strategy.
  if (!expiresInSec || !Number.isFinite(expiresInSec)) return nowMs + 5 * 60_000; // 5 min fallback
  return nowMs + expiresInSec * 1000;
}

export async function getAuthedClient(): Promise<Client> {
  const clientId = process.env.TWITTER_CLIENT_ID!;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET!;
  const redirectUri = process.env.TWITTER_API_REDIRECT_URI!;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Missing TWITTER_CLIENT_ID / TWITTER_CLIENT_SECRET / TWITTER_API_REDIRECT_URI");
  }

  const tokens = await loadTokens();

  // If expires_at missing (old token file), synthesize from expires_in and now as best effort
  if (!tokens.expires_at) {
    const now = Date.now();
    tokens.obtained_at = now;
    tokens.expires_at = computeExpiresAt(now, (tokens as any).expires_in);
    await saveTokens(tokens);
  }

  // Still valid? return.
  if (tokens.expires_at > Date.now() + EXPIRY_SAFETY_MS) {
    return new Client({ accessToken: tokens.access_token });
  }

  // Expired (or close). Refresh.
  if (!tokens.refresh_token) throw new Error("Access token expired and no refresh_token stored.");

  const tokenData = {
    clientId,
    clientSecret,
    scope: tokens.scope || '',
    tokenType: tokens.token_type || '',
    refreshToken: tokens.refresh_token || ''
  };

  const refreshed = await refreshToken(tokenData);

  const now = Date.now();
  const newTokens: LocalToken = {
    ...tokens,
    ...refreshed,
    // keep old refresh token if refresh response omits it
    refresh_token: refreshed.refresh_token ?? tokens.refresh_token,
    obtained_at: now,
    expires_at: computeExpiresAt(now, (refreshed as any).expires_in),
  };

  await saveTokens(newTokens);
  return new Client({ accessToken: newTokens.access_token });
}

async function refreshToken({
  clientId,
  clientSecret,
  scope,
  tokenType,
  refreshToken }:
  {
    clientId: string,
    clientSecret: string,
    scope: string,
    tokenType: string,
    refreshToken: string;
  }) {

  const url = "https://api.x.com/2/oauth2/token";

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId
  });

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body,
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Token refresh failed ${res.status}: ${text}`);

  const json = JSON.parse(text) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
  };

  const now = Date.now();
  const expiresIn = json.expires_in ?? 7200;

  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? refreshToken, // keep old if not rotated
    expires_in: expiresIn,
    expires_at: now + expiresIn * 1000 - EXPIRY_SAFETY_MS,
    scope: json.scope ?? scope,
    token_type: json.token_type ?? tokenType,
  };
}