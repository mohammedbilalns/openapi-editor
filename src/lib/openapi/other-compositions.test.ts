/**
 * A schema with two compositions (`allOf` + `oneOf`): the editor edits the
 * first kind it finds (oneOf, anyOf, allOf) and keeps the others parsed, so
 * their refs count as usages, follow renames and break visibly on delete.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { parseText } from './parser';
import { serializeToYaml } from './serializer';
import { useEditorStore } from './store';
import { validateDocument } from './validator';
import { getSchemaUsageCounts } from './refs';
import { buildSchemaUsage } from './selectors';
import type { ApiDocument } from './types';
import { parseOk, schema } from '@/test/helpers';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SPEC = `openapi: 3.0.3
info: {title: T, version: '1'}
paths: {}
components:
  schemas:
    Base: {type: object, properties: {id: {type: string}}}
    Cat: {type: object}
    Dog: {type: object}
    Pet:
      allOf:
        - $ref: '#/components/schemas/Base'
        - {type: object, properties: {owner: {$ref: '#/components/schemas/Base'}}}
      oneOf:
        - $ref: '#/components/schemas/Cat'
        - $ref: '#/components/schemas/Dog'
`;

const exported = (doc: ApiDocument): Json => parseText(serializeToYaml(doc)) as Json;
const byName = (name: string) => schema(useEditorStore.getState().document, name);

beforeEach(() => {
  useEditorStore.getState().initializeDocument(parseOk(SPEC).doc);
});

describe('a second composition on one schema', () => {
  it('is kept parsed, without a "kept as text" warning, and exports unchanged', () => {
    const { doc, errors } = parseOk(SPEC);
    expect(errors.map((e) => e.code)).not.toContain('REFS_KEPT_AS_TEXT');
    const pet = schema(doc, 'Pet');
    expect(pet.type).toBe('oneOf');
    expect(pet.otherCompositions?.allOf).toHaveLength(2);
    expect(exported(doc).components.schemas.Pet).toEqual((parseText(SPEC) as Json).components.schemas.Pet);
  });

  it('counts its refs as usages, in the counts and in "Used in"', () => {
    const doc = useEditorStore.getState().document;
    const base = byName('Base').id;
    expect(getSchemaUsageCounts(doc).get(base)).toBe(2);
    expect(buildSchemaUsage(doc.routes, doc.schemas).get(base)?.map((r) => r.label)).toEqual(['Pet']);
  });

  it('follows renames on export', () => {
    useEditorStore.getState().updateSchema(byName('Base').id, { name: 'Entity' });
    const pet = exported(useEditorStore.getState().document).components.schemas.Pet;
    expect(pet.allOf).toEqual([
      { $ref: '#/components/schemas/Entity' },
      { type: 'object', properties: { owner: { $ref: '#/components/schemas/Entity' } } },
    ]);
  });

  it('reports its refs as broken when the target is deleted', () => {
    useEditorStore.getState().deleteSchema(byName('Base').id);
    const broken = validateDocument(useEditorStore.getState().document).errors.filter((e) => e.code === 'BROKEN_REFERENCE');
    expect(broken.map((e) => e.location.nodeId)).toEqual([byName('Pet').id, byName('Pet').id]);
  });
});
