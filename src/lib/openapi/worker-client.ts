// Typed async wrapper around openapi.worker.ts.
//
// When to use it (numbers for a 14 MB / 5,000-operation spec, see bench/):
//  - Import: parseYaml blocks ~0.55 s (YAML) / ~0.4 s (JSON) on the main
//    thread; in the worker the main thread only pays for receiving the
//    ApiDocument (~0.25 s structured clone), and the UI can show progress.
//  - YAML preview: do NOT round-trip through the worker. Posting a document
//    structured-clones it, which breaks node identity, so the worker can never
//    reuse the incremental serializer cache. On the main thread
//    serializeToYaml costs ~35 ms after an edit (one full ~0.9 s run first).
//  - Validation: ~70 ms, fine on the main thread when debounced.
import type { ParseResult } from './parser';
import type { ApiDocument, ValidationResult } from './types';
import { handleWorkerRequest, type WorkerOp, type WorkerOps, type WorkerRequest, type WorkerResponse } from './worker-protocol';

/** The subset of the Worker API the client needs (lets tests pass a fake). */
export interface WorkerLike {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  addEventListener(type: 'error', listener: (event: { message?: string }) => void): void;
  terminate(): void;
}

export interface OpenApiWorkerClient {
  parseYaml(text: string): Promise<ParseResult>;
  serializeToYaml(doc: ApiDocument): Promise<string>;
  validateDocument(doc: ApiDocument): Promise<ValidationResult>;
  /**
   * Stop whatever the worker is doing: its pending calls reject with
   * WorkerCancelledError and later calls go to a fresh worker. No-op when idle.
   */
  cancelPending(): void;
  /** Stop the worker; pending calls reject. */
  terminate(): void;
}

export interface WorkerClientOptions {
  /**
   * A call the worker hasn't answered after this long rejects with
   * WorkerTimeoutError; the worker (stuck on it, e.g. on a hostile document)
   * is terminated and replaced. Default: no timeout.
   */
  timeoutMs?: number;
}

/** The worker didn't answer within `timeoutMs`. */
export class WorkerTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`The OpenAPI worker did not answer within ${Math.round(timeoutMs / 1000)} s.`);
    this.name = 'WorkerTimeoutError';
  }
}

/** The call was dropped because the worker was restarted (cancelPending, or another call timed out). */
export class WorkerCancelledError extends Error {
  constructor() {
    super('The OpenAPI worker call was cancelled.');
    this.name = 'WorkerCancelledError';
  }
}

function defaultWorkerFactory(): WorkerLike | null {
  if (typeof Worker === 'undefined') return null;
  // Bundlers (Vite, webpack 5) turn this into a separate worker chunk.
  return new Worker(new URL('./openapi.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;
}

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

/**
 * Create a client. Without Worker support (SSR, tests) it runs the same code
 * in-process, still returning promises (no timeouts: synchronous work can't
 * be interrupted).
 */
export function createOpenApiWorkerClient(
  createWorker: () => WorkerLike | null = defaultWorkerFactory,
  options: WorkerClientOptions = {},
): OpenApiWorkerClient {
  const pending = new Map<number, PendingCall>();
  let nextId = 1;
  let terminated = false;

  const settle = (id: number): PendingCall | undefined => {
    const entry = pending.get(id);
    if (!entry) return undefined;
    pending.delete(id);
    if (entry.timer !== undefined) clearTimeout(entry.timer);
    return entry;
  };

  const rejectAll = (error: () => Error) => {
    for (const id of Array.from(pending.keys())) settle(id)?.reject(error());
  };

  const start = (): WorkerLike | null => {
    const instance = createWorker();
    if (!instance) return null;
    instance.addEventListener('message', (event) => {
      if (instance !== worker) return; // a reply from a worker that was replaced
      const response = event.data as WorkerResponse;
      const entry = settle(response.id);
      if (!entry) return;
      if (response.ok) entry.resolve(response.result);
      else entry.reject(new Error(response.error));
    });
    instance.addEventListener('error', (event) => {
      if (instance !== worker) return;
      rejectAll(() => new Error(`OpenAPI worker failed: ${event.message ?? 'unknown error'}`));
    });
    return instance;
  };

  let worker = start();
  const inProcess = worker === null;

  /** Terminate the current worker (dropping its calls) and start a fresh one. */
  const restart = (reason: () => Error) => {
    const old = worker;
    worker = null;
    old?.terminate();
    rejectAll(reason);
    worker = start();
  };

  function call<K extends WorkerOp>(op: K, input: WorkerOps[K]['input']): Promise<WorkerOps[K]['output']> {
    if (terminated) return Promise.reject(new Error('OpenAPI worker was terminated'));
    const request: WorkerRequest<K> = { id: nextId++, op, input };
    const target = worker;
    if (inProcess || !target) {
      return Promise.resolve().then(() => {
        const response = handleWorkerRequest(request);
        if (!response.ok) throw new Error(response.error);
        return response.result as WorkerOps[K]['output'];
      });
    }
    return new Promise((resolve, reject) => {
      const entry: PendingCall = { resolve: resolve as (value: unknown) => void, reject };
      const { timeoutMs } = options;
      if (timeoutMs !== undefined) {
        entry.timer = setTimeout(() => {
          if (!pending.has(request.id)) return;
          settle(request.id)!.reject(new WorkerTimeoutError(timeoutMs));
          restart(() => new WorkerCancelledError());
        }, timeoutMs);
      }
      pending.set(request.id, entry);
      target.postMessage(request);
    });
  }

  return {
    parseYaml: (text) => call('parse', text),
    serializeToYaml: (doc) => call('serialize', doc),
    validateDocument: (doc) => call('validate', doc),
    cancelPending: () => {
      if (terminated || inProcess || pending.size === 0) return;
      restart(() => new WorkerCancelledError());
    },
    terminate: () => {
      terminated = true;
      worker?.terminate();
      rejectAll(() => new Error('OpenAPI worker was terminated'));
    },
  };
}
