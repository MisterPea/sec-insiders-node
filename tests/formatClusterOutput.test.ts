import assert from 'node:assert/strict';
import test from 'node:test';
import { formatPurchaseOutput, formatSalesOutput } from '../src/processing/formatClusterOutput.ts';
import type { RawPurchaseOutput, RawSalesOutput } from '../src/types.ts';

test('formatPurchaseOutput falls back to unnamed insiders when titles are null', () => {
  const purchases: RawPurchaseOutput[] = [{
    cik: '1234567890',
    tickers: 'ABCD',
    company_name: 'ACME CORP',
    transaction_code: 'P',
    first_transaction: '2026-03-01',
    last_transaction: '2026-03-02',
    num_days: 1,
    total_shares: 100,
    total_value: 1000,
    weighted_avg_price: 10,
    pct_increase: 0.25,
    num_owners: 2,
    num_null_titles: 3,
    accessions: '0001-0001-01,0001-0001-02',
    all_are_directors: 0,
    all_are_officers: 1,
    owners: 'ALICE ** BOB',
    titles: null,
    off_ma20: -5,
    off_ma200: -10,
  }];

  const [output] = formatPurchaseOutput(purchases);

  assert.match(output.twitterHtml, /3 UNNAMED INSIDERS/);
  assert.match(output.blueskyHtml, /3 UNNAMED INSIDERS/);
});

test('formatPurchaseOutput dedupes named titles and appends unnamed count', () => {
  const purchases: RawPurchaseOutput[] = [{
    cik: '1234567890',
    tickers: 'ABCD',
    company_name: 'ACME CORP',
    transaction_code: 'P',
    first_transaction: '2026-03-01',
    last_transaction: '2026-03-02',
    num_days: 1,
    total_shares: 100,
    total_value: 1000,
    weighted_avg_price: 10,
    pct_increase: 0.25,
    num_owners: 2,
    num_null_titles: 1,
    accessions: '0001-0001-01',
    all_are_directors: 0,
    all_are_officers: 1,
    owners: 'ALICE ** BOB',
    titles: 'CEO ** CFO ** CEO ** ',
    off_ma20: -5,
    off_ma200: -10,
  }];

  const [output] = formatPurchaseOutput(purchases);

  assert.match(output.twitterHtml, /CEO \/ CFO \/ 1 UNNAMED INSIDERS/);
});

test('formatSalesOutput falls back to unnamed insiders when titles are null', () => {
  const sales: RawSalesOutput[] = [{
    cik: '1234567890',
    tickers: 'ABCD',
    company_name: 'ACME CORP',
    transaction_code: 'S',
    has_ten_percent_holder: 0,
    num_days: 0,
    first_transaction: '2026-03-01',
    last_transaction: '2026-03-01',
    total_shares: 100,
    pct_sold: 0.1,
    total_value: 1000,
    weighted_avg_price: 10,
    num_owners: 2,
    accessions: '0001-0001-01',
    all_are_officers: 1,
    mixed_officer_dir: 0,
    owners: 'ALICE ** BOB',
    titles: null,
    ma200: 20,
    off_ma200: -50,
  }];

  const [output] = formatSalesOutput(sales);

  assert.match(output.twitterHtml, /UNNAMED INSIDERS/);
});
