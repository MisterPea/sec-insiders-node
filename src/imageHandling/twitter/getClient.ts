import fs from "node:fs/promises";
import process from "process";
process.loadEnvFile(".env");

import { Client, OAuth2, type OAuth2Config, type OAuth2Token } from "@xdevplatform/xdk";

const TOKEN_PATH = process.env.TWITTER_TOKEN_PATH ?? "./.twitter.tokens.json";

async function loadTokens(): Promise<OAuth2Token> {
  const raw = await fs.readFile(TOKEN_PATH, "utf8");
  return JSON.parse(raw) as OAuth2Token;
}

async function saveTokens(tokens: OAuth2Token) {
  await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2), "utf8");
}

export async function getAuthedClient(): Promise<Client> {
  const clientId = process.env.TWITTER_CLIENT_ID!;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET!;
  const redirectUri = process.env.TWITTER_API_REDIRECT_URI!;

  const oauth2Config: OAuth2Config = {
    clientId,
    clientSecret,
    redirectUri,
    scope: ["tweet.write", "tweet.read", "users.read", "offline.access"],
  };

  const oauth2 = new OAuth2(oauth2Config);
  const tokens = await loadTokens();

  // If SDK exposes expires fields, use them. If not, just refresh on failure (see note below).
  const expiresAtMs =
    (tokens as any).expires_at ? Number((tokens as any).expires_at) * 1000 : undefined;

  let accessToken = tokens.access_token;

  if (expiresAtMs && Date.now() >= expiresAtMs - 30_000) {
    if (!tokens.refresh_token) throw new Error("No refresh_token stored.");
    // Refresh method name can vary; in this SDK it’s commonly refreshToken(...)
    const refreshed: OAuth2Token = await (oauth2 as any).refreshToken(tokens.refresh_token);
    await saveTokens(refreshed);
    accessToken = refreshed.access_token;
  }

  return new Client({ accessToken });
}