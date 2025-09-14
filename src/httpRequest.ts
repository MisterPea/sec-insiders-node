import axios, { AxiosRequestConfig } from "axios";
import { RateLimiter } from "./rateLimiter.js";

const secLimiter = new RateLimiter(10);

export function apiRequest<T>(config: AxiosRequestConfig, { priority = 0 }: { priority?: number; } = {}) {
  return secLimiter.schedule(
    // If we don't resolve retries kick in
    () => withRetries(() => axios.request<T>(config).then((r) => r.data)), priority);
}

async function withRetries<T>(op: () => Promise<T>, attempt = 1): Promise<T> {
  try {
    return await op();
  } catch (error: any) {
    const status = error?.response?.status;
    const ra = Number(error?.response?.headers?.["retry-after"]);
    if (status === 429 || (status >= 500 && status < 600)) {
      const backoff = Number.isFinite(ra) ? ra * 1000 : Math.min(1000 * 2 ** attempt, 15000);
      await new Promise(r => setTimeout(r, backoff + Math.random() * 200));
      return withRetries(op, attempt + 1);
    }
    throw error;
  }
}