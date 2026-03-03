import BetterSqlite3 from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, '../schemas/schema.sql');

export class AsyncTestDb {
  db: BetterSqlite3.Database;

  constructor() {
    this.db = new BetterSqlite3(':memory:');
    this.db.exec(fs.readFileSync(schemaPath, 'utf8'));
  }

  exec(sql: string) {
    this.db.exec(sql);
  }

  run(sql: string, params: any[] = []) {
    this.db.prepare(sql).run(...params);
  }

  async getData<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  async getAllData<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as T[];
  }

  async setData<T = any>(sql: string, params: any[] = []): Promise<T> {
    const result = this.db.prepare(sql).run(...params);
    return result as T;
  }

  async insertData(sql: string, paramSets: any[][]): Promise<{ inserted: number; }> {
    const stmt = this.db.prepare(sql);
    let inserted = 0;
    const tx = this.db.transaction((rows: any[][]) => {
      for (const row of rows) {
        inserted += stmt.run(...row).changes;
      }
    });
    tx(paramSets);
    return { inserted };
  }

  close() {
    this.db.close();
  }
}
