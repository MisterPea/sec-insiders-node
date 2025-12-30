const MAX_CHARS = 280;
const URL_COST = 23;      // each URL counts as 23 chars on X
const SEP_COST = 1;       // newline between URLs

export function packAccessionUrls({ header, urls }: { header: string; urls: string[]; }): { mainText: string; overflow: string[]; } {
  // base text with optional header
  const headerText = header.trim();
  const headerLen = headerText ? headerText.length + 1 /* newline */ : 0;

  let remaining = MAX_CHARS - headerLen;
  const included: string[] = [];
  const overflow: string[] = [];

  for (const u of urls) {
    const cost = (included.length ? SEP_COST : 0) + URL_COST;
    if (remaining - cost >= 0) {
      included.push(u);
      remaining -= cost;
    } else {
      overflow.push(u);
    }
  }

  const mainText = [headerText, included.join("\n")].filter(Boolean).join("\n");
  return { mainText, overflow };
}

export function chunkUrlsForReplies(urls: string[]): string[] {
  const chunks: string[] = [];
  let cur: string[] = [];
  let curCost = 0;

  for (const u of urls) {
    const addCost = (cur.length ? SEP_COST : 0) + URL_COST;
    if (curCost + addCost > MAX_CHARS) {
      chunks.push(cur.join("\n"));
      cur = [u];
      curCost = URL_COST;
    } else {
      cur.push(u);
      curCost += addCost;
    }
  }

  if (cur.length) chunks.push(cur.join("\n"));
  return chunks;
}