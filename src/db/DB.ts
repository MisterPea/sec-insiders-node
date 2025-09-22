import { Worker } from 'worker_threads';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Pending {
  resolve: (val: any) => void;
  reject: (err: any) => void;
}

export class DB {
  private worker: Worker;
  private pending = new Map<string, Pending>();

  constructor() {
    this.worker = new Worker(path.join(__dirname, './DBWorker.mjs'));

    this.worker.on('message', ({ id, result, error }) => {
      const pending = this.pending.get(id);
      if (!pending) return;
      if (error) pending.reject(new Error(error));
      else pending.resolve(result);
      this.pending.delete(id);
    });

    this.worker.on('error', (err) => {
      console.error('[DB Worker Error]', err);
    });
  }

  async getData<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    return this.sendToWorker('get', sql, params);
  }

  async insertData(sql: string, paramSets: any[][]): Promise<{ inserted: number; }> {
    return this.sendToWorker('insert', sql, paramSets);
  }

  private sendToWorker(type: 'get' | 'insert', sql: string, params: any): Promise<any> {
    const id = uuidv4();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, sql, params });
    });
  }
}