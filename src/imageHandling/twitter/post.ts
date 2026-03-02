import fs from "node:fs/promises";
import path from "node:path";
import { getAuthedClient } from './getClient.js';

async function _getAccessToken() {
  const client: any = await getAuthedClient();
  // xdk Client stores token; common pattern is client.config.accessToken
  const accessToken = client?.config?.accessToken ?? client?.accessToken;
  if (!accessToken) throw new Error("Could not locate accessToken on Client");
  return accessToken;
}

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
  const accessToken = await _getAccessToken();

  const data = await postTweetRaw(accessToken, { text });
  return data.data.id as string;
}

export async function replyToTweet(parentId: string, text: string): Promise<string> {
  const accessToken = await _getAccessToken();

  const data = await postTweetRaw(accessToken, {
    text,
    reply: { in_reply_to_tweet_id: parentId },
  });

  return data.data.id as string;
}

///// - Png upload
type InitResp = { data: { id: string; }; };

async function initUpload(accessToken: string, totalBytes: number, mimeType: string) {
  const res = await fetch("https://api.x.com/2/media/upload/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      media_category: "tweet_image",
      media_type: mimeType,      // e.g. "image/png"
      total_bytes: totalBytes,
    }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`INITIALIZE failed ${res.status}: ${text}`);
  return JSON.parse(text) as InitResp;
}

async function appendUpload(accessToken: string, mediaId: string, fileBuf: Buffer) {
  const form = new FormData();
  // docs show either JSON(base64) or multipart; multipart file is simplest
  form.append("media", new Blob([fileBuf as any]), "image.png");
  form.append("segment_index", "0");

  const res = await fetch(`https://api.x.com/2/media/upload/${mediaId}/append`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`APPEND failed ${res.status}: ${text}`);
}

async function finalizeUpload(accessToken: string, mediaId: string) {
  const res = await fetch(`https://api.x.com/2/media/upload/${mediaId}/finalize`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`FINALIZE failed ${res.status}: ${text}`);

  return text ? JSON.parse(text) : null;
}

async function postTweetWithMedia(accessToken: string, text: string, mediaId: string) {
  const res = await fetch("https://api.x.com/2/tweets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      media: { media_ids: [mediaId] },
    }),
  });

  const body = await res.text();
  if (!res.ok) throw new Error(`POST /2/tweets failed ${res.status}: ${body}`);
  return JSON.parse(body).data.id as string;
}

export async function uploadPngAndPostTwitter({ clusterId, text = "" }: { clusterId: string; text?: string; }) {
  const accessToken = await _getAccessToken();
  const imgPath = path.join(process.cwd(), "images", `${clusterId}_twitter.png`);
  const fileBuf = await fs.readFile(imgPath);

  const init = await initUpload(accessToken, fileBuf.byteLength, "image/png");
  const mediaId = init.data.id;

  await appendUpload(accessToken, mediaId, fileBuf);

  const fin = await finalizeUpload(accessToken, mediaId);

  // For images, processing_info usually isn’t present; if it is, poll status.
  const tweetId = await postTweetWithMedia(accessToken, text, mediaId);
  return { tweetId, mediaId, finalize: fin };
}