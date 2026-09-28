import { describe, expect, it } from 'vitest';
import { validateDocument } from './validator';
import { getSchemaUsageCounts } from './refs';
import {
  createEmptyDocument,
  createRoute,
  createSchema,
  type ApiDocument,
  type Route,
  type SchemaNode,
  type SchemaOrRef,
  type ValidationResult,
} from './types';

const ref = (s: SchemaNode): SchemaOrRef => ({ kind: 'ref', targetId: s.id });
const str = (): SchemaOrRef => ({ kind: 'inline', schema: createSchema('string') });

/** A small document that triggers no error and no warning at all. */
function cleanDoc() {
  const doc = createEmptyDocument();
  doc.info = { title: 'Clean', version: '1.0.0', description: 'A clean API' };
  doc.servers = [{ url: 'https://api.example.com' }];

  const pet = createSchema('object', 'Pet');
  pet.properties!.set('name', { name: 'name', required: true, schema: str() });
  pet.required = ['name'];
  doc.schemas.set(pet.id, pet);

  const get = createRoute('/pets/{petId}', 'get');
  get.operationId = 'getPet';
  get.parameters = [{ id: 'p1', name: 'petId', in: 'path', required: true, schema: str() }];
  get.responses = new Map([
    ['200', { id: 'r1', description: 'ok', content: new Map([['application/json', { schema: ref(pet) }]]) }],
    ['404', { id: 'r2', description: 'missing' }],
  ]);
  doc.routes.set(get.id, get);
  return { doc, pet, get };
}

const all = (r: ValidationResult) => [...r.errors, ...r.warnings];
const codes = (r: ValidationResult) => all(r).map((e) => e.code);
const find = (r: ValidationResult, code: string) => all(r).filter((e) => e.code === code);

function addSchema(doc: ApiDocument, s: SchemaNode) {
  doc.schemas.set(s.id, s);
  return s;
}
/** make `s` used by a route so ORPHANED_SCHEMA does not interfere */
function use(doc: ApiDocument, route: Route, s: SchemaNode) {
  route.parameters.push({ id: `use-${s.id}`, name: `q${route.parameters.length}`, in: 'query', required: false, schema: ref(s) });
  void doc;
}

describe('validateDocument', () => {
  it('reports nothing for the clean document', () => {
    const result = validateDocument(cleanDoc().doc);
    expect(all(result)).toEqual([]);
    expect(result.valid).toBe(true);
  });

  describe('info rules', () => {
    it.each([
      ['MISSING_TITLE', (d: ApiDocument) => { d.info.title = '  '; }, 'error'],
      ['MISSING_VERSION', (d: ApiDocument) => { d.info.version = ''; }, 'error'],
      ['MISSING_DESCRIPTION', (d: ApiDocument) => { d.info.description = ''; }, 'info'],
      ['NO_SERVERS', (d: ApiDocument) => { d.servers = []; }, 'warning'],
    ] as const)('%s', (code, breakIt, severity) => {
      const { doc } = cleanDoc();
      breakIt(doc);
      const result = validateDocument(doc);
      expect(codes(result)).toEqual([code]);
      expect(find(result, code)[0].severity).toBe(severity);
      expect(result.valid).toBe(severity !== 'error');
    });
  });

  describe('schema rules', () => {
    it('DUPLICATE_SCHEMA_NAME flags the second schema only', () => {
      const { doc, pet, get } = cleanDoc();
      const dup = addSchema(doc, createSchema('string', 'Pet'));
      use(doc, get, dup);
      const hits = find(validateDocument(doc), 'DUPLICATE_SCHEMA_NAME');
      expect(hits.map((h) => h.location.nodeId)).toEqual([dup.id]);
      expect(hits[0].location.nodeId).not.toBe(pet.id);
    });

    it('SCHEMA_NAMING_CONVENTION wants PascalCase', () => {
      const { doc, pet } = cleanDoc();
      pet.name = 'pet_model';
      expect(codes(validateDocument(doc))).toEqual(['SCHEMA_NAMING_CONVENTION']);
      pet.name = 'PetModel2';
      expect(codes(validateDocument(doc))).toEqual([]);
    });

    it('EMPTY_OBJECT and INVALID_REQUIRED', () => {
      const { doc, pet } = cleanDoc();
      pet.required = ['name', 'ghost'];
      const r1 = validateDocument(doc);
      expect(codes(r1)).toEqual(['INVALID_REQUIRED']);
      expect(find(r1, 'INVALID_REQUIRED')[0].location).toEqual({ nodeId: pet.id, field: 'ghost' });

      pet.properties = new Map();
      pet.required = [];
      expect(codes(validateDocument(doc))).toEqual(['EMPTY_OBJECT']);
    });

    it('EMPTY_ENUM and DUPLICATE_ENUM_VALUE', () => {
      const { doc, get } = cleanDoc();
      const e = addSchema(doc, createSchema('enum', 'Status'));
      use(doc, get, e);
      expect(codes(validateDocument(doc))).toEqual(['EMPTY_ENUM']);
      e.enumValues = ['a', 'b', 'a'];
      expect(codes(validateDocument(doc))).toEqual(['DUPLICATE_ENUM_VALUE']);
      e.enumValues = ['a', 'b'];
      expect(codes(validateDocument(doc))).toEqual([]);
    });

    it('MISSING_ARRAY_ITEMS', () => {
      const { doc, get } = cleanDoc();
      const arr = addSchema(doc, createSchema('array', 'Pets'));
      use(doc, get, arr);
      expect(codes(validateDocument(doc))).toEqual([]);
      arr.items = undefined;
      expect(codes(validateDocument(doc))).toEqual(['MISSING_ARRAY_ITEMS']);
    });

    it('EMPTY_COMPOSITION, SINGLE_VARIANT and MISSING_DISCRIMINATOR', () => {
      const { doc, get, pet } = cleanDoc();
      const one = addSchema(doc, createSchema('oneOf', 'Choice'));
      use(doc, get, one);
      expect(codes(validateDocument(doc))).toEqual(['EMPTY_COMPOSITION']);
      one.variants = [ref(pet)];
      expect(codes(validateDocument(doc))).toEqual(['SINGLE_VARIANT']);
      one.variants = [ref(pet), str()];
      expect(codes(validateDocument(doc))).toEqual(['MISSING_DISCRIMINATOR']);
      one.discriminator = { propertyName: 'kind' };
      expect(codes(validateDocument(doc))).toEqual([]);
      one.type = 'anyOf'; // discriminator hint only applies to oneOf
      one.discriminator = undefined;
      expect(codes(validateDocument(doc))).toEqual([]);
    });
  });

  describe('route rules', () => {
    it('DUPLICATE_OPERATION and DUPLICATE_OPERATION_ID', () => {
      const { doc, get } = cleanDoc();
      const copy: Route = { ...get, id: 'copy' };
      doc.routes.set(copy.id, copy);
      const r = validateDocument(doc);
      expect(codes(r).sort()).toEqual(['DUPLICATE_OPERATION', 'DUPLICATE_OPERATION_ID']);
      expect(find(r, 'DUPLICATE_OPERATION')[0].location.nodeId).toBe('copy');
    });

    it('OPERATION_ID_NAMING and MISSING_OPERATION_ID', () => {
      const { doc, get } = cleanDoc();
      get.operationId = 'Get-Pet';
      expect(codes(validateDocument(doc))).toEqual(['OPERATION_ID_NAMING']);
      get.operationId = undefined;
      expect(codes(validateDocument(doc))).toEqual(['MISSING_OPERATION_ID']);
    });

    it('UNDEFINED_PATH_PARAM for templated segments without a path parameter', () => {
      const { doc, get } = cleanDoc();
      get.parameters = [{ ...get.parameters[0], in: 'query' }];
      const hits = find(validateDocument(doc), 'UNDEFINED_PATH_PARAM');
      expect(hits.map((h) => h.message)).toEqual(['Path parameter {petId} is not defined.']);
    });

    it('NO_RESPONSES, NO_SUCCESS_RESPONSE, NO_ERROR_RESPONSE, SUCCESS_WITHOUT_BODY', () => {
      const { doc, get, pet } = cleanDoc();
      use(doc, get, pet); // keep Pet referenced while responses change
      get.responses.delete('404');
      expect(codes(validateDocument(doc))).toEqual(['NO_ERROR_RESPONSE']);

      get.responses.set('404', { id: 'x', description: 'missing' });
      get.responses.set('200', { id: 'y', description: 'no body' });
      expect(codes(validateDocument(doc))).toEqual(['SUCCESS_WITHOUT_BODY']);
      get.method = 'delete'; // bodiless success is fine for DELETE
      expect(codes(validateDocument(doc))).toEqual([]);

      get.responses.delete('200');
      expect(codes(validateDocument(doc))).toEqual(['NO_SUCCESS_RESPONSE']);

      get.responses.clear();
      expect(codes(validateDocument(doc)).sort()).toEqual(['NO_ERROR_RESPONSE', 'NO_RESPONSES', 'NO_SUCCESS_RESPONSE']);
      expect(validateDocument(doc).valid).toBe(false);
    });
  });

  describe('reference rules', () => {
    it('BROKEN_REFERENCE in schemas, nested inline schemas, parameters, bodies and responses', () => {
      const { doc, pet, get } = cleanDoc();
      const dangling: SchemaOrRef = { kind: 'ref', targetId: 'gone' };
      const nested = createSchema('array');
      nested.items = dangling;
      pet.properties!.set('friends', { name: 'friends', required: false, schema: { kind: 'inline', schema: nested } });
      get.parameters.push({ id: 'q', name: 'q', in: 'query', required: false, schema: dangling });
      get.requestBody = { id: 'b', required: true, content: new Map([['application/json', { schema: dangling }]]) };
      get.responses.set('500', { id: 'e', description: 'err', content: new Map([['application/json', { schema: dangling }]]) });

      const hits = find(validateDocument(doc), 'BROKEN_REFERENCE');
      expect(hits.map((h) => h.message).sort()).toEqual([
        'Broken reference in Pet.friends[items].',
        'Broken reference in parameter “q” of GET /pets/{petId}.',
        'Broken reference in the request body of GET /pets/{petId}.',
        'Broken reference in the 500 response of GET /pets/{petId}.',
      ].sort());
      expect(hits.every((h) => h.severity === 'error')).toBe(true);
    });

    it('ORPHANED_SCHEMA for schemas no route or schema refers to', () => {
      const { doc, pet } = cleanDoc();
      const orphan = addSchema(doc, createSchema('string', 'Orphan'));
      const used = addSchema(doc, createSchema('string', 'UsedByPet'));
      pet.properties!.set('u', { name: 'u', required: false, schema: ref(used) });
      const hits = find(validateDocument(doc), 'ORPHANED_SCHEMA');
      expect(hits.map((h) => h.location.nodeId)).toEqual([orphan.id]);
    });

    it('ORPHANED_SCHEMA for a schema only it refers to, matching its usage count of 0', () => {
      const { doc } = cleanDoc();
      const node = addSchema(doc, createSchema('object', 'TreeNode'));
      node.properties = new Map([['parent', { name: 'parent', required: false, schema: ref(node) }]]);
      const hits = find(validateDocument(doc), 'ORPHANED_SCHEMA');
      expect(hits.map((h) => h.location.nodeId)).toEqual([node.id]);
      expect(getSchemaUsageCounts(doc).get(node.id) ?? 0).toBe(0);
    });

    it('CIRCULAR_REFERENCE for a schema referencing itself', () => {
      const { doc, pet } = cleanDoc();
      pet.properties!.set('parent', { name: 'parent', required: false, schema: ref(pet) });
      const hits = find(validateDocument(doc), 'CIRCULAR_REFERENCE');
      expect(hits.map((h) => h.location.nodeId)).toEqual([pet.id]);
      expect(hits[0].severity).toBe('warning');
    });

    it('CIRCULAR_REFERENCE sees cycles through inline schemas (tree shapes)', () => {
      const { doc, pet } = cleanDoc();
      const children = createSchema('array');
      children.items = ref(pet);
      pet.properties!.set('children', { name: 'children', required: false, schema: { kind: 'inline', schema: children } });
      expect(find(validateDocument(doc), 'CIRCULAR_REFERENCE').map((h) => h.location.nodeId)).toEqual([pet.id]);
    });

    it('CIRCULAR_REFERENCE flags every member of a cycle, but not schemas that merely point into one', () => {
      const { doc, pet, get } = cleanDoc();
      const a = addSchema(doc, createSchema('object', 'A'));
      const b = addSchema(doc, createSchema('object', 'B'));
      a.properties!.set('b', { name: 'b', required: false, schema: ref(b) });
      b.properties!.set('a', { name: 'a', required: false, schema: ref(a) });
      pet.properties!.set('a', { name: 'a', required: false, schema: ref(a) }); // Pet -> A <-> B
      use(doc, get, a);
      const flagged = find(validateDocument(doc), 'CIRCULAR_REFERENCE').map((h) => h.location.nodeId);
      expect(flagged.sort()).toEqual([a.id, b.id].sort());
    });
  });

  describe('message style (DESIGN §11)', () => {
    it('writes every message as a sentence: capitalised, full stop, curly quotes, uppercase methods', () => {
      const doc = createEmptyDocument();
      doc.info = { title: '', version: '' };
      const lower = addSchema(doc, createSchema('object', 'pet'));
      lower.required = ['ghost'];
      addSchema(doc, createSchema('object', 'pet'));
      const status = addSchema(doc, createSchema('enum', 'Status'));
      status.enumValues = ['a', 'a'];
      addSchema(doc, createSchema('enum', 'Empty'));
      addSchema(doc, createSchema('array', 'List'));
      const kind = addSchema(doc, createSchema('oneOf', 'Kind'));
      kind.variants = [ref(status)];
      const kinds = addSchema(doc, createSchema('oneOf', 'Kinds'));
      kinds.variants = [ref(status), ref(kind)];
      addSchema(doc, createSchema('anyOf', 'Nothing'));
      const loop = addSchema(doc, createSchema('object', 'Loop'));
      loop.properties!.set('self', { name: 'self', required: false, schema: ref(loop) });

      const get = createRoute('/pets/{petId}', 'get');
      get.operationId = 'Get-Pet';
      get.parameters = [{ id: 'q', name: 'q', in: 'query', required: false, schema: { kind: 'ref', targetId: 'gone' } }];
      get.responses = new Map([['200', { id: 'r', description: 'ok' }]]);
      doc.routes.set(get.id, get);
      const copy = createRoute('/pets/{petId}', 'get');
      copy.operationId = 'Get-Pet';
      doc.routes.set(copy.id, copy);
      const post = createRoute('/pets', 'post');
      post.responses = new Map();
      doc.routes.set(post.id, post);

      const messages = all(validateDocument(doc)).map((issue) => issue.message);
      expect(new Set(codes(validateDocument(doc))).size).toBeGreaterThanOrEqual(20);
      for (const message of messages) {
        expect(message).toMatch(/^[A-Z“{]/);
        expect(message).toMatch(/\.$/);
        expect(message).not.toMatch(/["']/);
        expect(message).not.toMatch(/\b(get|post|put|patch|delete|options|head) \//);
      }
      expect(messages).toContain('GET /pets/{petId} is defined more than once.');
      expect(messages).toContain('Schema “Kinds” is not used anywhere.');
      expect(messages).toContain('Schema “Loop” has a circular reference.');
    });
  });
});
