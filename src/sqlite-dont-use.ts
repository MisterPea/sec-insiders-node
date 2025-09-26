import Database from 'better-sqlite3';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import { AccessionBase, DerivativeTransaction, nonDerivativeTransaction, SecEntity } from './types.js';


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
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('busy_timeout = 3000');
    this.initDatabases();
  }

  private initDatabases() {
    const schemaDir = path.join(__dirname, '../schemas');
    const schemaPath = path.join(schemaDir, '/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    this.db?.exec(schema);
  }

  async getData(table:string, statement:string ){
    queueMicrotask
    try {
      const result = await Promise.resolve()
    } catch(err){

    }
  }

  





  /**
   * Insert company data to issuers table
   * @param {SecEntity} data 
   * @returns None
   */
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

  /**
   * Insert paths to form4 job queue table
   * @param {AccessionBase[]} accessionPaths 
   * @returns None
   */
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

  /**
   * Get first pending from queue - set to pending -> running
   * @returns None
   */
  getFirstPending(): AccessionBase | null {
    if (!this.db) return null;

    const statement = this.db.prepare(`SELECT * FROM form4_jobs WHERE status='pending'`);
    const firstRecord = statement.get();

    if (!firstRecord) return null;

    // const updateStatement = this.db.prepare(`UPDATE form4_jobs SET status='running' WHERE accession = ?`);
    // updateStatement.bind((firstRecord as AccessionBase).accession).run();

    return firstRecord as AccessionBase;
  }

  /**
   * Insert individual Form 4 - Breaks out each transaction into discrete row
   * @param data 
   * @returns 
   */
  insertIndividualForm4(data: Record<string, any>) {
    if (!this.db) return;

    const toString = (v: any) => (v === undefined || v === null ? null : String(v));
    const toNumber = (v: any) => (v === undefined || v === null ? null : Number(v));
    const isAmendment = (formType: string | number): 0 | 1 => String(formType).toUpperCase().includes('/A') ? 1 : 0;
    const sameSecurity = (aTitle?: string | null, bTitle?: string | null) => {
      if (!aTitle || !bTitle) return false;
      return aTitle.trim().toLowerCase() === bTitle.trim().toLowerCase();
    };

    const COLS = [
      'accession',
      'cik',
      'form_type',
      'is_amendment',
      'owner_name',
      'period_of_report',
      'ten5_1',
      'is_director',
      'is_officer',
      'is_ten_percent',
      'is_other',
      'officer_title',
      'security_type',               // 'derivative' | 'non-derivative'
      'security_title',
      'transaction_date',
      'acquired_disposed',
      'transaction_shares',
      'conversion_exercise_price',
      'transaction_code',
      'is_option_exercise',          // 1 if code === 'M' on derivative leg
      'is_from_exercise',            // 1 on non-derivative leg paired with a same-day 'M'
      'is_exercise_related_sale',    // 1 on non-derivative sale ('S') paired with a same-day 'M'
      'transaction_voluntary',       // (not reliably in Form 4 JSON; default 0)
      'ownership_form',              // 'D' | 'I'
      'date_exercisable',            // derivative: exerciseDate; non-derivative: null
      'underlying_title',            // derivative only
      'underlying_shares',           // derivative only
      'sec_owned_post_trx',
      'exercise_group_id',           // null for now
      'notes'                        // null for now
    ];

    const {
      accession,
      issuerCik,
      rptOwnerName,
      periodOfReport,
      documentType,
      aff10b5One,
      isOfficer,
      isDirector,
      isOther,
      officerTitle,
      isTenPercentOwner,
      derivativeTransaction,
      nonDerivativeTransaction,
      footnotes
    } = data;

    const prefix = [
      accession,
      toString(issuerCik),
      toString(documentType),
      isAmendment(documentType),
      rptOwnerName,
      periodOfReport,
      aff10b5One,
      isOfficer,
      isDirector,
      isOther,
      officerTitle,
      isTenPercentOwner,
    ];

    // Pairing for exercise-related for non-derivative side
    const { isFromExercise, isExerciseRelatedSale } =
      this.computeExercisePairs(nonDerivativeTransaction, derivativeTransaction);

    const rows: (any[])[] = [];

    // ---- Derivative rows ----
    for (const d of derivativeTransaction) {
      const row = [
        ...prefix,
        'derivative',                                   // security_type
        d.securityTitle ?? null,                        // security_title
        d.transactionDate ?? null,                      // transaction_date
        d.transactionAcquiredDisposedCode ?? null,      // acquired_disposed
        toNumber(d.transactionShares),                     // transaction_shares
        toNumber(d.conversionOrExercisePrice),             // conversion_exercise_price
        d.transactionCode ?? null,                      // transaction_code
        d.transactionCode === 'M' ? 1 : 0,              // is_option_exercise
        0,                                              // is_from_exercise (applies to non-derivative)
        0,                                              // is_exercise_related_sale (applies to non-derivative)
        0,                                              // transaction_voluntary (default)
        d.directOrIndirectOwnership ?? null,            // ownership_form
        d.exerciseDate ?? null,                         // date_exercisable
        d.underlyingSecurityTitle ?? null,              // underlying_title
        toNumber(d.underlyingSecurityShares),              // underlying_shares
        toNumber(d.sharesOwnedFollowingTransaction),       // sec_owned_post_trx
        null,                                           // exercise_group_id
        null                                            // notes
      ];
      rows.push(row);
    }

    // ---- Non-derivative rows ----
    nonDerivativeTransaction.forEach((n, idx) => {
      const fromExercise = isFromExercise.has(idx) ? 1 : 0;
      const exerciseRelatedSale = isExerciseRelatedSale.has(idx) ? 1 : 0;

      const row = [
        ...prefix,
        'non-derivative',                               // security_type
        n.securityTitle ?? null,                        // security_title
        n.transactionDate ?? null,                      // transaction_date
        n.transactionAcquiredDisposedCode ?? null,      // acquired_disposed
        toNumber(n.transactionShares),                     // transaction_shares
        null,                                           // conversion_exercise_price (n/a)
        n.transactionCode ?? null,                      // transaction_code
        0,                                              // is_option_exercise (derivative only)
        fromExercise,                                   // is_from_exercise
        exerciseRelatedSale,                            // is_exercise_related_sale
        0,                                              // transaction_voluntary (default)
        n.directOrIndirectOwnership ?? null,            // ownership_form
        null,                                           // date_exercisable
        null,                                           // underlying_title
        null,                                           // underlying_shares
        toNumber(n.sharesOwnedFollowingTransaction),       // sec_owned_post_trx
        null,                                           // exercise_group_id
        null                                            // notes
      ];
      rows.push(row);
    });

    const columns = `(${COLS.join(', ')})`;
    const valuePlaces = `(${new Array(COLS.length).fill('?').join(', ')})`;


    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO form4_filings ${columns}
      VALUES ${valuePlaces}
    `);

    rows.forEach((row) => insert.run(row));
  }

  /**
   * Private method to find if option was executed
   * @param {nonDerivativeTransaction[]} nonDeriv Non-derivative transactions 
   * @param {derivative} deriv derivative transactions
   * @returns 
   */
  private computeExercisePairs(nonDeriv: nonDerivativeTransaction[] = [], deriv: DerivativeTransaction[] = []) {
    const isFromExercise = new Set<number>();
    const isExerciseRelatedSale = new Set<number>();

    if (!deriv.length || !nonDeriv.length) return { isFromExercise, isExerciseRelatedSale };

    // Index same-day 'M' derivative exercises by date + underlying title + shares
    const mByKey = new Map<string, DerivativeTransaction[]>();
    for (const d of deriv) {
      if (d.transactionCode !== 'M') continue;
      const key = [
        d.transactionDate,
        (d.underlyingSecurityTitle ?? '').trim().toLowerCase(),
        Number(d.underlyingSecurityShares ?? d.transactionShares) || 0
      ].join('|');

      const arr = mByKey.get(key) ?? [];
      arr.push(d);
      mByKey.set(key, arr);
    }

    nonDeriv.forEach((n, idx) => {
      const key = [
        n.transactionDate,
        (n.securityTitle ?? '').trim().toLowerCase(),
        Number(n.transactionShares) || 0
      ].join('|');

      const matchedMs = mByKey.get(key);
      if (matchedMs?.length) {
        // Treat as “from exercise” if shares and titles match same-day 'M'
        isFromExercise.add(idx);
        // If this non-derivative is a sale, mark as exercise-related sale
        if (n.transactionCode === 'S') isExerciseRelatedSale.add(idx);
      }
    });

    return { isFromExercise, isExerciseRelatedSale };
  }

}





