import Database from 'better-sqlite3';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import { SecEntity } from './types.js';

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
}
