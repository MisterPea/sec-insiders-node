import { buildAccessionBase, getCikData, getXmlData } from "./pipeline.js";
import sp500_cik from "./sp500_CIK.js";
import { Form4Parsed, SecEntity } from "./types.js";
import { XMLParser } from 'fast-xml-parser';
import { DB } from "./db/DB.js";
import formFourProcessor from "./processing/formFourProcessor.js";
import { findClusterEvent } from "./processing/findClusters.js";

const db = new DB();

async function initBatchOrchestrator(batchSize = 5) {
  let prevIndex = 0;
  for (let i = batchSize; i < sp500_cik.length + batchSize; i += batchSize) {
    const currBatch = sp500_cik.slice(prevIndex, i);
    prevIndex = i;
    await getInitialData(currBatch);
  }
}

async function getInitialData(currBatch: string[]) {
  // Get initial data array
  const cikDataArray: SecEntity[] = await getCikData(currBatch);
  const issuers: string[][] = [];
  const accessionArray: string[][] = [];

  cikDataArray.forEach((issuer) => {
    issuers.push([issuer.cik, issuer.tickers.join(', '), issuer.name.toUpperCase(), issuer.sic, issuer.sicDescription]);
    const accessionElement = buildAccessionBase(issuer);
    accessionArray.push(...accessionElement);
  });

  await db.insertData(`
    INSERT OR REPLACE INTO issuers (cik, tickers, company_name, sic, sic_description)
    VALUES (?, ?, ?, ?, ?)`,
    issuers
  );
  console.log(`${issuers.length} companies inserted into issuers table.`);

  await db.insertData(`
    INSERT INTO form4_jobs (cik, accession, url)
    VALUES (?, ?, ?)
    ON CONFLICT(url) DO NOTHING`,
    accessionArray
  );
  console.log(`${accessionArray.length} jobs inserted into form4_jobs table.`);
}


class XmlJobProcessor {
  private isProcessing = false;
  private maxConcurrent = 3;
  private activeJobs = 0;

  async startProcessing() {
    if (this.isProcessing) {
      console.log('Processing already in progress');
      return;
    }

    this.isProcessing = true;
    console.log('Starting XML job processing...');

    // Process multiple jobs concurrently
    const workers = Array(this.maxConcurrent).fill(null).map(() => this.worker());
    await Promise.all(workers);

    this.isProcessing = false;
    console.log('XML job processing completed');
  }

  private async worker() {
    while (this.isProcessing) {
      if (this.activeJobs >= this.maxConcurrent) {
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }

      this.activeJobs++;

      try {
        const hasMoreJobs = await processNextXmlUrl();
        if (!hasMoreJobs) {
          this.isProcessing = false; // Signal other workers to stop
        }
      } catch (error) {
        console.error('Worker error:', error);
      } finally {
        this.activeJobs--;
      }

      // Small delay between jobs
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
}


/**
 * @param {Object} documentData takes in an object of url, accession, and cik
 * @returns 
 */
async function handleProcessingOfXmlUrls(documentData: { url: string, accession: string, cik: string; }) {
  const { url, accession, cik } = documentData;

  try {
    const xmlData = await getXmlData(url);
    const parser = new XMLParser({ ignoreDeclaration: true });
    const { ownershipDocument } = parser.parse(xmlData);

    const flatJson = { accession, ...flattenTree(ownershipDocument), issuerCik: cik };

    const formData = formFourProcessor(flatJson as Form4Parsed);

    const { cols, rows } = formData;

    const dataReturn = await db.insertData(`
      INSERT OR REPLACE INTO form4_filings (${cols.join(', ')})
      VALUES (${new Array(cols.length).fill('?').join(', ')})`,
      rows
    );

    if (dataReturn.inserted && dataReturn.inserted > 0) {
      return { success: true, inserted: dataReturn.inserted };
    } else {
      return { success: false, error: 'No rows inserted' };
    }
  } catch (error) {
    console.error(`Error processing XML for accession ${accession}:`, error);
    return {
      success: false,
      error: typeof error === 'object' && error !== null && 'message' in error ? (error as { message: string; }).message : String(error)
    };
  }
}

//
async function processNextXmlUrl(): Promise<boolean> {
  try {
    // Atomic operation-we're updating as we're setting
    const result = await db.getData(`
      UPDATE form4_jobs
      SET status='running'
      WHERE accession = (
        SELECT accession FROM form4_jobs
        WHERE status='pending'
        LIMIT 1
      )
      RETURNING *
    `);

    if (!result) {
      console.log('No pending jobs found');
      return false;
    }

    const { accession } = result;
    console.log(`Processing job: ${accession}`);
    const processingResult = await handleProcessingOfXmlUrls(result);

    if (processingResult.success) {
      await db.setData(`UPDATE form4_jobs SET status='ingested' WHERE accession = ?`, [accession]);
      console.log(`Successfully processed job: ${accession}`);
      return true; // Successfully processed
    } else {
      
      // Mark as failed for later retry or manual inspection
      await db.setData(`
        UPDATE form4_jobs 
        SET status='failed', error_message=?, updated_at=CURRENT_TIMESTAMP 
        WHERE accession = ?`,
        [JSON.stringify(processingResult.error), accession]
      );
      console.error(`Failed to process job: ${accession}, error: ${processingResult.error}`);
      return true; // Continue processing other jobs despite this failure
    }

  } catch (error) {
    console.error('Error in processNextXmlUrl:', error);
    return false; // Stop processing on unexpected errors
  }
}

// Flattens json tree and normalizes possible array values 
function flattenTree(obj: any, prefix = ''): Record<string, any> {

  const result: Record<string, any> = {};

  for (var [key, value] of Object.entries(obj)) {

    // if last key is value - make it previous key
    let newKey = prefix;
    if (key !== 'value') {
      newKey = key;
    }

    // Normalize transactions and footnotes to be arrays
    if (['derivativeTransaction', 'nonDerivativeTransaction', 'nonDerivativeHolding', 'derivativeHolding', 'footnotes'].includes(key)) {
      // if not array
      if (!Array.isArray(value)) {
        value = [value];
      }
      // flatten object array
      result[newKey] = (value as any[]).map((e: any) => flattenTree(e));
    }

    else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenTree(value, newKey));
    } else {
      result[newKey] = value;
    }
  }

  return result;
}

async function runOrchestrator() {
  await initBatchOrchestrator(10);
  console.log('Initial ingest complete');
  const processor = new XmlJobProcessor();
  processor.startProcessing();
}

async function reset() {
  const x = await db.setData(`
    UPDATE form4_jobs
  SET status = 'pending'
  WHERE status = 'failed'`, []);
  console.log(x);
}

// const x = await findClusterEvent(db,14,2)
// console.log(x)


// reset()
runOrchestrator()
