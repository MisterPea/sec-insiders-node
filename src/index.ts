import { DB } from "./db/DB.js";
import { buildAccessionBase, getCikData } from "./pipeline.js";
import sp500_cik from "./sp500_CIK.js";
import { FormatOutput, SecEntity } from "./types.js";
import { XmlJobProcessor } from './processing/XmlJobProcessor.js';
import { findClusterPurchases, findClusterSales } from "./processing/findClusters.js";
import { formatPurchaseOutput, formatSalesOutput } from "./processing/formatClusterOutput.js";
import { createImages } from './imageHandling/createImage.js';
import { postImages } from "./imageHandling/postImages.js";
import { getHistoricalDataMassive } from "./historicalData/getHistoricalDataMassive.js";
import getHistoricalDataYahoo from "./historicalData/getHistoricalDataYahoo.js";
import { removeExpiredImages } from "./removeExpiredImages.js";
// import { insertCiks } from "./cikFunctions.js";
// import { officerTitles } from './officerTitleExclusion.js';
// import "./imageHandling/twitter/authOnce.js" // un-comment to reauth app

const db = new DB();

/**
 * Initial chunking of pulls from sec.gov - Default pull of 5 CIKs at a time — each pull can have 
 * several row writes when split up
 * @param {number} batchSize number of CIKs to pull per iteration
 * @returns {Promise<number>} Total number of records added
 */
async function initBatchOrchestrator(batchSize: number = 5): Promise<number> {
  const cikArray = sp500_cik;
  let totalRecordsAdded = 0;

  let prevIndex = 0;
  for (let i = batchSize; i < cikArray.length + batchSize; i += batchSize) {
    const currBatch = cikArray.slice(prevIndex, i);
    prevIndex = i;

    const numRecords = await getInitialData(currBatch);
    totalRecordsAdded += numRecords;
  }
  return totalRecordsAdded;
}

async function getInitialData(currBatch: string[]) {
  let numRecordsAdded = 0;
  for (const issuer of currBatch) {
    const accessionArray: string[][] = [];

    const issuersJson: SecEntity[] = await getCikData([issuer]);

    const accessionElement = buildAccessionBase(issuersJson[0]);
    accessionArray.push(...accessionElement);

    const { inserted } = await db.insertData(`
    INSERT INTO form4_jobs (cik, accession, url)
    VALUES (?, ?, ?)
    ON CONFLICT(url) DO NOTHING`,
      accessionArray
    );
    if (inserted) {
      numRecordsAdded += inserted;
      console.log(`${inserted} jobs inserted into form4_jobs table.`);
    }
  }
  return numRecordsAdded;
}

/**
 * Run Orchestrator is the main organizer for all actions,
 * running all actions in a stepwise fashion.
 */
async function runOrchestrator() {
  // Add found accessions / split into jobs
  const totalRecordsAdded = await initBatchOrchestrator(30);
  console.info('Initial ingest complete');

  // No records added means no additional processing needed.
  if (totalRecordsAdded === 0) {
    console.log('No new records found');

    console.log('SHUTTING DOWN');
    await db.shutdown();
    console.log('REMOVING WORKER VIA TERMINATE');
    await db.worker.terminate();
    console.log('SHUTDOWN-WORKER REMOVED');
    debugClose();
    return;
  }

  // Process individual accessions/jobs
  const processor = new XmlJobProcessor(db);
  await processor.startProcessing();

  // Get current moving averages
  // If yahoo is not working, then we resort to the much slower MASSIVE feed
  try {
    await getHistoricalDataYahoo(db);
  } catch (err) {
    console.info('ERROR:', err, '--trying fallback');
    await getHistoricalDataMassive(db);
  }

  // ******************** render html ******************** //
  // Find cluster purchase/sales 
  const daysWindow = 45;
  const saleClusters = await findClusterSales(db, daysWindow, 3);
  const outputSalesArray = formatSalesOutput(saleClusters);

  const purchaseClusters = await findClusterPurchases(db, daysWindow, 3);
  const outputPurchaseArray = formatPurchaseOutput(purchaseClusters);

  // Collect purchases and sales into one array - pass it to insert
  const clusterOutputs: FormatOutput[] = [...outputSalesArray, ...outputPurchaseArray];

  // Add cluster html string to the db
  await db.insertData(`
    INSERT INTO cluster_post (cluster_id, html_twitter, html_bluesky, accession_urls, generated_at, expiration_date, ticker, purchase_or_sale)
    VALUES (?, ?, ?, ?, DATETIME('now'), DATETIME('now', '+' || ? || ' days'), ?, ?)
    ON CONFLICT(cluster_id) DO NOTHING 
    `, clusterOutputs.map(({ clusterId, twitterHtml, blueskyHtml, accessions, ticker, purchaseOrSale }) => [clusterId, twitterHtml, blueskyHtml, accessions, daysWindow, ticker, purchaseOrSale]));

  // Create images for each clusterId that doesn't have am image crated
  console.info('-- Creating Images');
  await createImages(db);

  console.info('-- Starting posts');
  await postImages(db);
  console.info('-- Posts complete');

  // Clean up expired images
  await removeExpiredImages(db);

  console.log('SHUTTING DOWN');
  await db.shutdown();
  console.log('REMOVING WORKER VIA TERMINATE');
  await db.worker.terminate();
  console.log('SHUTDOWN-WORKER REMOVED');
  debugClose();
  return;
}

function debugClose() {
  process.stdin.unref();
  process.stdout.unref();
  process.stderr.unref();
  const handles = (process as any)._getActiveHandles();
  const processes = (process as any)._getActiveRequests();
  console.log("PROCESSES:", processes);
  console.log("HANDLES:", handles);
  process.exit();
}

// ******************* 1
// **** Initial run ****
runOrchestrator();

// ********** Populate officer_title exclusion table ********** //
// ** Table is used to filter titles from inclusion with sales pull
// async function populateOfficerTitleExclusion() {
//   await db.setData(`DELETE FROM excluded_officer_titles`, []);
//   await db.insertData(`
//     INSERT INTO excluded_officer_titles (title) 
//     VALUES (?)
//     ON CONFLICT(title) DO NOTHING;`,
//     officerTitles.map((t) => [t])
//   );
// }

// ** Find repeat, directional discretionary transactions
// const repeatTransactions = await findRepeatTransactions(db, 21, 3);
// console.log(repeatTransactions);

// ** Run failed jobs
// runFailedJobs();

// ** Populate CIK table
// insertCiks(db)




