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
  /** Stop the worker; pending calls reject. */
  terminate(): void;
}

function defaultWorkerFactory(): WorkerLike | null {
  if (typeof Worker === 'undefined') return null;
  // Bundlers (Vite, webpack 5) turn this into a separate worker chunk.
  return new Worker(new URL('./openapi.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;
}

/**
 * Create a client. Without Worker support (SSR, tests) it runs the same code
 * in-process, still returning promises.
 */
export function createOpenApiWorkerClient(createWorker: () => WorkerLike | null = defaultWorkerFactory): OpenApiWorkerClient {
  const worker = createWorker();
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  let nextId = 1;
  let terminated = false;

  const rejectAll = (error: Error) => {
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
  };

  if (worker) {
    worker.addEventListener('message', (event) => {
      const response = event.data as WorkerResponse;
      const call = pending.get(response.id);
      if (!call) return;
      pending.delete(response.id);
      if (response.ok) call.resolve(response.result);
      else call.reject(new Error(response.error));
    });
    worker.addEventListener('error', (event) => {
      rejectAll(new Error(`OpenAPI worker failed: ${event.message ?? 'unknown error'}`));
    });
  }

  function call<K extends WorkerOp>(op: K, input: WorkerOps[K]['input']): Promise<WorkerOps[K]['output']> {
    if (terminated) return Promise.reject(new Error('OpenAPI worker was terminated'));
    const request: WorkerRequest<K> = { id: nextId++, op, input };
    if (!worker) {
      return Promise.resolve().then(() => {
        const response = handleWorkerRequest(request);
        if (!response.ok) throw new Error(response.error);
        return response.result as WorkerOps[K]['output'];
      });
    }
    return new Promise((resolve, reject) => {
      pending.set(request.id, { resolve: resolve as (value: unknown) => void, reject });
      worker.postMessage(request);
    });
  }

  return {
    parseYaml: (text) => call('parse', text),
    serializeToYaml: (doc) => call('serialize', doc),
    validateDocument: (doc) => call('validate', doc),
    terminate: () => {
      terminated = true;
      worker?.terminate();
      rejectAll(new Error('OpenAPI worker was terminated'));
    },
  };
}
