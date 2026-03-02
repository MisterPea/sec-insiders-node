import { AtpAgent, AtpSessionData, AtpSessionEvent } from "@atproto/api";
import { readFile, writeFile, unlink } from "node:fs/promises";
import fs from "node:fs/promises";
import path from "node:path";

const TOKEN_FILE = "secrets/.bluesky.tokens.json";

type StoredSession = {
  // shape is whatever agent.session returns in @atproto/api,
  // but it includes accessJwt/refreshJwt + did/handle.
  session: any;
};

async function loadSession(): Promise<any | null> {
  try {
    const raw = await readFile(TOKEN_FILE, "utf8");
    const parsed = JSON.parse(raw) as StoredSession;
    return parsed.session ?? null;
  } catch {
    return null;
  }
}

// super small mutex for local process.
class Mutex {
  private p = Promise.resolve();
  async run<T>(fn: () => Promise<T>) {
    const prev = this.p;
    let release!: () => void;
    this.p = new Promise<void>(r => (release = r));
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}


async function saveSession(session: AtpSessionData) {
  await writeFile(TOKEN_FILE, JSON.stringify(session, null, 2), "utf8");
}

async function clearSessionFile() {
  try { await unlink(TOKEN_FILE); } catch {console.warn('No Bluesky TOKEN_FILE') }
}

const authMutex = new Mutex();

async function _getBlueskyAgent(): Promise<AtpAgent> {
  return authMutex.run(async () => {
    const agent = new AtpAgent({
      service: "https://bsky.social",
      // Persist on CREATE + REFRESH so the file always has the latest refreshJwt  [oai_citation:3‡docs.bsky.app](https://docs.bsky.app/blog/ts-api-refactor)
      persistSession: async (evt: AtpSessionEvent, session?: AtpSessionData) => {
        if (!session) return;
        await saveSession(session);
      },
    });

    const existing = await loadSession();
    if (existing) {
      try {
        await agent.resumeSession(existing);
        return agent;
      } catch (err: any) {
        // If token is revoked, the only fix is: clear + re-login
        const msg = String(err?.message ?? err);
        if (msg.includes("Token has been revoked") || msg.includes("ExpiredToken")) {
          await clearSessionFile();
        } else {
          throw err;
        }
      }
    }

    // First-time or recovered login (use an APP PASSWORD here)
    await agent.login({
      identifier: process.env.BLUESKY_USERNAME!,
      password: process.env.BLUESKY_PASSWORD!,
    });

    // login will also trigger persistSession, but saving once here doesn’t hurt
    if (agent.session) await saveSession(agent.session);

    return agent;
  });
}

type BlueskyPostInput = {
  clusterId: string;
  headerText: string;
  mainText: string;
  mainLinks: string[];
};

export async function uploadPngAndPostBluesky({ clusterId, headerText = '', mainText, mainLinks }: BlueskyPostInput) {
  const agent = await _getBlueskyAgent();
  const imgPath = path.join(process.cwd(), "images", `${clusterId}_bluesky.png`);
  const fileBuffer = await fs.readFile(imgPath);

  const uploadResult = await agent.uploadBlob(fileBuffer, { encoding: 'image/png' });
  const imageBlob = uploadResult.data.blob;
  const headerLen = headerText.length + 1;
  const facets = [];
  let startIndex = headerLen;

  // Format facet array
  for (const link of mainLinks) {
    const endIndex = startIndex + 25; // offset for "sec.gov/Archives/edgar...\n"
    facets.push({
      index: { byteStart: startIndex, byteEnd: endIndex },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: link }]
    });
    startIndex = endIndex + 1;
  }

  const postData = {
    $type: 'app.bsky.feed.post' as const,
    createdAt: new Date().toISOString(),
    text: `${headerText}\n${mainText}`,
    facets: facets,
    embed: {
      $type: 'app.bsky.embed.images',
      images: [{
        alt: `Image showing ${headerText}`,
        image: imageBlob,
        "aspectRatio": {
          "width": 4,
          "height": 3
        }
      }],
    },
  };

  const response = await agent.post(postData);
  return response;
}

export async function replyToPostBluesky(parent: { uri: string, cid: string; }, overflow: string[]) {
  const agent = await _getBlueskyAgent();
  const { uri, cid } = parent;
  let replyText = '';
  const facets = [];
  let startIndex = 0;

  for (const link of overflow) {
    const endIndex = startIndex + 25;
    replyText += 'sec.gov/Archives/edgar...\n';
    facets.push({
      index: { byteStart: startIndex, byteEnd: endIndex },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: link }]
    });
    startIndex = endIndex + 1;
  }

  const postData = {
    $type: 'app.bsky.feed.post' as const,
    createdAt: new Date().toISOString(),
    text: replyText,
    facets: facets,
    reply: {
      root: {
        uri: uri,
        cid: cid,
      },
      parent: {
        uri: uri,
        cid: cid,
      }
    }
  };

  const response = await agent.post(postData);
  return response;
}