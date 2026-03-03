import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAccessionBase } from '../src/pipeline.ts';
import type { SecEntity } from '../src/types.ts';

test('buildAccessionBase keeps only Form 4 and 4/A filings and builds SEC document URLs', () => {
  const entity = {
    cik: '1234567890',
    filings: {
      recent: {
        form: ['3', '4', '4/A'],
        accessionNumber: ['0000-0000-00', '1111-1111-11', '2222-2222-22'],
        primaryDocument: ['ignore.htm', 'xslF345X03/doc1.xml', 'form4a.xml'],
      },
    },
  } as SecEntity;

  const result = buildAccessionBase(entity);

  assert.deepEqual(result, [
    ['1234567890', '1111-1111-11', 'https://www.sec.gov/Archives/edgar/data/1234567890/1111111111/doc1.xml'],
    ['1234567890', '2222-2222-22', 'https://www.sec.gov/Archives/edgar/data/1234567890/2222222222/form4a.xml'],
  ]);
});
