// Message protocol between the main thread and openapi.worker.ts.
// Everything crossing the boundary is structured-clone friendly: ApiDocument
// is plain objects, arrays and Maps (no classes, functions or DOM nodes).
import { parseYaml, type ParseResult } from './parser';
import { serializeToYaml } from './serializer';
import { validateDocument } from './validator';
import type { ApiDocument, ValidationResult } from './types';

export interface WorkerOps {
  parse: { input: string; output: ParseResult };
  serialize: { input: ApiDocument; output: string };
  validate: { input: ApiDocument; output: ValidationResult };
}

export type WorkerOp = keyof WorkerOps;

export interface WorkerRequest<K extends WorkerOp = WorkerOp> {
  id: number;
  op: K;
  input: WorkerOps[K]['input'];
}

export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

export function handleWorkerRequest(request: WorkerRequest): WorkerResponse {
  try {
    let result: unknown;
    switch (request.op) {
      case 'parse':
        result = parseYaml(request.input as string);
        break;
      case 'serialize':
        result = serializeToYaml(request.input as ApiDocument);
        break;
      case 'validate':
        result = validateDocument(request.input as ApiDocument);
        break;
      default:
        throw new Error(`Unknown worker op: ${String((request as { op: unknown }).op)}`);
    }
    return { id: request.id, ok: true, result };
  } catch (error) {
    return { id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
