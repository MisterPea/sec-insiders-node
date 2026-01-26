import { XMLParser } from 'fast-xml-parser';
import formFourProcessor from "./formFourProcessor.js";
import { getXmlData } from '../pipeline.js';
import { Database, Form4Parsed } from '../types.js';

export class XmlJobProcessor {
  private isProcessing = false;
  private maxConcurrent = 3;
  private activeJobs = 0;
  private database: any;

  constructor(database: any) {
    this.database = database;
  }

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
        const hasMoreJobs = await processNextXmlUrl(this.database);
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

async function processNextXmlUrl(database: Database): Promise<boolean> {
  try {
    // Atomic operation-we're updating as we're setting
    //
    // Get pending jobs
    const result = await database.getData(`
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
    const processingResult = await handleProcessingOfXmlUrls(database, result);

    if (processingResult.success) {
      await database.setData(`UPDATE form4_jobs SET status='ingested' WHERE accession = ?`, [accession]);
      console.log(`Successfully processed job: ${accession}`);
      return true; // Successfully processed
    } else {

      // Mark as failed for later retry or manual inspection
      const status = processingResult.error === "Cannot convert undefined or null to object" ? "broken_link" : "failed";
      await database.setData(`
        UPDATE form4_jobs 
        SET status=${status}, error_message=?, updated_at=CURRENT_TIMESTAMP 
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

/**
 * @param {Object} documentData takes in an object of url, accession, and cik
 * @returns 
 */
async function handleProcessingOfXmlUrls(database: any, documentData: { url: string, accession: string, cik: string; }) {
  const { url, accession, cik } = documentData;

  try {
    const xmlData = await getXmlData(url);
    const parser = new XMLParser({ ignoreDeclaration: true });
    const { ownershipDocument } = parser.parse(xmlData);

    const flatJson = { accession, ...flattenTree(ownershipDocument), issuerCik: cik };

    const formData = formFourProcessor(flatJson as Form4Parsed);

    const { cols, rows } = formData;

    const dataReturn = await database.insertData(`
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
      // Continue on accession processing errors
      success: true,
      error: typeof error === 'object' && error !== null && 'message' in error ? (error as { message: string; }).message : String(error)
    };
  }
}

// Flattens json tree and normalizes possible array values 
function flattenTree(obj: any, prefix = ''): Record<string, any> {

  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {

    // not proud of this - assigning k/v with let would be better but throws linting error.
    let mutableValue = value;

    // if last key is value - make it previous key
    let newKey = prefix;
    if (key !== 'value') {
      newKey = key;
    }

    // Normalize transactions and footnotes to be arrays
    if (['derivativeTransaction', 'nonDerivativeTransaction', 'nonDerivativeHolding', 'derivativeHolding', 'footnotes'].includes(key)) {
      // if not array
      if (!Array.isArray(value)) {
        mutableValue = [mutableValue];
      }
      // flatten object array
      result[newKey] = (mutableValue as any[]).map((e: any) => flattenTree(e));
    }

    else if (mutableValue !== null && typeof mutableValue === 'object' && !Array.isArray(mutableValue)) {
      Object.assign(result, flattenTree(mutableValue, newKey));
    } else {
      result[newKey] = mutableValue;
    }
  }
  return result;
}

