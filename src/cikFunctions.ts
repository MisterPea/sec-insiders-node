import { SecEntity } from "./types.js";
import { getCikData } from './pipeline.js';
import ciks from './sp500_CIK.js';

export async function insertCiks(db: any, batchSize = 10) {
  // clear previous table
  console.info('Clearing previous table: issuers');
  await db.setData(`DELETE FROM issuers`, []);
  let prevIndex = 0;

  for (let i = batchSize; i < ciks.length + batchSize; i += batchSize) {

    const issuers: string[][] = [];
    const currBatch = ciks.slice(prevIndex, i);

    prevIndex = i;
    const cikDataArray: SecEntity[] = await getCikData(currBatch);

    cikDataArray.forEach(({ cik, tickers, name, sic, sicDescription }) => issuers.push([cik, tickers.join(', '), name.toUpperCase(), sic, sicDescription]));

    // Add issuers not in issuers table
    await db.insertData(`
    INSERT OR REPLACE INTO issuers (cik, tickers, company_name, sic, sic_description)
    VALUES (?, ?, ?, ?, ?)`,
      issuers
    );
    console.info(`${issuers.length} companies inserted into table: issuers.`);
  }
  console.info(`CIK insertions complete`);
}