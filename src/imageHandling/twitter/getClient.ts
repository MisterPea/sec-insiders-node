import fs from "node:fs/promises";
import process from "process";
process.loadEnvFile(".env");

import { Client, OAuth2, type OAuth2Config, type OAuth2Token } from "@xdevplatform/xdk";

export type LocalToken = OAuth2Token & {
  // epoch ms
  expires_at: number;
  // optional debugging
  obtained_at?: number;
};

const TOKEN_PATH = process.env.TWITTER_TOKEN_PATH ?? "./.twitter.tokens.json";
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

  const oauth2Config: OAuth2Config = {
    clientId,
    clientSecret,
    redirectUri,
    scope: ["tweet.write", "tweet.read", "users.read", "offline.access", "media.write"],
  };

  const oauth2 = new OAuth2(oauth2Config);
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

  const refreshed: OAuth2Token = await (oauth2 as any).refreshToken(tokens.refresh_token);

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