/**
 * Regression tests for import/export correctness bugs found in review:
 * recursion through unnamed schemas, YAML alias bombs and oversized input,
 * refs outside the typed model going stale on rename, double-stored field
 * descriptions and `__proto__` keys.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_DOCUMENT_CHARS, parseText, parseYaml } from './parser';
import { serializeToYaml, stringifyYaml } from './serializer';
import { useEditorStore } from './store';
import { validateDocument } from './validator';
import { validateToIssues } from './analysis/handler';
import { getSchemaUsageCounts } from './refs';
import type { ApiDocument } from './types';
import { parseOk, schema } from '@/test/helpers';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const exported = (doc: ApiDocument): Json => parseText(serializeToYaml(doc)) as Json;
const byName = (name: string) => schema(useEditorStore.getState().document, name);

beforeEach(() => {
  useEditorStore.getState().initializeDocument(parseOk("openapi: 3.0.3\ninfo: {title: T, version: '1'}\npaths: {}\n").doc);
});

describe('recursive schema whose name is cleared', () => {
  const TREE = `openapi: 3.0.3
info: {title: T, version: '1'}
paths:
  /tree:
    get:
      responses:
        '200': {description: ok, content: {application/json: {schema: {$ref: '#/components/schemas/TreeNode'}}}}
components:
  schemas:
    TreeNode:
      type: object
      properties:
        children: {type: array, items: {$ref: '#/components/schemas/TreeNode'}}
`;

  it('serializes without overflowing the stack and the validator reports the missing name', () => {
    useEditorStore.getState().initializeDocument(parseOk(TREE).doc);
    const id = byName('TreeNode').id;
    useEditorStore.getState().updateSchema(id, { name: '' });
    const doc = useEditorStore.getState().document;

    const out = exported(doc);
    // inlined once where it is used; the recursion point becomes an empty schema
    const inlined = out.paths['/tree'].get.responses['200'].content['application/json'].schema;
    expect(inlined.properties.children.items).toEqual({});
    expect(() => validateToIssues(doc)).not.toThrow();
    const errors = validateDocument(doc).errors;
    expect(errors.map((e) => [e.code, e.location.nodeId])).toContainEqual(['UNNAMED_SCHEMA', id]);
  });
});

function bomb(depth: number) {
  let y = "openapi: 3.0.3\ninfo: {title: T, version: '1'}\npaths: {}\nx-defs:\n  l0: &l0 {type: string, example: lol}\n";
  for (let i = 1; i <= depth; i++) y += `  l${i}: &l${i} [*l${i - 1}, *l${i - 1}]\n`;
  return `${y}components:\n  schemas:\n    Bomb: {type: object, example: *l${depth}}\n`;
}

describe('YAML alias bombs and oversized input', () => {
  it('rejects a document whose aliases expand far beyond its size', () => {
    const source = bomb(17); // ~550 bytes that expand to ~14 MB
    const { document, errors } = parseYaml(source);
    expect(document).toBeNull();
    expect(errors.map((e) => [e.code, e.severity])).toEqual([['YAML_ALIAS_LIMIT', 'error']]);
    expect(errors[0].message).toMatch(/aliases/i);
  });

  it('still accepts ordinary anchor/alias reuse', () => {
    const { doc, errors } = parseOk(`openapi: 3.0.3
info: {title: T, version: '1'}
paths:
  /a:
    get:
      responses:
        '200': &ok {description: ok, content: {application/json: {schema: {type: string}}}}
        '201': *ok
`);
    expect(errors).toEqual([]);
    expect(exported(doc).paths['/a'].get.responses['201']).toEqual({ description: 'ok', content: { 'application/json': { schema: { type: 'string' } } } });
  });

  it('rejects JSON nested too deeply to walk instead of throwing', () => {
    const depth = 20_000;
    const deep = `{"openapi":"3.0.3","info":{"title":"T","version":"1"},"paths":{},"components":{"schemas":{"Deep":${'{"items":'.repeat(depth)}{}${'}'.repeat(depth)}}}}`;
    const { document, errors } = parseYaml(deep);
    expect(document).toBeNull();
    expect(errors.map((e) => e.code)).toEqual(['DOCUMENT_TOO_DEEP']);
  });

  it('rejects input over the size limit before parsing it', () => {
    const { document, errors } = parseYaml(`openapi: 3.0.3\n#${' '.repeat(MAX_DOCUMENT_CHARS)}`);
    expect(document).toBeNull();
    expect(errors.map((e) => e.code)).toEqual(['DOCUMENT_TOO_LARGE']);
  });
});

describe('refs outside properties/items/variants', () => {
  const SPEC = `openapi: 3.0.3
info: {title: T, version: '1'}
paths:
  /m:
    get:
      responses:
        '200': {description: ok, content: {application/json: {schema: {$ref: '#/components/schemas/Map'}}}}
components:
  schemas:
    Map: {type: object, additionalProperties: {$ref: '#/components/schemas/Pet'}}
    Pet:
      oneOf: [{$ref: '#/components/schemas/Cat'}]
      discriminator: {propertyName: kind, mapping: {cat: '#/components/schemas/Cat', dog: Dog}}
    Cat: {type: object, properties: {kind: {type: string}}}
    Dog: {type: object, properties: {kind: {type: string}}}
    Negated: {not: {$ref: '#/components/schemas/Dog'}}
`;

  it('counts them as usages (no orphan warning for a schema that is in use)', () => {
    const { doc } = parseOk(SPEC);
    const counts = getSchemaUsageCounts(doc);
    expect(counts.get(schema(doc, 'Pet').id)).toBe(1); // additionalProperties
    expect(counts.get(schema(doc, 'Dog').id)).toBe(2); // mapping (bare name) + not
    const orphans = validateDocument(doc).warnings.filter((w) => w.code === 'ORPHANED_SCHEMA').map((w) => w.location.nodeId);
    expect(orphans).toEqual([schema(doc, 'Negated').id]);
  });

  it('follows renames on export', () => {
    useEditorStore.getState().initializeDocument(parseOk(SPEC).doc);
    const { updateSchema } = useEditorStore.getState();
    updateSchema(byName('Pet').id, { name: 'Animal' });
    updateSchema(byName('Cat').id, { name: 'Feline' });
    updateSchema(byName('Dog').id, { name: 'Canine' });
    const out = exported(useEditorStore.getState().document).components.schemas;
    expect(out.Map.additionalProperties).toEqual({ $ref: '#/components/schemas/Animal' });
    expect(out.Animal.discriminator.mapping).toEqual({ cat: '#/components/schemas/Feline', dog: 'Canine' });
    expect(out.Negated.not).toEqual({ $ref: '#/components/schemas/Canine' });
  });

  it('reports them as broken when the target is deleted', () => {
    useEditorStore.getState().initializeDocument(parseOk(SPEC).doc);
    useEditorStore.getState().deleteSchema(byName('Pet').id);
    useEditorStore.getState().deleteSchema(byName('Dog').id);
    const broken = validateDocument(useEditorStore.getState().document).errors.filter((e) => e.code === 'BROKEN_REFERENCE');
    expect(broken.map((e) => e.location.nodeId).toSorted()).toEqual([byName('Map').id, byName('Negated').id].toSorted());
  });

  it('warns when references are kept as plain text (e.g. inside extensions)', () => {
    const { errors } = parseOk(`openapi: 3.0.3
info: {title: T, version: '1'}
paths: {}
components:
  schemas:
    A: {type: string}
    B:
      type: object
      x-see-also: {$ref: '#/components/schemas/A'}
`);
    expect(errors.map((e) => [e.code, e.severity])).toEqual([['REFS_KEPT_AS_TEXT', 'warning']]);
  });
});

describe('field descriptions', () => {
  it('clearing an imported field description removes it from the export', () => {
    const { doc } = parseOk(`openapi: 3.0.3
info: {title: T, version: '1'}
paths: {}
components:
  schemas:
    Pet: {type: object, properties: {name: {type: string, description: Old secret note}}}
`);
    useEditorStore.getState().initializeDocument(doc);
    const id = byName('Pet').id;
    expect(exported(doc).components.schemas.Pet.properties.name.description).toBe('Old secret note');
    useEditorStore.getState().updateField(id, 'name', { description: undefined });
    expect(exported(useEditorStore.getState().document).components.schemas.Pet.properties.name).toEqual({ type: 'string' });
  });
});

describe('__proto__ and other key-controlled names', () => {
  it('keeps a schema, property and extra keyword named __proto__ (JSON input)', () => {
    const spec = '{"openapi":"3.0.3","info":{"title":"T","version":"1"},"paths":{"/a":{"get":{"responses":{"200":{"description":"ok","content":{"application/json":{"schema":{"$ref":"#/components/schemas/__proto__"}}}}}}}},"components":{"schemas":{"__proto__":{"type":"object","properties":{"__proto__":{"type":"string"}}},"Other":{"type":"string","__proto__":{"x":1}}}}}';
    const { doc } = parseOk(spec);
    const other = schema(doc, 'Other');
    expect(Object.getPrototypeOf(other.extraKeywords)).not.toEqual({ x: 1 });
    expect(Object.hasOwn(other.extraKeywords!, '__proto__')).toBe(true);

    const out = exported(doc);
    expect(Object.keys(out.components.schemas)).toEqual(['__proto__', 'Other']);
    expect(Object.hasOwn(out.components.schemas.__proto__.properties, '__proto__')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(out.components.schemas.Other, '__proto__')?.value).toEqual({ x: 1 });
    expect(out.paths['/a'].get.responses['200'].content['application/json'].schema).toEqual({ $ref: '#/components/schemas/__proto__' });
    expect(({} as Json).x).toBeUndefined();
  });

  it('keeps a schema named __proto__ (YAML input)', () => {
    const { doc } = parseOk("openapi: 3.0.3\ninfo: {title: T, version: '1'}\npaths: {}\ncomponents:\n  schemas:\n    __proto__: {type: string}\n");
    expect(Object.keys(exported(doc).components.schemas)).toEqual(['__proto__']);
  });

  it('quotes keys that YAML 1.1 reads as numbers (1_000)', () => {
    expect(stringifyYaml({ '1_000': 'a', '1_0.5': 'b' })).toBe('"1_000": a\n"1_0.5": b\n');
  });
});
