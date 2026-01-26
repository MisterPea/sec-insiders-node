const MAX_CHARS = 280;
let URL_COST = 23;      // each URL counts as 23 chars on X
const SEP_COST = 1;       // newline between URLs

type PackInput = {
  header: string;
  urls: string[];
  isBluesky?: boolean;
};

type PackOutput = {
  mainText: string;
  overflow: string[];
  mainLinks: string[];
  overflowLinks: string[];
};

/**
 * Packs urls and text into length conscious packages. 
 * If isBluesky is true header will not be included, but will be counted in the main/overflow tally
 * @param {PackInput} 
 * @returns {PackOutput}
 */
export function packAccessionUrls({ header, urls, isBluesky = false }: PackInput): PackOutput {
  if(isBluesky) URL_COST = 25;
  // base text with optional header
  const headerText = header.trim();
  const headerLen = headerText ? headerText.length + 1 /* newline */ : 0;

  let remaining = MAX_CHARS - headerLen;
  const included: string[] = [];
  const overflow: string[] = [];
  const mainLinks: string[] = [];
  const overflowLinks: string[] = [];
  const BLUESKY_LINK = 'sec.gov/Archives/edgar...';


  for (let u of urls) {
    const cost = (included.length ? SEP_COST : 0) + URL_COST;
    if (remaining - cost >= 0) {
      mainLinks.push(u);
      if (isBluesky) u = BLUESKY_LINK;

      included.push(u);
      remaining -= cost;
    } else {
      overflowLinks.push(u);
      if (isBluesky) u = BLUESKY_LINK;

      overflow.push(u);
    }
  }

  const mainText = [isBluesky ? '' : headerText, included.join("\n")].filter(Boolean).join("\n");
  return { mainText, overflow, mainLinks, overflowLinks };
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