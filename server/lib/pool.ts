import { LIMITS } from '../config';

export interface Pool {
  run<T>(fn: () => Promise<T>): Promise<T>;
  inFlight(): number;
  queued(): number;
  limit: number;
}

export function createPool(limit: number): Pool {
  let active = 0;
  const queue: Array<() => void> = [];

  const drain = () => {
    while (active < limit && queue.length > 0) queue.shift()!();
  };

  return {
    limit,
    inFlight: () => active,
    queued: () => queue.length,
    run<T>(fn: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const start = () => {
          active += 1;
          Promise.resolve().then(fn).then(resolve, reject).finally(() => {
            active -= 1;
            drain();
          });
        };
        if (active < limit) start(); else queue.push(start);
      });
    }
  };
}

export async function mapPool<T, R>(
  items: T[],
  limit: number | Pool,
  fn: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const pool = typeof limit === 'number' ? createPool(limit) : limit;
  return Promise.all(items.map((item, index) => pool.run(() => fn(item, index)).then(
    (value): PromiseFulfilledResult<R> => ({ status: 'fulfilled', value }),
    (reason): PromiseRejectedResult => ({ status: 'rejected', reason })
  )));
}

export const socketPool = createPool(LIMITS.socket);
export const dnsPool = createPool(LIMITS.dns);
export const httpPool = createPool(LIMITS.http);
export const sourcePool = createPool(LIMITS.source);
