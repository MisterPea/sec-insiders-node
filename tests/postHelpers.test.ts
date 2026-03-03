import assert from 'node:assert/strict';
import test from 'node:test';
import { chunkUrlsForReplies, packAccessionUrls } from '../src/imageHandling/postHelpers.ts';

test('packAccessionUrls keeps original links separately for Bluesky and renders placeholders in text', () => {
  const urls = [
    'https://www.sec.gov/Archives/edgar/data/1/1/a-index.html',
    'https://www.sec.gov/Archives/edgar/data/2/2/b-index.html',
  ];

  const packed = packAccessionUrls({ header: 'Insider purchases', urls, isBluesky: true });

  assert.equal(packed.mainLinks.length, 2);
  assert.deepEqual(packed.mainLinks, urls);
  assert.doesNotMatch(packed.mainText, /Insider purchases/);
  assert.match(packed.mainText, /sec\.gov\/Archives\/edgar\.\.\./);
});

test('chunkUrlsForReplies splits oversized URL lists into multiple chunks', () => {
  const urls = Array.from({ length: 12 }, (_, index) => `https://example.com/${index}`);

  const chunks = chunkUrlsForReplies(urls);

  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].split('\n').length, 11);
  assert.equal(chunks[1].split('\n').length, 1);
});
