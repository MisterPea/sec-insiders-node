import Database from 'better-sqlite3';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import { AccessionBase, SecEntity } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type CompanyData = {
  cik: string;
  companyName: string;
  tickers: string[];
  sic: string;
  sicDescription: string;
};

export class DB {
  private db: Database.Database | undefined = undefined;

  constructor() {
    const dbDir = path.join(__dirname, '../sqlite');
    this.db = new Database(path.join(dbDir, '/sec_data.db'));
    this.initDatabases();
  }

  private initDatabases() {
    const schemaDir = path.join(__dirname, '../schemas');
    const schemaPath = path.join(schemaDir, '/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    this.db?.exec(schema);
  }

  // Insert company data to issuers table
  insertCompanyData(data: SecEntity) {
    if (!this.db) return;

    const {
      cik,
      name: company_name,
      tickers,
      sic,
      sicDescription: sic_description,
    } = data;

    this.db.prepare(`
        INSERT OR REPLACE INTO issuers (cik, tickers, company_name, sic, sic_description)
        VALUES (?, ?, ?, ?, ?)
      `).bind(cik, tickers.join(', '), company_name, sic, sic_description).run();
  }

  // Insert paths to form4 job queue table
  insertForm4Paths(accessionPaths: AccessionBase[]) {
    if (!this.db) return;

    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO form4_jobs (cik, accession, url)
      VALUES (@cik, @accession, @url)
    `);

    const insertMany = this.db.transaction((entries) => {
      for (const entry of entries) insert.run(entry);
    });

    insertMany.immediate(accessionPaths);
  }

  // Get first pending from queue set to running
  getFirstPending(): AccessionBase | null {
    if (!this.db) return null;

    const statement = this.db.prepare(`SELECT * FROM form4_jobs WHERE status='pending'`);
    const firstRecord = statement.get();

    if (!firstRecord) return null;

    // const updateStatement = this.db.prepare(`UPDATE form4_jobs SET status='running' WHERE accession = ?`);
    // updateStatement.bind((firstRecord as AccessionBase).accession).run();
    
    return firstRecord as AccessionBase
  }
}
