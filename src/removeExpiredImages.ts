import path from 'node:path';
import { rm } from 'node:fs/promises';

export async function removeExpiredImages(db: any) {
  const dir = './images';
  const query = `
    SELECT cluster_id FROM cluster_post
    WHERE DATE(expiration_date) < DATE('now');
  `;

  const toDelete = await db.getAllData(query);

  for (const { cluster_id } of toDelete) {
    const twitterPath = path.join(dir, `${cluster_id}_twitter.png`);
    const blueskyPath = path.join(dir, `${cluster_id}_bluesky.png`);

    try {
      await rm(twitterPath);
      console.info(`Deleted Twitter image:${cluster_id}`);
    } catch {
      console.warn('Error deleting image:', twitterPath);
    }

    try {
      await rm(blueskyPath);
      console.info(`Deleted Bluesky image:${cluster_id}`);
    } catch {
      console.warn('Error deleting image:', blueskyPath);
    }

    const deleteRowQuery = `
      DELETE FROM cluster_post
      WHERE cluster_id = ?
    `;
    await db.setData(deleteRowQuery, [cluster_id]);
  }
  return;
}
