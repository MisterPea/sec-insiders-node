import path from 'node:path';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function removeExpiredImages(db: any, imageDir: string = path.resolve(__dirname, '../images')) {
  const dir = imageDir;
  const query = `
    SELECT cluster_id FROM cluster_post
    WHERE DATE(expiration_date) < DATE('now');
  `;

  const toDelete = await db.getAllData(query);

  for (const { cluster_id } of toDelete) {
    const twitterPath = path.join(dir, `${cluster_id}_twitter.png`);
    const blueskyPath = path.join(dir, `${cluster_id}_bluesky.png`);
    let deleteFailed = false;

    try {
      await rm(twitterPath, { force: true });
      console.info(`Deleted Twitter image:${cluster_id}`);
    } catch (error) {
      deleteFailed = true;
      console.warn('Error deleting image:', twitterPath, error);
    }

    try {
      await rm(blueskyPath, { force: true });
      console.info(`Deleted Bluesky image:${cluster_id}`);
    } catch (error) {
      deleteFailed = true;
      console.warn('Error deleting image:', blueskyPath, error);
    }

    if (deleteFailed) {
      console.warn(`Skipping cluster_post delete for cluster_id:${cluster_id}`);
      continue;
    }

    const deleteRowQuery = `
      DELETE FROM cluster_post
      WHERE cluster_id = ?
    `;
    await db.setData(deleteRowQuery, [cluster_id]);
  }
  return;
}
