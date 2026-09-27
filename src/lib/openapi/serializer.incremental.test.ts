import { beforeEach, describe, expect, it } from 'vitest';
import { serializeDocument, serializeToYaml, stringifyYaml } from './serializer';
import { useEditorStore } from './store';
import { createRoute, createSchema, type ApiDocument } from './types';
import { REALISTIC_SPEC_YAML } from '@/test/fixtures/realistic-spec';
import { SIZES, generateSpecYaml } from '@/test/fixtures/generate-spec';
import { parseOk, route, schema } from '@/test/helpers';

// serializeToYaml caches YAML per operation/schema node; it must always equal
// the straightforward full serialization.
const full = (doc: ApiDocument) => stringifyYaml(serializeDocument(doc));
const store = () => useEditorStore.getState();
const expectInSync = () => expect(serializeToYaml(store().document)).toBe(full(store().document));

describe('incremental serializeToYaml', () => {
  beforeEach(() => {
    store().initializeDocument(parseOk(REALISTIC_SPEC_YAML).doc);
    useEditorStore.setState({ historyCoalesceMs: 0 });
    expectInSync(); // warm the fragment cache
  });

  it('matches a full serialization of a generated medium spec', () => {
    const { doc } = parseOk(generateSpecYaml(SIZES.medium));
    expect(serializeToYaml(doc)).toBe(full(doc));
  });

  it('reflects route edits, additions and deletions', () => {
    const doc = store().document;
    store().updateRoute(route(doc, 'get', '/pets').id, { summary: 'Changed' });
    expectInSync();
    expect(serializeToYaml(store().document)).toContain('summary: Changed');
    store().addRoute(createRoute('/pets', 'put')); // new method on an existing path
    expectInSync();
    store().addRoute(createRoute('/aaa', 'get')); // new path sorted first
    expectInSync();
    store().deleteRoute(route(doc, 'post', '/pets').id);
    expectInSync();
  });

  it('re-emits cached refs when a referenced schema is renamed or deleted', () => {
    const doc = store().document;
    store().updateSchema(schema(doc, 'Pet').id, { name: 'Animal' });
    expectInSync();
    const text = serializeToYaml(store().document);
    expect(text).toContain('$ref: "#/components/schemas/Animal"');
    expect(text).not.toContain('#/components/schemas/Pet"');
    store().deleteSchema(schema(doc, 'Error').id);
    expectInSync();
  });

  it('re-emits inlined unnamed schemas when they change', () => {
    const anon = createSchema('object');
    store().addSchema(anon);
    const petId = schema(store().document, 'NewPet').id;
    store().addFieldToSchema(petId, { name: 'extra', required: false, schema: { kind: 'ref', targetId: anon.id } });
    expectInSync();
    store().addFieldToSchema(anon.id, { name: 'inner', required: true, schema: { kind: 'inline', schema: createSchema('string') } });
    expectInSync();
    expect(serializeToYaml(store().document)).toContain('inner:');
  });

  it('re-emits operations when a security scheme is renamed', () => {
    const oauth = Array.from(store().document.securitySchemes.values()).find((s) => s.name === 'oauth')!;
    store().updateSecurityScheme(oauth.id, { name: 'oauth2' });
    expectInSync();
    expect(serializeToYaml(store().document)).toContain('- oauth2:');
  });

  it('handles info/servers/tags edits, undo/redo and odd keys', () => {
    store().updateInfo({ description: 'Multi\n\nline\n' });
    store().addServer({ url: 'https://x.example.com', variables: { v: { default: '1' } } });
    store().addTag({ name: 'extra' });
    expectInSync();
    store().undo();
    store().undo();
    expectInSync();
    store().redo();
    expectInSync();
    store().addSchema(createSchema('string', '200'));
    store().addRoute(createRoute('/with space/{id}', 'get'));
    expectInSync();
  });
});
