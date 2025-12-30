import { replyToTweet, uploadPngAndPost } from "./twitter/post.js";
import { chunkUrlsForReplies, packAccessionUrls } from "./twitter/postHelpers.js";

export async function postImageTwitter(database: any) {
  // Mark db row as in-progress
  const query = `
   UPDATE cluster_post
      SET was_posted_twitter = 'posting_image', last_twitter_attempt = unixepoch('now') * 1000
      WHERE cluster_id = (
        SELECT cluster_id FROM cluster_post
        WHERE was_posted_twitter = 'image_created'
        LIMIT 1
      )
      RETURNING cluster_id,accession_urls, ticker, purchase_or_sale
  `;
  const { cluster_id, accession_urls, ticker, purchase_or_sale } = await database.getData(query);

  // Set tweet text
  const isPurchOrSale = purchase_or_sale === 'P' ? 'purchases' : 'sales';
  const header = `Insider ${isPurchOrSale} for (${ticker})`;
  const accessionArray = JSON.parse(accession_urls);

  // If we have too much, save for overflow for successive replies
  const { mainText, overflow } = packAccessionUrls({ header, urls: accessionArray });

  const { tweetId } = await uploadPngAndPost({ clusterId: cluster_id, text: mainText });

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

export function postImageBluesky() { }
