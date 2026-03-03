import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { removeExpiredImages } from '../src/removeExpiredImages.ts';

async function withTempDir(run: (dir: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sec-images-'));
  try {
    await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('removeExpiredImages deletes files and then removes the db row', async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(path.join(dir, 'cluster-1_twitter.png'), 'twitter');
    await fs.writeFile(path.join(dir, 'cluster-1_bluesky.png'), 'bluesky');

    const deletedRows: string[] = [];
    const db = {
      async getAllData() {
        return [{ cluster_id: 'cluster-1' }];
      },
      async setData(_sql: string, params: string[]) {
        deletedRows.push(params[0]);
      },
    };

    await removeExpiredImages(db as any, dir);

    assert.deepEqual(deletedRows, ['cluster-1']);
    await assert.rejects(fs.stat(path.join(dir, 'cluster-1_twitter.png')));
    await assert.rejects(fs.stat(path.join(dir, 'cluster-1_bluesky.png')));
  });
});

test('removeExpiredImages treats already-missing files as deletable and removes the db row', async () => {
  await withTempDir(async (dir) => {
    const deletedRows: string[] = [];
    const db = {
      async getAllData() {
        return [{ cluster_id: 'cluster-2' }];
      },
      async setData(_sql: string, params: string[]) {
        deletedRows.push(params[0]);
      },
    };

    await removeExpiredImages(db as any, dir);

    assert.deepEqual(deletedRows, ['cluster-2']);
  });
});

test('removeExpiredImages keeps the db row when file deletion throws a real error', async () => {
  await withTempDir(async (dir) => {
    await fs.mkdir(path.join(dir, 'cluster-3_twitter.png'));
    await fs.writeFile(path.join(dir, 'cluster-3_bluesky.png'), 'bluesky');

    const deletedRows: string[] = [];
    const db = {
      async getAllData() {
        return [{ cluster_id: 'cluster-3' }];
      },
      async setData(_sql: string, params: string[]) {
        deletedRows.push(params[0]);
      },
    };

    await removeExpiredImages(db as any, dir);

    assert.deepEqual(deletedRows, []);
  });
});
