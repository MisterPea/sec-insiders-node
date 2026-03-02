import http from "node:http";
import { URL } from "node:url";
import fs from "node:fs/promises";
import process from "process";

import {
  OAuth2,
  generateCodeVerifier,
  generateCodeChallenge,
  type OAuth2Config,
  type OAuth2Token,
} from "@xdevplatform/xdk";
import { LocalToken } from "./getClient.js";

const TOKEN_PATH = "secrets/.twitter.tokens.json";

async function saveTokens(tokens: LocalToken) {
  await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2), "utf8");
}

function waitForAuthCode(redirectUri: string, expectedState: string): Promise<string> {
  const u = new URL(redirectUri);
  const port = Number(u.port || "80");
  const host = u.hostname;
  const path = u.pathname;

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const reqUrl = new URL(req.url ?? "", `http://${req.headers.host}`);
        if (reqUrl.pathname !== path) {
          res.writeHead(404).end("Not found");
          return;
        }

        const code = reqUrl.searchParams.get("code");
        const state = reqUrl.searchParams.get("state");

        if (!code) {
          res.writeHead(400).end("Missing code");
          return;
        }
        if (state !== expectedState) {
          res.writeHead(400).end("State mismatch");
          return;
        }

        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("Approved. You can close this tab.");
        server.close();
        resolve(code);
      } catch (e) {
        server.close();
        reject(e);
      }
    });

    server.listen(port, host, () => { });
    server.on("error", reject);
  });
}

(async () => {
  const clientId = process.env.TWITTER_CLIENT_ID!;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET!;
  const redirectUri = process.env.TWITTER_API_REDIRECT_URI!;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Missing TWITTER_CLIENT_ID / TWITTER_CLIENT_SECRET / TWITTER_API_REDIRECT_URI");
  }

  // IMPORTANT: include tweet.write if we want to post/reply
  const oauth2Config: OAuth2Config = {
    clientId,
    clientSecret,
    redirectUri,
    scope: ["tweet.write", "tweet.read", "users.read", "offline.access", "media.write"],
  };

  const oauth2 = new OAuth2(oauth2Config);

  const state = cryptoRandom();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  oauth2.setPkceParameters(codeVerifier, codeChallenge);

  const authUrl = await oauth2.getAuthorizationUrl(state);

  console.log("\nOpen this URL in your browser and approve:\n");
  console.log(authUrl);
  console.log("\nWaiting for callback:", redirectUri);

  const authCode = await waitForAuthCode(redirectUri, state);
  const tokens: OAuth2Token = await oauth2.exchangeCode(authCode, codeVerifier);
  const now = Date.now();
  const localTokens = {
    ...tokens,
    obtained_at: now,
    expires_at: now + (tokens.expires_in ?? 0) * 1000,
  };

  await saveTokens(localTokens);

  console.log("\n✅ Saved OAuth2 tokens to", TOKEN_PATH);
})();

function cryptoRandom(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("hex");
}