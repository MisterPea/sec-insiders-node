import assert from 'node:assert/strict';
import test from 'node:test';
import { findClusterPurchases, findClusterSales } from '../src/processing/findClusters.ts';
import { AsyncTestDb } from './helpers.ts';

test('findClusterPurchases returns cluster rows with null titles and counted unnamed insiders', async () => {
  const db = new AsyncTestDb();

  try {
    db.run(
      'INSERT INTO issuers (cik, tickers, company_name, sic, sic_description) VALUES (?, ?, ?, ?, ?)',
      ['123', 'ABCD', 'ACME CORP', '3571', 'TECH']
    );
    db.run(
      'INSERT INTO moving_averages (ticker, ma20, ma200, date_string) VALUES (?, ?, ?, ?)',
      ['ABCD', 20, 30, '2026-03-01']
    );

    const insert = `
      INSERT INTO form4_filings (
        accession, cik, form_type, owner_name, period_of_report, ten5_1, is_director, is_officer,
        is_ten_percent, officer_title, security_type, security_title, transaction_date,
        acquired_disposed, transaction_shares, conversion_exercise_price, transaction_code,
        equity_swap_involved, nature_of_ownership, is_option_exercise, is_from_exercise,
        is_exercise_related_sale, transaction_voluntary, ownership_form, date_exercisable,
        underlying_title, underlying_shares, sec_owned_post_trx, exercise_group_id, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const today = new Date().toISOString().slice(0, 10);
    db.run(insert, ['acc-p1', '123', '4', 'Alice', today, 0, 0, 1, 0, null, 'non-derivative', 'Common Stock', today, 'A', 100, 10, 'P', 0, null, 0, 0, 0, 0, 'D', null, null, null, 1000, null, null]);
    db.run(insert, ['acc-p2', '123', '4', 'Bob', today, 0, 0, 1, 0, null, 'non-derivative', 'Common Stock', today, 'A', 150, 12, 'P', 0, null, 0, 0, 0, 0, 'D', null, null, null, 1200, null, null]);

    const results = await findClusterPurchases(db as any, 45, 2);

    assert.equal(results.length, 1);
    assert.equal(results[0].titles, null);
    assert.equal(results[0].num_null_titles, 2);
  } finally {
    db.close();
  }
});

test('findClusterSales excludes rows whose titles match the exclusion table', async () => {
  const db = new AsyncTestDb();

  try {
    db.run(
      'INSERT INTO issuers (cik, tickers, company_name, sic, sic_description) VALUES (?, ?, ?, ?, ?)',
      ['456', 'WXYZ', 'WIDGET INC', '3571', 'TECH']
    );
    db.run(
      'INSERT INTO moving_averages (ticker, ma20, ma200, date_string) VALUES (?, ?, ?, ?)',
      ['WXYZ', 20, 15, '2026-03-01']
    );
    db.run('INSERT INTO excluded_officer_titles (title) VALUES (?)', ['CEO']);

    const insert = `
      INSERT INTO form4_filings (
        accession, cik, form_type, owner_name, period_of_report, ten5_1, is_director, is_officer,
        is_ten_percent, officer_title, security_type, security_title, transaction_date,
        acquired_disposed, transaction_shares, conversion_exercise_price, transaction_code,
        equity_swap_involved, nature_of_ownership, is_option_exercise, is_from_exercise,
        is_exercise_related_sale, transaction_voluntary, ownership_form, date_exercisable,
        underlying_title, underlying_shares, sec_owned_post_trx, exercise_group_id, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const today = new Date().toISOString().slice(0, 10);
    db.run(insert, ['acc-s1', '456', '4', 'Alice', today, 0, 0, 1, 0, 'CEO', 'non-derivative', 'Common Stock', today, 'D', 100, 30, 'S', 0, null, 0, 0, 0, 0, 'D', null, null, null, 900, null, null]);
    db.run(insert, ['acc-s2', '456', '4', 'Bob', today, 0, 0, 1, 0, 'CEO', 'non-derivative', 'Common Stock', today, 'D', 120, 31, 'S', 0, null, 0, 0, 0, 0, 'D', null, null, null, 950, null, null]);

    const results = await findClusterSales(db as any, 45, 2);

    assert.equal(results.length, 0);
  } finally {
    db.close();
  }
});
