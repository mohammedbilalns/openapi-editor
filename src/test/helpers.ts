import { expect } from 'vitest';
import { parseYaml } from '@/lib/openapi/parser';
import type { ApiDocument, HttpMethod, Route, SchemaNode, SchemaOrRef } from '@/lib/openapi/types';

/** Parse YAML and fail the test if the parser returned no document. */
export function parseOk(yaml: string): { doc: ApiDocument; errors: ReturnType<typeof parseYaml>['errors'] } {
  const result = parseYaml(yaml);
  if (!result.document) {
    throw new Error(`expected a document, got errors: ${JSON.stringify(result.errors)}`);
  }
  return { doc: result.document, errors: result.errors };
}

export function route(doc: ApiDocument, method: HttpMethod, path: string): Route {
  const found = Array.from(doc.routes.values()).find((r) => r.method === method && r.path === path);
  if (!found) throw new Error(`route ${method} ${path} not found`);
  return found;
}

export function schema(doc: ApiDocument, name: string): SchemaNode {
  const found = Array.from(doc.schemas.values()).find((s) => s.name === name);
  if (!found) throw new Error(`schema ${name} not found`);
  return found;
}

/** Assert `ref` is a typed edge to the named component schema. */
export function expectRefTo(doc: ApiDocument, ref: SchemaOrRef | undefined, name: string) {
  expect(ref?.kind).toBe('ref');
  if (ref?.kind !== 'ref') return;
  expect(doc.schemas.get(ref.targetId)?.name).toBe(name);
}

/** Assert `s` is an inline schema and return it. */
export function inline(s: SchemaOrRef | undefined): SchemaNode {
  expect(s?.kind).toBe('inline');
  if (s?.kind !== 'inline') throw new Error('not inline');
  return s.schema;
}
