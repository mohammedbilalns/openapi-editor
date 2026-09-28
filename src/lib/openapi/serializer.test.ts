import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import * as YAML from 'yaml';
import * as jsyaml from 'js-yaml';
import { serializeDocument, serializeToYaml, stringifyYaml } from './serializer';
import { createEmptyDocument, createRoute, createSchema, type ApiDocument, type SchemaNode } from './types';
import { REALISTIC_SPEC_YAML } from '@/test/fixtures/realistic-spec';
import { LOSSLESS_SPEC_YAML } from '@/test/fixtures/lossless-spec';
import { parseOk, route, schema } from '@/test/helpers';
import { IndexedDBRepository } from '@/lib/storage/repository';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** serialize -> YAML text -> plain JS, i.e. what a consumer of the export sees */
const exported = (doc: ApiDocument): Json => YAML.parse(serializeToYaml(doc));

describe('serializeToYaml: realistic spec round trip', () => {
  const original: Json = YAML.parse(REALISTIC_SPEC_YAML);
  const { doc } = parseOk(REALISTIC_SPEC_YAML);
  const out = exported(doc);

  it('emits OpenAPI 3.0.3 with the same info', () => {
    expect(out.openapi).toBe('3.0.3');
    expect(out.info).toEqual(original.info);
  });

  it('keeps every path and method', () => {
    const ops = (spec: Json) =>
      Object.entries(spec.paths as Json).flatMap(([p, item]) =>
        Object.keys(item).filter((k) => ['get', 'post', 'put', 'patch', 'delete'].includes(k)).map((m) => `${m} ${p}`)
      );
    expect(ops(out).sort()).toEqual(ops(original).sort());
  });

  it('keeps every component schema exactly (nullable, typed enums, defaults, mappings, extra keywords)', () => {
    expect(Object.keys(out.components.schemas)).toEqual(Object.keys(original.components.schemas));
    for (const name of Object.keys(original.components.schemas)) {
      expect(out.components.schemas[name], name).toEqual(original.components.schemas[name]);
    }
  });

  it('is lossless apart from documented normalisations', () => {
    // Normalisations: version pinned to 3.0.3, components.parameters/responses
    // inlined where used, path-level parameters copied into each operation.
    const expected = structuredClone(original);
    expected.openapi = '3.0.3';
    const errorResponse = expected.components.responses.Error;
    delete expected.components.parameters;
    delete expected.components.responses;
    const petParams = expected.paths['/pets/{petId}'].parameters;
    delete expected.paths['/pets/{petId}'].parameters;
    expected.paths['/pets/{petId}'].get.parameters = petParams;
    expected.paths['/pets/{petId}'].delete.parameters = petParams;
    expected.paths['/pets/{petId}'].get.responses['404'] = errorResponse;
    expected.paths['/pets'].get.parameters[2] = { name: 'X-Trace-Id', in: 'header', required: false, schema: { type: 'string' } };
    expected.paths['/pets'].get.responses.default = errorResponse;
    expected.paths['/pets'].post.responses['400'] = errorResponse;
    expect(out).toEqual(expected);
  });

  it('keeps $refs, allOf members and arrays of refs', () => {
    expect(out.components.schemas.Pet.allOf[0]).toEqual({ $ref: '#/components/schemas/NewPet' });
    expect(out.components.schemas.Pet.allOf[1].properties.tags).toEqual({
      type: 'array',
      items: { $ref: '#/components/schemas/Tag' },
    });
    expect(out.paths['/pets'].get.responses['200'].content['application/json'].schema).toEqual({
      type: 'array',
      items: { $ref: '#/components/schemas/Pet' },
    });
  });

  it('keeps parameters, request bodies with examples and response descriptions', () => {
    const list = out.paths['/pets'].get;
    expect(list.parameters[0]).toEqual(original.paths['/pets'].get.parameters[0]);
    expect(list.parameters[1]).toEqual(original.paths['/pets'].get.parameters[1]);
    expect(out.paths['/pets'].post.requestBody).toEqual(original.paths['/pets'].post.requestBody);
    expect(out.paths['/pets'].post.responses['201']).toEqual(original.paths['/pets'].post.responses['201']);
    expect(out.paths['/health'].get.responses).toEqual(original.paths['/health'].get.responses);
  });

  it('keeps path-level and component parameters (inlined per operation)', () => {
    const pathParam = original.paths['/pets/{petId}'].parameters[0];
    expect(out.paths['/pets/{petId}'].get.parameters).toEqual([pathParam]);
    expect(out.paths['/pets/{petId}'].delete.parameters).toEqual([pathParam]);
    expect(out.paths['/pets'].get.parameters[2]).toEqual({ name: 'X-Trace-Id', in: 'header', required: false, schema: { type: 'string' } });
  });

  it('keeps component responses (inlined) and response headers', () => {
    const errorResponse = original.components.responses.Error;
    expect(out.paths['/pets'].get.responses.default).toEqual(errorResponse);
    expect(out.paths['/pets'].post.responses['400']).toEqual(errorResponse);
    expect(out.paths['/pets/{petId}'].get.responses['404']).toEqual(errorResponse);
    expect(out.paths['/pets'].get.responses['200']).toEqual(original.paths['/pets'].get.responses['200']);
  });

  it('keeps http, apiKey and openIdConnect security schemes', () => {
    for (const name of ['bearerAuth', 'apiKey', 'oidc']) {
      expect(out.components.securitySchemes[name], name).toEqual(original.components.securitySchemes[name]);
    }
  });

  it('keeps oauth2 flows and document/operation security', () => {
    expect(out.components.securitySchemes).toEqual(original.components.securitySchemes);
    expect(out.security).toEqual(original.security);
    expect(out.paths['/pets'].post.security).toEqual(original.paths['/pets'].post.security);
    expect(out.paths['/health'].get.security).toEqual([]);
    expect(out.paths['/pets'].get).not.toHaveProperty('security');
  });

  it('keeps servers and tags', () => {
    expect(out.servers.map((s: Json) => s.url)).toEqual(original.servers.map((s: Json) => s.url));
    expect(out.tags).toEqual(original.tags);
  });

  it('is a fixpoint: parse(serialize(x)) serializes to the same text', () => {
    const first = serializeToYaml(doc);
    const second = serializeToYaml(parseOk(first).doc);
    expect(second).toBe(first);
  });
});

describe('serializeDocument: model -> OpenAPI mapping', () => {
  function docWith(...schemas: SchemaNode[]): ApiDocument {
    const doc = createEmptyDocument();
    for (const s of schemas) doc.schemas.set(s.id, s);
    return doc;
  }

  it('emits refs by the *current* name of the target schema', () => {
    const user = createSchema('object', 'User');
    const list = createSchema('array', 'UserList');
    list.items = { kind: 'ref', targetId: user.id };
    const doc = docWith(user, list);
    user.name = 'Account'; // a rename is a single change on the target node
    const out = serializeDocument(doc) as Json;
    expect(out.components.schemas.UserList.items).toEqual({ $ref: '#/components/schemas/Account' });
    expect(Object.keys(out.components.schemas)).toEqual(['Account', 'UserList']);
  });

  it('inlines refs to unnamed schemas and falls back to a plain object for dangling refs', () => {
    const anon = createSchema('string');
    const holder = createSchema('object', 'Holder');
    holder.properties!.set('a', { name: 'a', required: false, schema: { kind: 'ref', targetId: anon.id } });
    holder.properties!.set('b', { name: 'b', required: false, schema: { kind: 'ref', targetId: 'missing' } });
    const out = serializeDocument(docWith(anon, holder)) as Json;
    expect(out.components.schemas.Holder.properties).toEqual({ a: { type: 'string' }, b: { type: 'object' } });
    expect(Object.keys(out.components.schemas)).toEqual(['Holder']); // unnamed schema is not a component
  });

  it('puts a property description next to its $ref', () => {
    const target = createSchema('object', 'Target');
    const holder = createSchema('object', 'Holder');
    holder.properties!.set('t', { name: 't', required: true, description: 'the target', schema: { kind: 'ref', targetId: target.id } });
    holder.required = ['t'];
    const out = serializeDocument(docWith(target, holder)) as Json;
    expect(out.components.schemas.Holder).toEqual({
      type: 'object',
      properties: { t: { $ref: '#/components/schemas/Target', description: 'the target' } },
      required: ['t'],
    });
  });

  it('groups operations under their path and sorts paths', () => {
    const doc = createEmptyDocument();
    for (const [p, m] of [['/b', 'get'], ['/a', 'post'], ['/b', 'delete'], ['/a', 'get']] as const) {
      const r = createRoute(p, m);
      doc.routes.set(r.id, r);
    }
    const out = serializeDocument(doc) as Json;
    expect(Object.keys(out.paths)).toEqual(['/a', '/b']);
    expect(Object.keys(out.paths['/a']).sort()).toEqual(['get', 'post']);
    expect(Object.keys(out.paths['/b']).sort()).toEqual(['delete', 'get']);
    expect(out.paths['/a'].get.responses).toEqual({ '200': { description: 'Successful response' } });
  });

  it('drops requirements on missing schemes instead of emitting {} (anonymous access)', () => {
    const doc = createEmptyDocument();
    doc.securitySchemes.set('s', { id: 's', name: 'bearer', type: 'http', scheme: 'bearer' });
    const onlyDangling = createRoute('/a', 'get');
    onlyDangling.security = [{ schemeId: 'gone', scopes: [] }];
    const mixed = createRoute('/b', 'get');
    mixed.security = [{ schemeId: 'gone', scopes: [] }, { schemeId: 's', scopes: [] }];
    doc.routes.set(onlyDangling.id, onlyDangling);
    doc.routes.set(mixed.id, mixed);
    const out = exported(doc);
    expect(out.paths['/a'].get).not.toHaveProperty('security'); // falls back to root security
    expect(out.paths['/b'].get.security).toEqual([{ bearer: [] }]);
  });

  it('emits the enum value type (string for editor-made enums, inferred for untyped ones)', () => {
    const made = createSchema('enum', 'Made');
    made.enumValues = ['a', 'b'];
    const untyped = createSchema('enum', 'Untyped');
    untyped.enumValues = [1, 2] as unknown as string[];
    const typed = createSchema('enum', 'Typed');
    typed.enumValues = [1.5, 2] as unknown as string[];
    typed.enumType = 'number';
    const out = serializeDocument(docWith(made, untyped, typed)) as Json;
    expect(out.components.schemas.Made).toEqual({ type: 'string', enum: ['a', 'b'] });
    expect(out.components.schemas.Untyped).toEqual({ type: 'integer', enum: [1, 2] });
    expect(out.components.schemas.Typed).toEqual({ type: 'number', enum: [1.5, 2] });
  });

  it('modelled fields win over extra keywords with the same name', () => {
    const s = createSchema('string', 'S');
    s.format = 'email';
    s.extraKeywords = { format: 'stale', readOnly: true };
    expect((serializeDocument(docWith(s)) as Json).components.schemas.S).toEqual({ type: 'string', format: 'email', readOnly: true });
  });

  it('exports unresolvable (e.g. external) refs verbatim', () => {
    const { doc, errors } = parseOk(`
openapi: 3.0.0
info: {title: T, version: '1'}
paths: {}
components:
  schemas:
    Local:
      type: object
      properties:
        ext: {$ref: 'common.yaml#/components/schemas/Money'}
`);
    expect(errors.map((e) => e.code)).toEqual(['UNRESOLVED_REF']);
    expect(exported(doc).components.schemas.Local.properties.ext).toEqual({ $ref: 'common.yaml#/components/schemas/Money' });
  });

  it('omits empty optional sections', () => {
    const out = serializeDocument(createEmptyDocument()) as Json;
    expect(out).toEqual({ openapi: '3.0.3', info: { title: 'New API', version: '1.0.0' }, paths: {} });
  });

  it('quotes values that YAML would otherwise retype', () => {
    const doc = createEmptyDocument();
    doc.info.version = '1.10';
    const r = createRoute('/x', 'get');
    r.summary = 'true';
    r.description = 'key: value # not a comment';
    doc.routes.set(r.id, r);
    const back = exported(doc);
    expect(back.info.version).toBe('1.10');
    expect(back.paths['/x'].get.summary).toBe('true');
    expect(back.paths['/x'].get.description).toBe('key: value # not a comment');
    expect(Object.keys(back.paths['/x'].get.responses)).toEqual(['200']);
  });

  it('never emits YAML anchors/aliases, even when model objects are shared', () => {
    const doc = createEmptyDocument();
    const sharedTags = ['pets'];
    const sharedExample = { name: 'Rex' };
    for (const p of ['/a', '/b']) {
      const r = createRoute(p, 'post');
      r.tags = sharedTags;
      r.requestBody = { id: `b${p}`, required: true, content: new Map([['application/json', { schema: { kind: 'inline', schema: createSchema('object') }, example: sharedExample }]]) };
      doc.routes.set(r.id, r);
    }
    const text = serializeToYaml(doc);
    expect(text).not.toMatch(/[&*]a\d/);
    const back = YAML.parse(text);
    expect(back.paths['/b'].post.tags).toEqual(['pets']);
    expect(back.paths['/b'].post.requestBody.content['application/json'].example).toEqual({ name: 'Rex' });
  });

  it('quotes strings that YAML 1.1 readers (e.g. js-yaml default schema) would retype', () => {
    const doc = createEmptyDocument();
    doc.info.version = '2024-06-20';
    const r = createRoute('/x', 'get');
    r.summary = 'yes';
    r.operationId = 'on';
    r.description = '0777';
    doc.routes.set(r.id, r);
    const yaml11 = jsyaml.load(serializeToYaml(doc)) as Json; // DEFAULT_SCHEMA: timestamps, 1.1-style values
    expect(yaml11.info.version).toBe('2024-06-20');
    expect(yaml11.paths['/x'].get).toMatchObject({ summary: 'yes', operationId: 'on', description: '0777' });
  });

  it('writes multi-line descriptions as readable block scalars', () => {
    const doc = createEmptyDocument();
    doc.info.description = 'Line one.\nLine two.\n';
    const text = serializeToYaml(doc);
    expect(text).toContain('description: |\n    Line one.\n    Line two.\n');
    expect(YAML.parse(text).info.description).toBe('Line one.\nLine two.\n');
  });

  it('re-parses exported refs to the same targets', () => {
    const { doc } = parseOk(REALISTIC_SPEC_YAML);
    const again = parseOk(serializeToYaml(doc)).doc;
    const kind = schema(again, 'NewPet').properties!.get('kind')!.schema;
    expect(kind.kind === 'ref' && again.schemas.get(kind.targetId)?.name).toBe('PetKind');
    expect(route(again, 'post', '/pets').requestBody?.required).toBe(true);
  });
});

describe('serializeToYaml: lossless round trip of everything the editor does not edit', () => {
  const original: Json = YAML.parse(LOSSLESS_SPEC_YAML);
  const { doc, errors } = parseOk(LOSSLESS_SPEC_YAML);
  const out = exported(doc);

  it('imports without warnings', () => {
    expect(errors).toEqual([]);
  });

  it('exports exactly what was imported (only the version is pinned to 3.0.3)', () => {
    expect(out).toEqual({ ...original, openapi: '3.0.3' });
  });

  it('keeps extensions, externalDocs, links, callbacks, examples and encoding', () => {
    expect(out['x-root-ext']).toEqual({ owner: 'platform' });
    expect(out.externalDocs).toEqual(original.externalDocs);
    expect(out.info['x-logo']).toEqual(original.info['x-logo']);
    expect(out.paths['/pets']['x-path-ext']).toBe(1);
    expect(out.paths['/pets'].summary).toBe('Pets collection');
    expect(out.paths['/pets'].get.responses['200'].links).toEqual(original.paths['/pets'].get.responses['200'].links);
    expect(out.paths['/pets'].post.callbacks).toEqual(original.paths['/pets'].post.callbacks);
    expect(out.components.examples).toEqual(original.components.examples);
    expect(out.components['x-components-ext']).toBe(1);
  });

  it('keeps TRACE operations, parameter style/explode/content and media types without a schema', () => {
    expect(out.paths['/pets'].trace).toEqual(original.paths['/pets'].trace);
    expect(out.paths['/pets'].get.parameters).toEqual(original.paths['/pets'].get.parameters);
    expect(out.paths['/pets'].get.responses['200'].content['application/pdf']).toEqual({});
  });

  it('keeps untyped schemas, keywords next to compositions and constraints on every kind', () => {
    for (const name of ['Any', 'Untyped', 'UntypedArray', 'UntypedEnum', 'Pet', 'Code', 'Tags', 'Dict', 'NotPet', 'Mixed']) {
      expect(out.components.schemas[name], name).toEqual(original.components.schemas[name]);
    }
  });

  it('emits the same text incrementally as in one pass', () => {
    expect(serializeToYaml(doc)).toBe(stringifyYaml(serializeDocument(doc)));
  });

  it('is a fixpoint', () => {
    const first = serializeToYaml(doc);
    expect(serializeToYaml(parseOk(first).doc)).toBe(first);
  });

  it('keeps everything through a save to and load from IndexedDB', async () => {
    globalThis.indexedDB = new IDBFactory();
    const metadata = { id: 'p', name: 'P', createdAt: 1, updatedAt: 1 };
    await new IndexedDBRepository().saveProject({ metadata, document: doc });
    const loaded = await new IndexedDBRepository().getProject('p');
    expect(serializeToYaml(loaded!.document)).toBe(serializeToYaml(doc));
  });

  it('keeps OpenAPI 3.1 multi-type schemas (type lists)', () => {
    const multi = parseOk(`
openapi: 3.0.3
info: {title: T, version: '1'}
paths: {}
components:
  schemas:
    Multi: {type: [string, integer]}
    NullableMulti: {type: [string, integer, 'null']}
`);
    const schemas = exported(multi.doc).components.schemas;
    expect(schemas.Multi).toEqual({ type: ['string', 'integer'] });
    expect(schemas.NullableMulti).toEqual({ type: ['string', 'integer'], nullable: true });
    expect(multi.errors.map((e) => e.code)).toEqual(['MULTIPLE_TYPES', 'MULTIPLE_TYPES']);
  });

  it('warns about what it cannot keep instead of dropping it silently', () => {
    const { errors: warnings } = parseOk(`
openapi: 3.0.3
info: {title: T, version: '1'}
paths:
  /empty:
    x-only: true
  /a:
    get:
      parameters:
        - $ref: '#/components/parameters/Used'
      responses: {'200': {description: ok}}
components:
  parameters:
    Used: {name: q, in: query, schema: {type: string}}
    Unused: {name: u, in: query, schema: {type: string}}
`);
    expect(warnings.map((e) => e.code).toSorted()).toEqual(['COMPONENT_NOT_KEPT', 'PATH_WITHOUT_OPERATIONS']);
  });
});
