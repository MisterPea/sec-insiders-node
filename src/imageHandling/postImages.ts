import { Database } from "../types.js";
import { replyToTweet, uploadPngAndPostTwitter } from "./twitter/post.js";
import { chunkUrlsForReplies, packAccessionUrls } from "./postHelpers.js";
import { replyToPostBluesky, uploadPngAndPostBluesky } from "./bluesky/post.js";

/**
 * Function to handle coordination of posting images - and rate limiting to 17 posts per 24h
 * @param database Reference to main database
 */
export async function postImages(database: any) {
  const p1 = postToTwitter(database);
  const p2 = postToBluesky(database);
  const [r1, r2] = await Promise.all([p1, p2]);
  return { r1, r2 };
}

async function postToTwitter(database: Database) {
  const ALLOWED_TWITTER_ATTEMPTS = 17; // 17 attempts in 24h (86.4M ms)
  const query = `
    SELECT cluster_id FROM cluster_post
    WHERE last_twitter_attempt >= (unixepoch('now') * 1000) - 86400000
  `;
  const recentAttempts = await database.getAllData(query);

  let adjustedTwitterAttempts = ALLOWED_TWITTER_ATTEMPTS - recentAttempts.length;

  try {
    while (adjustedTwitterAttempts > 0) {
      adjustedTwitterAttempts -= 1;

      const imgPostRtn = await _postImageTwitter(database);
      if (!imgPostRtn) break;

      console.info(`POSTED:${imgPostRtn}`);

      await _sleep(180_000); // 3 minutes
    }
  } catch (err) {
    console.error(err);
  }
}

async function postToBluesky(database: Database) {
  // Bluesky doesn't have a upper limit for posts in a 24 hour period for us to 
  // contend with, so we son't have to keep track of posts per time-period

  try {
    while (true) {
      const blueskyReturn = await _postImageBluesky(database);
      if (!blueskyReturn) break;

      console.info(`POSTED::BLUESKY-${blueskyReturn}`);

      await _sleep(180_000); // 3 minutes
    }
  } catch (err) {
    console.error(err);
  }
}




async function _sleep(ms: number) {
  return new Promise<void>(res => setTimeout(res, ms));
}

async function _postImageTwitter(database: any) {
  // Mark db row as in-progress
  const query = `
   UPDATE cluster_post
      SET was_posted_twitter = 'posting_image', last_twitter_attempt = unixepoch('now') * 1000
      WHERE cluster_id = (
        SELECT cluster_id FROM cluster_post
        WHERE was_posted_twitter = 'image_created'
        LIMIT 1
      )
      RETURNING cluster_id, accession_urls, ticker, purchase_or_sale
  `;
  const clusterPost = await database.getData(query);
  if (!clusterPost) return false;

  const { cluster_id, accession_urls, ticker, purchase_or_sale } = clusterPost;

  // Set tweet text
  const isPurchOrSale = purchase_or_sale === 'P' ? 'purchases' : 'sales';
  const header = `Insider ${isPurchOrSale} for (${ticker})`;
  const accessionArray = JSON.parse(accession_urls);

  // If we have too much, save for overflow for successive replies
  const { mainText, overflow } = packAccessionUrls({ header, urls: accessionArray });

  const { tweetId } = await uploadPngAndPostTwitter({ clusterId: cluster_id, text: mainText });

  if (overflow.length) {
    const replyChunks = chunkUrlsForReplies(overflow);

    let parent = tweetId;
    for (const text of replyChunks) {
      const replyId = await replyToTweet(parent, text);
      parent = replyId;
    }
  }

  // On success mark as done
  if (tweetId) {
    const successQuery = `
      UPDATE cluster_post
      SET was_posted_twitter = 'success - id:' || ?
      WHERE was_posted_twitter = 'posting_image' AND cluster_id = ?
    `;
    await database.setData(successQuery, [[tweetId, cluster_id]]);
  } else {
    const failQuery = `
      UPDATE cluster_post
      SET was_posted_twitter = 'failed'
      WHERE was_posted_twitter = 'posting_image' AND cluster_id = ?
    `;
    await database.setData(failQuery, [[cluster_id]]);
  }
  return tweetId;
}

export async function _postImageBluesky(database: Database) {
  // Mark db row as in-progress
  const query = `
   UPDATE cluster_post
      SET was_posted_bluesky = 'posting_image', last_bluesky_attempt = unixepoch('now') * 1000
      WHERE cluster_id = (
        SELECT cluster_id FROM cluster_post
        WHERE was_posted_bluesky = 'image_created'
        LIMIT 1
      )
      RETURNING cluster_id, accession_urls, ticker, purchase_or_sale
  `;
  const clusterPost = await database.getData(query);
  if (!clusterPost) return false;

  const { cluster_id, accession_urls, ticker, purchase_or_sale } = clusterPost;

  // Set post text
  const isPurchOrSale = purchase_or_sale === 'P' ? 'purchases' : 'sales';
  const headerText = `Insider ${isPurchOrSale} for (${ticker})`;
  const accessionArray = JSON.parse(accession_urls);

  // If we have too much, save for overflow for successive replies
  const { mainText, mainLinks, overflowLinks } = packAccessionUrls({ header: headerText, urls: accessionArray, isBluesky: true });

  const response = await uploadPngAndPostBluesky({ clusterId: cluster_id, headerText, mainText, mainLinks });

  // Overflow links
  if (overflowLinks.length
    && response
    && Object.prototype.hasOwnProperty.call(response, 'uri')
    && Object.prototype.hasOwnProperty.call(response, 'cid')
  ) {
    await replyToPostBluesky(response, overflowLinks);
  }

  if (response) {
    const successQuery = `
      UPDATE cluster_post
      SET was_posted_bluesky = 'success - id:' || ?
      WHERE was_posted_bluesky = 'posting_image' AND cluster_id = ?
    `;
    await database.setData(successQuery, [[JSON.stringify(response.cid), cluster_id]]);
  } else {
    const failQuery = `
      UPDATE cluster_post
      SET was_posted_bluesky = 'failed'
      WHERE was_posted_bluesky = 'posting_image' AND cluster_id = ?
    `;
    await database.setData(failQuery, [[cluster_id]]);
  }
  return response ? JSON.stringify(response.cid) : false;
}
