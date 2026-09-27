import { describe, expect, it } from 'vitest';
import * as YAML from 'yaml';
import { serializeDocument, serializeToYaml } from './serializer';
import { createEmptyDocument, createRoute, createSchema, type ApiDocument, type SchemaNode } from './types';
import { REALISTIC_SPEC_YAML } from '@/test/fixtures/realistic-spec';
import { parseOk, route, schema } from '@/test/helpers';

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

  it('keeps every component schema, byte-for-byte for the fully modelled ones', () => {
    expect(Object.keys(out.components.schemas)).toEqual(Object.keys(original.components.schemas));
    for (const name of ['Dog', 'Cat', 'Tag', 'TagObject', 'Error']) {
      expect(out.components.schemas[name], name).toEqual(original.components.schemas[name]);
    }
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

  it('keeps http, apiKey and openIdConnect security schemes', () => {
    for (const name of ['bearerAuth', 'apiKey', 'oidc']) {
      expect(out.components.securitySchemes[name], name).toEqual(original.components.securitySchemes[name]);
    }
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

  it('re-parses exported refs to the same targets', () => {
    const { doc } = parseOk(REALISTIC_SPEC_YAML);
    const again = parseOk(serializeToYaml(doc)).doc;
    const kind = schema(again, 'NewPet').properties!.get('kind')!.schema;
    expect(kind.kind === 'ref' && again.schemas.get(kind.targetId)?.name).toBe('PetKind');
    expect(route(again, 'post', '/pets').requestBody?.required).toBe(true);
  });
});
