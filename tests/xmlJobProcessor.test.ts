import assert from 'node:assert/strict';
import test from 'node:test';
import { handleProcessingOfXmlUrls, processNextXmlUrl } from '../src/processing/XmlJobProcessor.ts';

test('processNextXmlUrl marks successful processing as ingested', async () => {
  const setCalls: { sql: string; params: any[]; }[] = [];
  const db = {
    async getData() {
      return { accession: 'acc-1', url: 'https://example.com/doc.xml', cik: '123' };
    },
    async setData(sql: string, params: any[]) {
      setCalls.push({ sql, params });
    },
  };

  const hasMore = await processNextXmlUrl(db as any, async () => ({ success: true, inserted: 1 }));

  assert.equal(hasMore, true);
  assert.equal(setCalls.length, 1);
  assert.match(setCalls[0].sql, /status='ingested'/);
  assert.deepEqual(setCalls[0].params, ['acc-1']);
});

test('processNextXmlUrl marks broken links separately from general failures', async () => {
  const setCalls: { sql: string; params: any[]; }[] = [];
  const db = {
    async getData() {
      return { accession: 'acc-2', url: 'https://example.com/doc.xml', cik: '123' };
    },
    async setData(sql: string, params: any[]) {
      setCalls.push({ sql, params });
    },
  };

  const hasMore = await processNextXmlUrl(
    db as any,
    async () => ({ success: false, error: 'Cannot convert undefined or null to object' })
  );

  assert.equal(hasMore, true);
  assert.equal(setCalls.length, 1);
  assert.match(setCalls[0].sql, /SET status=\?/);
  assert.deepEqual(setCalls[0].params, ['broken_link', JSON.stringify('Cannot convert undefined or null to object'), 'acc-2']);
});

test('processNextXmlUrl marks other processing failures as failed', async () => {
  const setCalls: { sql: string; params: any[]; }[] = [];
  const db = {
    async getData() {
      return { accession: 'acc-3', url: 'https://example.com/doc.xml', cik: '123' };
    },
    async setData(sql: string, params: any[]) {
      setCalls.push({ sql, params });
    },
  };

  const hasMore = await processNextXmlUrl(
    db as any,
    async () => ({ success: false, error: 'XML parse error' })
  );

  assert.equal(hasMore, true);
  assert.deepEqual(setCalls[0].params, ['failed', JSON.stringify('XML parse error'), 'acc-3']);
});

test('handleProcessingOfXmlUrls returns a failure result when XML fetch fails', async () => {
  const result = await handleProcessingOfXmlUrls(
    { insertData: async () => ({ inserted: 1 }) } as any,
    { accession: 'acc-4', cik: '123', url: 'https://example.com/doc.xml' },
    async () => {
      throw new Error('network down');
    }
  );

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error, 'network down');
  }
});
