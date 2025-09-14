// import { setTimeout as sleep } from "node:timers/promises";

type Job<T> = {
  run: () => Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
  priority: number;
};

export class RateLimiter {
  private queue: Job<any>[] = [];
  private maxConcurrent: number;
  private running = 0;
  private refillMs: number;
  private tokens: number;
  private rps: number;

  constructor(rps: number, maxConcurrent = 4) {
    this.refillMs = 1000 / rps;
    this.maxConcurrent = maxConcurrent;
    this.tokens = rps;
    this.rps = rps;
    this.refillLoop();
  }

  private sleep(ms: number) {
    return new Promise<void>(res => setTimeout(res, ms));
  }

  private async refillLoop() {
    while (true) {
      await this.sleep(this.refillMs);
      this.tokens = this.rps;
      this.drain();
    }
  }

  private drain() {
    while (this.running < this.maxConcurrent && this.queue.length > 0 && this.tokens >= 1) {
      this.tokens -= 1;
      const job = this.queue.shift();

      if (!job) {
        continue;
      }

      this.running += 1;
      job.run()
        .then(job.resolve)
        .catch(job.reject)
        .finally(() => {
          this.running -= 1;
          // Immediately invoke another task if tokens remain.
          queueMicrotask(() => this.drain());
        });
    }
  }

  // Add an operation to the queue
  schedule<T>(fn: () => Promise<T>, priority = 0): Promise<T> {

    return new Promise<T>((resolve, reject) => {
      this.queue.push({ run: fn, resolve, reject, priority });

      // simple priority queue - highest first
      this.queue.sort((a, b) => b.priority - a.priority);
      this.drain();
    });
  }
}