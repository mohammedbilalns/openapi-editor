import { describe, expect, it } from 'vitest';
import { parseYaml } from './parser';
import { REALISTIC_SPEC_YAML } from '@/test/fixtures/realistic-spec';
import { expectRefTo, inline, parseOk, route, schema } from '@/test/helpers';

const codes = (errors: { code: string }[]) => errors.map((e) => e.code);

describe('parseYaml: realistic spec', () => {
  const { doc, errors } = parseOk(REALISTIC_SPEC_YAML);

  it('parses without errors', () => {
    expect(errors.filter((e) => e.severity === 'error')).toEqual([]);
  });

  it('keeps info, including a date-like version as a string', () => {
    expect(doc.info.title).toBe('Pet Store');
    expect(doc.info.version).toBe('2024-06-20');
    expect(doc.info.description).toBe('A realistic pet store.\nSupports **markdown**.\n');
    expect(doc.info.termsOfService).toBe('https://example.com/terms');
    expect(doc.info.contact).toEqual({ name: 'API Team', email: 'api@example.com', url: 'https://example.com' });
    expect(doc.info.license).toEqual({ name: 'Apache 2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0.html' });
  });

  it('keeps servers and tags in order', () => {
    expect(doc.servers.map((s) => s.url)).toEqual(['https://{region}.api.example.com/v1', 'http://localhost:8080']);
    expect(doc.servers[0].description).toBe('Regional production');
    expect(doc.tags).toEqual([
      { name: 'pets', description: 'Everything about pets' },
      { name: 'store', description: undefined },
    ]);
  });

  it('registers every component schema by name, in document order', () => {
    expect(Array.from(doc.schemas.values()).map((s) => s.name)).toEqual([
      'Pet', 'NewPet', 'PetKind', 'Dog', 'Cat', 'PetStatus', 'Priority', 'Tag', 'TagObject', 'Error',
    ]);
    // map keys are the node ids
    for (const [id, s] of doc.schemas) expect(s.id).toBe(id);
  });

  it('turns $refs into typed edges pointing at the target schema id', () => {
    const newPet = schema(doc, 'NewPet');
    expectRefTo(doc, newPet.properties!.get('kind')!.schema, 'PetKind');
    expectRefTo(doc, newPet.properties!.get('status')!.schema, 'PetStatus');
  });

  it('parses object properties with required flags, formats and constraints', () => {
    const newPet = schema(doc, 'NewPet');
    expect(newPet.type).toBe('object');
    expect(newPet.description).toBe('A pet to create');
    expect(Array.from(newPet.properties!.keys())).toEqual(['name', 'kind', 'status', 'birthday', 'weight', 'vaccinated', 'owner']);
    expect(newPet.required).toEqual(['name', 'kind']);
    expect(newPet.properties!.get('name')!.required).toBe(true);
    expect(newPet.properties!.get('weight')!.required).toBe(false);

    const name = inline(newPet.properties!.get('name')!.schema);
    expect(name).toMatchObject({ type: 'string', minLength: 1, maxLength: 64, pattern: '^[A-Za-z ]+$', example: 'Rex' });
    expect(inline(newPet.properties!.get('birthday')!.schema)).toMatchObject({ type: 'string', format: 'date' });
    expect(inline(newPet.properties!.get('weight')!.schema)).toMatchObject({ type: 'number', format: 'float', minimum: 0 });
    expect(inline(newPet.properties!.get('vaccinated')!.schema)).toMatchObject({ type: 'boolean', default: false });

    const owner = inline(newPet.properties!.get('owner')!.schema);
    expect(owner.type).toBe('object');
    expect(owner.description).toBe('Inline owner');
    expect(inline(owner.properties!.get('email')!.schema).format).toBe('email');
  });

  it('parses allOf / oneOf / anyOf variants, mixing refs and inline schemas', () => {
    const pet = schema(doc, 'Pet');
    expect(pet.type).toBe('allOf');
    expect(pet.variants).toHaveLength(2);
    expectRefTo(doc, pet.variants![0], 'NewPet');
    const extra = inline(pet.variants![1]);
    expect(extra.required).toEqual(['id']);
    expect(inline(extra.properties!.get('id')!.schema)).toMatchObject({ format: 'uuid', example: '7f1c4ce0-0000-4000-8000-000000000000' });
    const tags = inline(extra.properties!.get('tags')!.schema);
    expect(tags.type).toBe('array');
    expectRefTo(doc, tags.items, 'Tag');

    const kind = schema(doc, 'PetKind');
    expect(kind.type).toBe('oneOf');
    expectRefTo(doc, kind.variants![0], 'Dog');
    expectRefTo(doc, kind.variants![1], 'Cat');
    expect(kind.discriminator?.propertyName).toBe('type');

    const tag = schema(doc, 'Tag');
    expect(tag.type).toBe('anyOf');
    expect(inline(tag.variants![0]).type).toBe('string');
    expectRefTo(doc, tag.variants![1], 'TagObject');
  });

  it('parses string enums', () => {
    const status = schema(doc, 'PetStatus');
    expect(status.type).toBe('enum');
    expect(status.enumValues).toEqual(['available', 'pending', 'sold']);
    expect(status.description).toBe('Adoption status');
    expect(status.default).toBe('available');
  });

  it('parses every operation with its method and path', () => {
    const ops = Array.from(doc.routes.values()).map((r) => `${r.method} ${r.path}`);
    expect(ops.sort()).toEqual(['delete /pets/{petId}', 'get /health', 'get /pets', 'get /pets/{petId}', 'post /pets'].sort());
    const del = route(doc, 'delete', '/pets/{petId}');
    expect(del.deprecated).toBe(true);
    expect(del.operationId).toBe('deletePet');
    expect(del.tags).toEqual(['pets']);
  });

  it('parses operation parameters with inline and ref schemas', () => {
    const list = route(doc, 'get', '/pets');
    const limit = list.parameters.find((p) => p.name === 'limit')!;
    expect(limit).toMatchObject({ in: 'query', required: false, description: 'Max items' });
    expect(inline(limit.schema)).toMatchObject({ type: 'integer', format: 'int32', minimum: 1, maximum: 100, default: 20 });
    expectRefTo(doc, list.parameters.find((p) => p.name === 'status')!.schema, 'PetStatus');
  });

  it('parses request bodies and responses, including arrays of refs', () => {
    const create = route(doc, 'post', '/pets');
    expect(create.requestBody?.required).toBe(true);
    expect(create.requestBody?.description).toBe('Pet to add');
    const media = create.requestBody!.content.get('application/json')!;
    expectRefTo(doc, media.schema, 'NewPet');
    expect(media.example).toEqual({ name: 'Rex', kind: 'dog' });
    expectRefTo(doc, create.responses.get('201')!.content!.get('application/json')!.schema, 'Pet');

    const list = route(doc, 'get', '/pets');
    const ok = list.responses.get('200')!;
    expect(ok.description).toBe('A page of pets');
    const arr = inline(ok.content!.get('application/json')!.schema);
    expect(arr.type).toBe('array');
    expectRefTo(doc, arr.items, 'Pet');

    const health = route(doc, 'get', '/health');
    expect(inline(health.responses.get('200')!.content!.get('text/plain')!.schema)).toMatchObject({ type: 'string', example: 'ok' });
  });

  it('applies path-level parameters to every operation of the path', () => {
    for (const method of ['get', 'delete'] as const) {
      const r = route(doc, method, '/pets/{petId}');
      const petId = r.parameters.find((p) => p.name === 'petId');
      expect(petId, method).toMatchObject({ in: 'path', required: true, description: 'The pet id' });
      expect(inline(petId!.schema).format).toBe('uuid');
    }
    // ids are per operation so editing one does not edit the other
    expect(route(doc, 'get', '/pets/{petId}').parameters[0].id).not.toBe(route(doc, 'delete', '/pets/{petId}').parameters[0].id);
  });

  it('resolves #/components/parameters refs', () => {
    const trace = route(doc, 'get', '/pets').parameters.find((p) => p.in === 'header');
    expect(trace).toMatchObject({ name: 'X-Trace-Id', in: 'header', required: false });
    expect(inline(trace!.schema).type).toBe('string');
    expect(route(doc, 'get', '/pets').parameters.map((p) => p.name)).toEqual(['limit', 'status', 'X-Trace-Id']);
  });

  it('resolves #/components/responses refs', () => {
    const shared = [
      route(doc, 'get', '/pets').responses.get('default'),
      route(doc, 'post', '/pets').responses.get('400'),
      route(doc, 'get', '/pets/{petId}').responses.get('404'),
    ];
    for (const r of shared) {
      expect(r?.description).toBe('Error payload');
      expectRefTo(doc, r?.content?.get('application/json')?.schema, 'Error');
    }
  });

  it('parses response headers', () => {
    const headers = route(doc, 'get', '/pets').responses.get('200')!.headers!;
    expect(Array.from(headers.keys())).toEqual(['X-Rate-Limit-Remaining']);
    const h = headers.get('X-Rate-Limit-Remaining')!;
    expect(h).toMatchObject({ name: 'X-Rate-Limit-Remaining', in: 'header', description: 'Requests left' });
    expect(inline(h.schema).type).toBe('integer');
  });

  it('parses http, apiKey and openIdConnect security schemes', () => {
    const byName = new Map(Array.from(doc.securitySchemes.values()).map((s) => [s.name, s]));
    expect(Array.from(byName.keys())).toEqual(['bearerAuth', 'apiKey', 'oauth', 'oidc']);
    expect(byName.get('bearerAuth')).toMatchObject({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' });
    expect(byName.get('apiKey')).toMatchObject({ type: 'apiKey', in: 'header', paramName: 'X-API-Key' });
    expect(byName.get('oauth')).toMatchObject({ type: 'oauth2', description: 'OAuth2 code flow' });
    expect(byName.get('oidc')).toMatchObject({ type: 'openIdConnect', openIdConnectUrl: 'https://example.com/.well-known/openid-configuration' });
  });
});

describe('parseYaml: malformed and edge inputs', () => {
  it('reports a YAML syntax error without a document', () => {
    const result = parseYaml('openapi: 3.0.0\ninfo: [unclosed');
    expect(result.document).toBeNull();
    expect(codes(result.errors)).toEqual(['YAML_PARSE_ERROR']);
  });

  it.each(['', '   \n', '42', '"just a string"'])('rejects non-object documents (%j)', (input) => {
    const result = parseYaml(input);
    expect(result.document).toBeNull();
    expect(codes(result.errors)).toEqual(['INVALID_DOCUMENT']);
  });

  it('flags a missing info object but still returns the document', () => {
    const result = parseYaml('openapi: 3.0.0\npaths: {}');
    expect(codes(result.errors)).toContain('MISSING_INFO');
    expect(result.document?.info.title).toBe('New API');
  });

  it('warns about missing title and version', () => {
    const result = parseYaml('openapi: 3.0.0\ninfo: {}\npaths: {}');
    expect(codes(result.errors)).toEqual(expect.arrayContaining(['MISSING_TITLE', 'MISSING_VERSION']));
    expect(result.document?.info).toMatchObject({ title: 'Untitled API', version: '1.0.0' });
  });

  it('accepts JSON input (YAML is a superset of JSON)', () => {
    const json = JSON.stringify({
      openapi: '3.0.1',
      info: { title: 'J', version: '1' },
      paths: { '/a': { get: { responses: { '200': { description: 'ok' } } } } },
    });
    const { doc, errors } = parseOk(json);
    expect(errors).toEqual([]);
    expect(route(doc, 'get', '/a').responses.get('200')?.description).toBe('ok');
  });

  it('rejects Swagger 2.0 with an error (the import dialog blocks on errors)', () => {
    const result = parseYaml('swagger: "2.0"\ninfo: {title: S, version: "1"}\npaths: {}');
    expect(result.errors.find((e) => e.code === 'INVALID_VERSION')?.severity).toBe('error');
  });

  it('warns on an unresolved $ref but keeps the operation', () => {
    const { doc, errors } = parseOk(`
openapi: 3.0.0
info: {title: T, version: '1'}
paths:
  /a:
    get:
      responses:
        '200':
          description: ok
          content:
            application/json:
              schema: {$ref: '#/components/schemas/Missing'}
`);
    expect(errors.map((e) => [e.code, e.severity])).toEqual([['UNRESOLVED_REF', 'warning']]);
    expect(route(doc, 'get', '/a').responses.get('200')?.content?.has('application/json')).toBe(true);
  });

  it('adds a default 200 response to operations without responses', () => {
    const { doc } = parseOk('openapi: 3.0.0\ninfo: {title: T, version: "1"}\npaths:\n  /a:\n    get: {}\n');
    expect(Array.from(route(doc, 'get', '/a').responses.keys())).toEqual(['200']);
  });

  it('ignores non-operation keys of a path item', () => {
    const { doc } = parseOk(`
openapi: 3.0.0
info: {title: T, version: '1'}
paths:
  /a:
    summary: path summary
    x-internal: true
    get: {responses: {'200': {description: ok}}}
`);
    expect(doc.routes.size).toBe(1);
  });

  it('lets an operation parameter override a path-level one with the same name and location', () => {
    const { doc } = parseOk(`
openapi: 3.0.0
info: {title: T, version: '1'}
paths:
  /a/{id}:
    parameters:
      - {name: id, in: path, required: true, description: from path, schema: {type: string}}
      - {name: v, in: query, schema: {type: string}}
    get:
      parameters:
        - {name: id, in: path, required: true, description: from operation, schema: {type: integer}}
      responses: {'200': {description: ok}}
`);
    const params = route(doc, 'get', '/a/{id}').parameters;
    expect(params.map((p) => `${p.in}:${p.name}:${p.description ?? ''}`)).toEqual(['query:v:', 'path:id:from operation']);
  });

  it('follows chained component refs and warns (without inventing a parameter) when unresolved', () => {
    const { doc, errors } = parseOk(`
openapi: 3.0.0
info: {title: T, version: '1'}
paths:
  /a:
    get:
      parameters:
        - $ref: '#/components/parameters/Alias'
        - $ref: '#/components/parameters/Nope'
      requestBody:
        $ref: '#/components/requestBodies/Body'
      responses:
        '200': {$ref: '#/components/responses/Missing'}
components:
  parameters:
    Alias: {$ref: '#/components/parameters/Real'}
    Real: {name: page, in: query, schema: {type: integer}}
  requestBodies:
    Body:
      required: true
      content:
        text/plain: {schema: {type: string}}
`);
    const r = route(doc, 'get', '/a');
    expect(r.parameters.map((p) => p.name)).toEqual(['page']);
    expect(r.requestBody?.required).toBe(true);
    expect(r.requestBody?.content.has('text/plain')).toBe(true);
    expect(r.responses.has('200')).toBe(true);
    expect(errors.map((e) => `${e.code}:${e.message}`)).toEqual([
      'UNRESOLVED_REF:Unresolved reference: #/components/parameters/Nope',
      'UNRESOLVED_REF:Unresolved reference: #/components/responses/Missing',
    ]);
  });

  it('normalises upper-case method keys', () => {
    const { doc } = parseOk("openapi: 3.0.0\ninfo: {title: T, version: '1'}\npaths:\n  /a:\n    GET: {responses: {'200': {description: ok}}}\n");
    expect(Array.from(doc.routes.values()).map((r) => r.method)).toEqual(['get']);
  });

  it('tolerates empty (null) values where objects are expected instead of throwing', () => {
    const result = parseYaml(`
openapi: 3.0.0
info: {title: T, version: '1'}
paths:
  /a:
    post:
      parameters:
        -
        - name: q
          in: query
      requestBody:
        content:
          application/json:
      responses:
        '200':
        '404': ~
components:
  schemas:
    Empty:
    Holder:
      type: object
      properties:
        loose:
      required: [loose]
    List:
      type: array
      items:
`);
    expect(result.document).not.toBeNull();
    const doc = result.document!;
    const post = route(doc, 'post', '/a');
    expect(post.parameters.map((p) => p.name)).toEqual(['q']);
    expect(Array.from(post.responses.keys())).toEqual(['200', '404']);
    expect(post.requestBody?.content.has('application/json')).toBe(true);
    expect(schema(doc, 'Empty').type).toBe('object');
    expect(schema(doc, 'Holder').properties!.get('loose')!.required).toBe(true);
    expect(schema(doc, 'List').type).toBe('array');
  });

  it('gives each parse fresh node ids (no state leaks between parses)', () => {
    const a = parseOk(REALISTIC_SPEC_YAML).doc;
    const b = parseOk(REALISTIC_SPEC_YAML).doc;
    const idsA = new Set(a.schemas.keys());
    for (const id of b.schemas.keys()) expect(idsA.has(id)).toBe(false);
    // refs of b point into b, never into a
    expectRefTo(b, schema(b, 'NewPet').properties!.get('kind')!.schema, 'PetKind');
  });
});
