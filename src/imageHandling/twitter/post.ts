import { getAuthedClient } from './getClient.js';

async function postTweetRaw(accessToken: string, body: any) {
  const res = await fetch("https://api.x.com/2/tweets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`X API error ${res.status}: ${text}`);
  return JSON.parse(text);
}

export async function postTweet(text: string): Promise<string> {
  const client: any = await getAuthedClient();
  // xdk Client stores token; common pattern is client.config.accessToken
  const accessToken = client?.config?.accessToken ?? client?.accessToken;
  if (!accessToken) throw new Error("Could not locate accessToken on Client");

  const data = await postTweetRaw(accessToken, { text });
  return data.data.id as string;
}

export async function replyToTweet(parentId: string, text: string): Promise<string> {
  const client: any = await getAuthedClient();
  const accessToken = client?.config?.accessToken ?? client?.accessToken;
  if (!accessToken) throw new Error("Could not locate accessToken on Client");

  const data = await postTweetRaw(accessToken, {
    text,
    reply: { in_reply_to_tweet_id: parentId },
  });

  return data.data.id as string;
}