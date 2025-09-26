import { buildAccessionBase, getCikData, getXmlData } from "./pipeline.js";
import sp500_cik from "./sp500_CIK.js";
// import { DB } from "./sqlite-dont-use.js";
import { AccessionBase, Form4Parsed, SecEntity } from "./types.js";
import { XMLParser } from 'fast-xml-parser';
import { DB } from "./db/DB.js";
import formFourProcessor from "./processing/formFourProcesser.js";

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

  await db.insertData(`
    INSERT OR REPLACE INTO form4_jobs (cik, accession, url)
    VALUES (?, ?, ?)`,
    accessionArray
  );
}

/**
 * Finds first pending job from form4_jobs table and processes it.
 * @returns 
 */
async function handleProcessingOfXmlUrls(documentData: { url: string, accession: string, cik: string; }) {
  const { url, accession, cik } = documentData;
  const xmlData = await getXmlData(url);
  const parser = new XMLParser({ ignoreDeclaration: true });
  const { ownershipDocument } = parser.parse(xmlData);
  const flatJson = { accession, ...flattenTree(ownershipDocument), issuerCik: cik };

  const formData = formFourProcessor(flatJson as Form4Parsed);

  const { cols, rows } = formData;

  const dataReturn = await db.insertData(`
    INSERT OR REPLACE INTO form4_filings (${cols.join(', ')})
    VALUES (${new Array(cols.length).fill('?').join(', ')})
    `, rows);

  if (dataReturn.inserted) {
    return dataReturn.inserted;
  } else {
    throw new Error('Error inserting XML in form4_filings');
  }
}

async function processNextXmlUrl() {
  const documentData = await db.getData(`SELECT * FROM form4_jobs WHERE status='pending'`);
  const { accession } = documentData;

  await db.setData(`UPDATE form4_jobs SET status='running' WHERE accession = ?`, [accession]);

  if (!documentData) return;
  const rtn = await handleProcessingOfXmlUrls(documentData);
  if (rtn > 0) {
    await db.setData(`UPDATE form4_jobs SET status='ingested' WHERE accession = ?`, [accession]);
    processNextXmlUrl()
  }
  return;
}

processNextXmlUrl();

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
    if (key === 'derivativeTransaction' || key === 'nonDerivativeTransaction' || key === 'footnotes') {
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



// processXmlUrls();

// await initBatchOrchestrator()

// await getInitialData();
// processXmlUrls();

