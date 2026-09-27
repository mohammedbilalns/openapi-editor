import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './store';
import {
  createEmptyDocument,
  createRoute,
  createSchema,
  type ApiDocument,
  type Route,
  type SchemaNode,
  type SchemaOrRef,
} from './types';

const store = () => useEditorStore.getState();
const doc = () => store().document;
const ref = (s: SchemaNode): SchemaOrRef => ({ kind: 'ref', targetId: s.id });
const str = (): SchemaOrRef => ({ kind: 'inline', schema: createSchema('string') });

let pet: SchemaNode;
let owner: SchemaNode;
let listPets: Route;
let getPet: Route;

function fixture(): ApiDocument {
  const d = createEmptyDocument();
  owner = createSchema('object', 'Owner');
  owner.properties!.set('email', { name: 'email', required: true, schema: str() });
  owner.required = ['email'];
  pet = createSchema('object', 'Pet');
  pet.properties!.set('name', { name: 'name', required: true, schema: str() });
  pet.properties!.set('age', { name: 'age', required: false, schema: str() });
  pet.properties!.set('owner', { name: 'owner', required: false, schema: ref(owner) });
  pet.required = ['name'];
  d.schemas.set(owner.id, owner);
  d.schemas.set(pet.id, pet);

  listPets = createRoute('/pets', 'get');
  listPets.summary = 'List';
  listPets.responses.set('200', {
    id: 'r200',
    description: 'ok',
    content: new Map([['application/json', { schema: ref(pet) }]]),
  });
  getPet = createRoute('/pets/{id}', 'get');
  getPet.parameters = [{ id: 'p-id', name: 'id', in: 'path', required: true, schema: str() }];
  d.routes.set(listPets.id, listPets);
  d.routes.set(getPet.id, getPet);
  d.servers = [{ url: 'https://a.example.com' }];
  d.tags = [{ name: 'pets' }];
  return d;
}

beforeEach(() => {
  store().initializeDocument(fixture());
  useEditorStore.setState({ activeTab: 'routes', yamlPreviewOpen: false });
});

describe('editor store: document actions', () => {
  it('initializeDocument resets history, version and selection', () => {
    store().selectRoute(listPets.id);
    store().updateRoute(listPets.id, { summary: 'x' });
    const fresh = fixture();
    store().initializeDocument(fresh);
    expect(doc()).toBe(fresh);
    expect(store().canUndo()).toBe(false);
    expect(store().canRedo()).toBe(false);
    expect(store().documentVersion).toBe(0);
    expect(store().selectedRouteId).toBeNull();
  });

  it('updateInfo merges into info', () => {
    store().updateInfo({ title: 'Pets' });
    expect(doc().info).toEqual({ title: 'Pets', version: '1.0.0', description: '' });
  });

  it('schema actions add, update, delete and maintain selection', () => {
    const tag = createSchema('string', 'Tag');
    store().addSchema(tag);
    expect(doc().schemas.get(tag.id)?.name).toBe('Tag');
    expect(store().selectedSchemaId).toBe(tag.id);

    store().updateSchema(tag.id, { description: 'a tag', format: 'uuid' });
    expect(doc().schemas.get(tag.id)).toMatchObject({ name: 'Tag', description: 'a tag', format: 'uuid' });

    store().selectSchema(pet.id);
    store().deleteSchema(tag.id);
    expect(doc().schemas.has(tag.id)).toBe(false);
    expect(store().selectedSchemaId).toBe(pet.id); // other selection untouched
    store().deleteSchema(pet.id);
    expect(store().selectedSchemaId).toBeNull();
  });

  it('updateSchema on an unknown id is a no-op (no history entry)', () => {
    const before = doc();
    store().updateSchema('nope', { description: 'x' });
    expect(doc()).toBe(before);
    expect(store().canUndo()).toBe(false);
  });

  it('field actions keep properties and required in sync', () => {
    store().addFieldToSchema(pet.id, { name: 'chip', required: true, schema: str() });
    let p = doc().schemas.get(pet.id)!;
    expect(Array.from(p.properties!.keys())).toEqual(['name', 'age', 'owner', 'chip']);
    expect(p.required).toEqual(['name', 'chip']);

    store().updateField(pet.id, 'age', { required: true, description: 'years' });
    p = doc().schemas.get(pet.id)!;
    expect(p.properties!.get('age')).toMatchObject({ required: true, description: 'years' });
    expect(p.required).toEqual(['name', 'chip', 'age']);

    store().updateField(pet.id, 'name', { required: false });
    expect(doc().schemas.get(pet.id)!.required).toEqual(['chip', 'age']);

    store().updateField(pet.id, 'chip', { name: 'microchip' });
    p = doc().schemas.get(pet.id)!;
    expect(p.properties!.has('chip')).toBe(false);
    expect(p.properties!.get('microchip')?.name).toBe('microchip');
    expect(p.required).toEqual(['microchip', 'age']);

    store().deleteField(pet.id, 'age');
    p = doc().schemas.get(pet.id)!;
    expect(p.properties!.has('age')).toBe(false);
    expect(p.required).toEqual(['microchip']);
  });

  it('renaming a field keeps its position in the property order', () => {
    store().updateField(pet.id, 'name', { name: 'title' });
    expect(Array.from(doc().schemas.get(pet.id)!.properties!.keys())).toEqual(['title', 'age', 'owner']);
    expect(doc().schemas.get(pet.id)!.required).toEqual(['title']);
  });

  it('refuses to rename a field onto another existing field (no silent data loss)', () => {
    const before = doc();
    store().updateField(pet.id, 'age', { name: 'owner' });
    expect(doc()).toBe(before);
    const props = doc().schemas.get(pet.id)!.properties!;
    expect(props.get('owner')!.schema).toEqual(ref(owner));
    expect(props.has('age')).toBe(true);
  });

  it('addFieldToSchema ignores non-object schemas', () => {
    const e = createSchema('enum', 'E');
    store().addSchema(e);
    const before = doc();
    store().addFieldToSchema(e.id, { name: 'x', required: false, schema: str() });
    expect(doc()).toBe(before);
  });

  it('route actions add, update, delete and maintain selection', () => {
    const r = createRoute('/owners', 'post');
    store().addRoute(r);
    expect(store().selectedRouteId).toBe(r.id);
    store().updateRoute(r.id, { summary: 'Create owner', tags: ['owners'] });
    expect(doc().routes.get(r.id)).toMatchObject({ path: '/owners', method: 'post', summary: 'Create owner', tags: ['owners'] });
    store().deleteRoute(r.id);
    expect(doc().routes.has(r.id)).toBe(false);
    expect(store().selectedRouteId).toBeNull();
  });

  it('parameter, request body and response actions', () => {
    store().addParameter(getPet.id, { id: 'q', name: 'expand', in: 'query', required: false, schema: str() });
    expect(doc().routes.get(getPet.id)!.parameters.map((p) => p.name)).toEqual(['id', 'expand']);
    store().updateParameter(getPet.id, 'q', { required: true });
    expect(doc().routes.get(getPet.id)!.parameters[1].required).toBe(true);
    store().deleteParameter(getPet.id, 'p-id');
    expect(doc().routes.get(getPet.id)!.parameters.map((p) => p.id)).toEqual(['q']);

    store().setRequestBody(getPet.id, { id: 'b', required: true, content: new Map([['application/json', { schema: ref(pet) }]]) });
    expect(doc().routes.get(getPet.id)!.requestBody?.required).toBe(true);
    store().setRequestBody(getPet.id, undefined);
    expect(doc().routes.get(getPet.id)!.requestBody).toBeUndefined();

    store().addResponse(getPet.id, '404', { id: 'nf', description: 'Not found' });
    store().updateResponse(getPet.id, '404', { description: 'No such pet' });
    expect(doc().routes.get(getPet.id)!.responses.get('404')?.description).toBe('No such pet');
    store().deleteResponse(getPet.id, '200');
    expect(Array.from(doc().routes.get(getPet.id)!.responses.keys())).toEqual(['404']);
  });

  it('server, security scheme and tag actions', () => {
    store().addServer({ url: 'https://b.example.com' });
    store().updateServer(0, { url: 'https://a2.example.com', description: 'A' });
    expect(doc().servers).toEqual([{ url: 'https://a2.example.com', description: 'A' }, { url: 'https://b.example.com' }]);
    store().deleteServer(0);
    expect(doc().servers.map((s) => s.url)).toEqual(['https://b.example.com']);

    store().addSecurityScheme({ id: 's1', name: 'bearer', type: 'http', scheme: 'bearer' });
    store().updateSecurityScheme('s1', { bearerFormat: 'JWT' });
    expect(doc().securitySchemes.get('s1')).toMatchObject({ scheme: 'bearer', bearerFormat: 'JWT' });
    store().deleteSecurityScheme('s1');
    expect(doc().securitySchemes.size).toBe(0);

    store().addTag({ name: 'owners' });
    store().addTag({ name: 'owners', description: 'dup' });
    expect(doc().tags.map((t) => t.name)).toEqual(['pets', 'owners']);
    store().deleteTag('pets');
    expect(doc().tags.map((t) => t.name)).toEqual(['owners']);
  });
});

describe('editor store: selection and UI state', () => {
  it('selection and tabs do not touch history or documentVersion', () => {
    const v = store().documentVersion;
    store().selectRoute(getPet.id);
    store().selectSchema(pet.id);
    store().setActiveTab('schemas');
    store().setYamlPreviewOpen(true);
    expect(store()).toMatchObject({ selectedRouteId: getPet.id, selectedSchemaId: pet.id, activeTab: 'schemas', yamlPreviewOpen: true });
    expect(store().documentVersion).toBe(v);
    expect(store().canUndo()).toBe(false);
  });

  it('every document edit bumps documentVersion', () => {
    const v = store().documentVersion;
    store().updateRoute(listPets.id, { summary: 'a' });
    store().updateInfo({ title: 'b' });
    expect(store().documentVersion).toBe(v + 2);
    store().undo();
    expect(store().documentVersion).toBe(v + 3);
  });
});

describe('editor store: undo / redo', () => {
  const summary = () => doc().routes.get(listPets.id)!.summary;

  it('undo walks back through edits', () => {
    expect(store().canUndo()).toBe(false);
    store().updateRoute(listPets.id, { summary: 'one' });
    store().updateRoute(listPets.id, { summary: 'two' });
    store().updateRoute(listPets.id, { summary: 'three' });
    expect(store().canUndo()).toBe(true);
    store().undo();
    expect(summary()).toBe('two');
    store().undo();
    expect(summary()).toBe('one');
    store().undo();
    expect(summary()).toBe('List');
    expect(store().canUndo()).toBe(false);
    store().undo(); // no-op at the beginning
    expect(summary()).toBe('List');
  });

  it('redo re-applies an undone edit', () => {
    store().updateRoute(listPets.id, { summary: 'one' });
    store().updateRoute(listPets.id, { summary: 'two' });
    store().undo();
    store().undo();
    expect(summary()).toBe('List');
    store().redo();
    expect(summary()).toBe('one');
  });

  it('redo returns to the most recent state after undo', () => {
    store().updateRoute(listPets.id, { summary: 'one' });
    store().updateRoute(listPets.id, { summary: 'two' });
    store().undo();
    expect(summary()).toBe('one');
    expect(store().canRedo()).toBe(true);
    store().redo();
    expect(summary()).toBe('two');
    expect(store().canRedo()).toBe(false);
    // and the whole chain can be replayed
    store().undo();
    store().undo();
    store().redo();
    store().redo();
    expect(summary()).toBe('two');
  });

  it('canRedo is false whenever redo would do nothing', () => {
    expect(store().canRedo()).toBe(false);
    store().updateRoute(listPets.id, { summary: 'one' });
    expect(store().canRedo()).toBe(false);
    store().undo();
    expect(store().canRedo()).toBe(true);
  });

  it('a new edit after undo discards the redo branch', () => {
    store().updateRoute(listPets.id, { summary: 'one' });
    store().updateRoute(listPets.id, { summary: 'two' });
    store().undo();
    store().undo();
    store().updateRoute(listPets.id, { summary: 'branch' });
    expect(store().canRedo()).toBe(false);
    store().redo();
    expect(summary()).toBe('branch');
    store().undo();
    expect(summary()).toBe('List');
  });

  it('keeps at most maxHistorySize undo steps, for every kind of edit', () => {
    useEditorStore.setState({ maxHistorySize: 3 });
    try {
      for (let i = 1; i <= 10; i++) store().updateRoute(listPets.id, { summary: `s${i}` });
      store().addTag({ name: 'extra' });
      expect(store().history.length).toBeLessThanOrEqual(4);
      let undos = 0;
      while (store().canUndo()) {
        store().undo();
        undos++;
      }
      expect(undos).toBe(3);
      expect(summary()).toBe('s8');
      expect(doc().tags.map((t) => t.name)).toEqual(['pets']);
    } finally {
      useEditorStore.setState({ maxHistorySize: 50 });
    }
  });

  it('undo of an import restores the previous document', () => {
    const before = doc();
    const imported = createEmptyDocument();
    store().setDocument(imported);
    expect(doc()).toBe(imported);
    store().undo();
    expect(doc().routes.get(listPets.id)?.summary).toBe(before.routes.get(listPets.id)?.summary);
  });
});

describe('editor store: history snapshots are never mutated by later edits', () => {
  // Structural sharing between snapshots is only safe if every action copies
  // what it changes. Snapshot the whole document deeply before each action and
  // check the previous document object is still identical afterwards.
  const actions: [string, () => void][] = [
    ['updateInfo', () => store().updateInfo({ title: 'T2' })],
    ['addSchema', () => store().addSchema(createSchema('string', 'New'))],
    ['updateSchema', () => store().updateSchema(pet.id, { description: 'd', required: ['name', 'age'] })],
    ['deleteSchema', () => store().deleteSchema(owner.id)],
    ['addFieldToSchema', () => store().addFieldToSchema(pet.id, { name: 'x', required: true, schema: str() })],
    ['updateField', () => store().updateField(pet.id, 'age', { required: true, description: 'd' })],
    ['updateField (rename)', () => store().updateField(pet.id, 'name', { name: 'title' })],
    ['deleteField', () => store().deleteField(pet.id, 'name')],
    ['addRoute', () => store().addRoute(createRoute('/x', 'put'))],
    ['updateRoute', () => store().updateRoute(listPets.id, { summary: 's', tags: ['t'] })],
    ['deleteRoute', () => store().deleteRoute(listPets.id)],
    ['addParameter', () => store().addParameter(getPet.id, { id: 'n', name: 'n', in: 'query', required: false, schema: str() })],
    ['updateParameter', () => store().updateParameter(getPet.id, 'p-id', { description: 'd' })],
    ['deleteParameter', () => store().deleteParameter(getPet.id, 'p-id')],
    ['setRequestBody', () => store().setRequestBody(listPets.id, { id: 'b', required: false, content: new Map() })],
    ['addResponse', () => store().addResponse(listPets.id, '500', { id: 'e', description: 'e' })],
    ['updateResponse', () => store().updateResponse(listPets.id, '200', { description: 'changed' })],
    ['deleteResponse', () => store().deleteResponse(listPets.id, '200')],
    ['addServer', () => store().addServer({ url: 'https://c.example.com' })],
    ['updateServer', () => store().updateServer(0, { url: 'https://z.example.com' })],
    ['deleteServer', () => store().deleteServer(0)],
    ['addSecurityScheme', () => store().addSecurityScheme({ id: 's', name: 's', type: 'http' })],
    ['addTag', () => store().addTag({ name: 'new' })],
    ['deleteTag', () => store().deleteTag('pets')],
  ];

  it.each(actions)('%s leaves the previous document untouched and undo restores it', (_, act) => {
    store().updateInfo({ description: 'baseline' }); // make sure there is a snapshot to protect
    const prev = doc();
    const frozenCopy = structuredClone(prev);
    act();
    expect(doc()).not.toBe(prev);
    expect(prev).toEqual(frozenCopy);
    store().undo();
    expect(doc()).toEqual(frozenCopy);
  });
});

describe('editor store: getSchemaUsageCount', () => {
  it('counts direct references from routes and other schemas, not self references', () => {
    // Owner: referenced by Pet.owner
    expect(store().getSchemaUsageCount(owner.id)).toBe(1);
    // Pet: referenced by GET /pets 200 body
    expect(store().getSchemaUsageCount(pet.id)).toBe(1);

    store().addParameter(getPet.id, { id: 'o', name: 'o', in: 'query', required: false, schema: ref(owner) });
    store().setRequestBody(getPet.id, { id: 'b', required: true, content: new Map([['application/json', { schema: ref(owner) }]]) });
    const list = createSchema('array', 'Owners');
    list.items = ref(owner);
    store().addSchema(list);
    const union = createSchema('oneOf', 'OwnerOrPet');
    union.variants = [ref(owner), ref(pet)];
    store().addSchema(union);
    store().addFieldToSchema(owner.id, { name: 'self', required: false, schema: ref(owner) });

    expect(store().getSchemaUsageCount(owner.id)).toBe(5);
    expect(store().getSchemaUsageCount(pet.id)).toBe(2);
    expect(store().getSchemaUsageCount(union.id)).toBe(0);
  });

  it('reflects deletions', () => {
    store().deleteRoute(listPets.id);
    expect(store().getSchemaUsageCount(pet.id)).toBe(0);
  });
});
