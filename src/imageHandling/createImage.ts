import puppeteer from 'puppeteer';
import { ClusterRecord, Database } from '../types.js';
import fs from 'fs';
import path from 'path';

async function _claimNextClusterPost(db: Database): Promise<ClusterRecord | undefined> {
  const row = await db.getData(`
    UPDATE cluster_post
    SET 
      was_posted_twitter = CASE WHEN was_posted_twitter = 'pending' THEN 'processing_image' ELSE was_posted_twitter  END,
      was_posted_bluesky = CASE WHEN was_posted_bluesky = 'pending' THEN 'processing_image' ELSE was_posted_bluesky  END
    WHERE rowid = (
      SELECT rowid
      FROM cluster_post
      WHERE was_posted_twitter = 'pending'
        AND was_posted_bluesky = 'pending'
      LIMIT 1
    )
    RETURNING *
    `);
  return row;
}

async function _screenshotHtmlToFile(page: puppeteer.Page, htmlString: string, outputPath: string, aspectRatio: string = 'twitter') {
  const width = aspectRatio === 'twitter' ? 1500 : 1500; // twitter: 3/2 - bluesky: 4/3
  const height = aspectRatio === 'twitter' ? 1000 : 1125;

  await page.goto('about:blank', { waitUntil: 'load' });

  await page.setViewport({
    width,
    height,
    deviceScaleFactor: 4
  });

  await page.setContent(htmlString, { waitUntil: "networkidle0" });

  // wait for webfonts to finish
  await page.evaluate(() => (document as any).fonts?.ready);

  const element = await page.$('.main-content') ?? await page.$('body');
  if (!element) throw new Error('No element found to screenshot');

  await page.screenshot({
    path: outputPath,
    type: 'webp',
    omitBackground: false,
    quality: 100,
  });
  ``;
}

export async function createImages(db: Database) {
  const dir = './images';
  if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }

  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  try {
    while (true) {
      const record = await _claimNextClusterPost(db);
      if (!record) break;

      const { cluster_id, html_twitter, html_bluesky } = record;
      console.info(`Creating images for cluster_id:${cluster_id}`);

      const twitterPath = path.join(dir, `${cluster_id}_twitter.png`);
      const blueskyPath = path.join(dir, `${cluster_id}_bluesky.png`);

      // Twitter
      await _screenshotHtmlToFile(page, html_twitter, twitterPath, 'twitter');
      await db.setData(
        `UPDATE cluster_post
         SET was_posted_twitter = 'image_created' 
         WHERE cluster_id = ?`,
        [cluster_id]
      );

      // Bluesky
      await _screenshotHtmlToFile(page, html_bluesky, blueskyPath, 'bluesky');
      await db.setData(
        `UPDATE cluster_post
         SET was_posted_bluesky = 'image_created' 
         WHERE cluster_id = ?`,
        [cluster_id]
      );

      console.info(`Images created for cluster_id:${cluster_id}`);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await browser.close();
  }
}