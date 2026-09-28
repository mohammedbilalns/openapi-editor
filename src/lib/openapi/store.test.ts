import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  // one undo step per action; coalescing has its own tests
  useEditorStore.setState({ historyCoalesceMs: 0 });
});

describe('editor store: document actions', () => {
  it('initializeDocument replaces the document and clears the history', () => {
    store().updateRoute(listPets.id, { summary: 'x' });
    const fresh = fixture();
    store().initializeDocument(fresh);
    expect(doc()).toBe(fresh);
    expect(store().canUndo()).toBe(false);
    expect(store().canRedo()).toBe(false);
  });

  it('setDocument (import) is undoable, initializeDocument (hydrate) is not', () => {
    const before = doc();
    const imported = createEmptyDocument();
    store().setDocument(imported);
    expect(doc()).toBe(imported);
    store().undo();
    expect(doc()).toBe(before);
    store().redo();
    expect(doc()).toBe(imported);
  });

  it('resetDocument replaces the document with an empty one, undoably', () => {
    const before = doc();
    store().resetDocument();
    expect(doc()).not.toBe(before);
    expect(doc().routes.size).toBe(0);
    expect(doc().schemas.size).toBe(0);
    expect(doc().info.title).toBe('New API');
    store().undo();
    expect(doc()).toBe(before);
  });

  it('updateInfo merges into info', () => {
    store().updateInfo({ title: 'Pets' });
    expect(doc().info).toEqual({ title: 'Pets', version: '1.0.0', description: '' });
  });

  it('schema actions add (returning the id), update and delete', () => {
    const tag = createSchema('string', 'Tag');
    expect(store().addSchema(tag)).toBe(tag.id);
    expect(doc().schemas.get(tag.id)?.name).toBe('Tag');

    store().updateSchema(tag.id, { description: 'a tag', format: 'uuid' });
    expect(doc().schemas.get(tag.id)).toMatchObject({ name: 'Tag', description: 'a tag', format: 'uuid' });

    store().deleteSchema(tag.id);
    expect(doc().schemas.has(tag.id)).toBe(false);
    expect(doc().schemas.has(pet.id)).toBe(true); // others untouched
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

  it('route actions add (returning the id), update and delete', () => {
    const r = createRoute('/owners', 'post');
    expect(store().addRoute(r)).toBe(r.id);
    store().updateRoute(r.id, { summary: 'Create owner', tags: ['owners'] });
    expect(doc().routes.get(r.id)).toMatchObject({ path: '/owners', method: 'post', summary: 'Create owner', tags: ['owners'] });
    store().deleteRoute(r.id);
    expect(doc().routes.has(r.id)).toBe(false);
  });

  it('updateRequestBody merges into the existing body and is a no-op without one', () => {
    const before = doc();
    store().updateRequestBody(getPet.id, { description: 'x' });
    expect(doc()).toBe(before);
    store().setRequestBody(getPet.id, { id: 'b', required: false, content: new Map([['application/json', { schema: ref(pet) }]]) });
    const content = doc().routes.get(getPet.id)!.requestBody!.content;
    store().updateRequestBody(getPet.id, { description: 'A pet', required: true });
    expect(doc().routes.get(getPet.id)!.requestBody).toMatchObject({ id: 'b', description: 'A pet', required: true });
    expect(doc().routes.get(getPet.id)!.requestBody!.content).toBe(content);
    store().undo();
    expect(doc().routes.get(getPet.id)!.requestBody!.required).toBe(false);
    expect(doc().routes.get(getPet.id)!.requestBody!.description).toBeUndefined();
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

describe('editor store: tags', () => {
  beforeEach(() => {
    store().updateRoute(listPets.id, { tags: ['pets', 'public'] });
    store().updateRoute(getPet.id, { tags: ['pets'] });
    store().addTag({ name: 'public' });
  });

  it('updateTag renames the tag and every route that uses it, in one undo step', () => {
    const untouched = createRoute('/other', 'get');
    store().addRoute(untouched);
    store().updateTag('pets', { name: 'animals', description: 'All animals' });
    expect(doc().tags).toEqual([{ name: 'animals', description: 'All animals' }, { name: 'public' }]);
    expect(doc().routes.get(listPets.id)!.tags).toEqual(['animals', 'public']);
    expect(doc().routes.get(getPet.id)!.tags).toEqual(['animals']);
    expect(doc().routes.get(untouched.id)).toBe(untouched); // structural sharing
    store().undo();
    expect(doc().tags.map((t) => t.name)).toEqual(['pets', 'public']);
    expect(doc().routes.get(listPets.id)!.tags).toEqual(['pets', 'public']);
  });

  it('updateTag changes only the description when the name is unchanged', () => {
    const routes = doc().routes;
    store().updateTag('pets', { name: 'pets', description: 'Pets' });
    expect(doc().tags[0]).toEqual({ name: 'pets', description: 'Pets' });
    expect(doc().routes).toBe(routes);
  });

  it('updateTag refuses empty names, existing names, unknown tags and no-op updates', () => {
    const before = doc();
    store().updateTag('pets', { name: '' });
    store().updateTag('pets', { name: 'public' });
    store().updateTag('nope', { name: 'x' });
    store().updateTag('pets', { description: undefined });
    expect(doc()).toBe(before);
  });

  it('renaming a tag onto an undefined tag a route already has does not duplicate it', () => {
    // 'stray' is used by the route but has no definition, so the rename is allowed.
    store().updateRoute(getPet.id, { tags: ['legacy', 'pets', 'stray'] });
    store().addTag({ name: 'legacy' });
    store().updateTag('legacy', { name: 'stray' });
    expect(doc().routes.get(getPet.id)!.tags).toEqual(['pets', 'stray']);
    expect(doc().tags.map((t) => t.name)).toEqual(['pets', 'public', 'stray']);
  });

  it('typing a rename coalesces into one undo step and follows the new name', () => {
    useEditorStore.setState({ historyCoalesceMs: 1000 });
    const before = doc();
    store().updateTag('pets', { name: 'p' });
    store().updateTag('p', { name: 'pe' });
    store().updateTag('pe', { name: 'pet' });
    expect(doc().routes.get(getPet.id)!.tags).toEqual(['pet']);
    store().undo();
    expect(doc()).toBe(before);
  });

  it('deleteTag strips the tag from routes, even when it was never defined', () => {
    store().deleteTag('pets');
    expect(doc().tags.map((t) => t.name)).toEqual(['public']);
    expect(doc().routes.get(listPets.id)!.tags).toEqual(['public']);
    expect(doc().routes.get(getPet.id)!.tags).toEqual([]);
    store().updateRoute(getPet.id, { tags: ['stray'] });
    store().deleteTag('stray');
    expect(doc().routes.get(getPet.id)!.tags).toEqual([]);
    const before = doc();
    store().deleteTag('nothing');
    expect(doc()).toBe(before);
  });
});

describe('editor store: deleting a security scheme', () => {
  it('removes requirements on it from the document and routes', () => {
    store().addSecurityScheme({ id: 'bearer', name: 'bearer', type: 'http', scheme: 'bearer' });
    store().addSecurityScheme({ id: 'key', name: 'key', type: 'apiKey', in: 'header', paramName: 'X-Key' });
    useEditorStore.setState((s) => ({
      document: { ...s.document, security: [{ schemeId: 'bearer', scopes: [] }, { schemeId: 'key', scopes: [] }] },
    }));
    store().updateRoute(listPets.id, { security: [{ schemeId: 'bearer', scopes: [] }] });
    store().updateRoute(getPet.id, { security: [{ schemeId: 'key', scopes: [] }, { schemeId: 'bearer', scopes: [] }] });

    store().deleteSecurityScheme('bearer');
    expect(doc().security).toEqual([{ schemeId: 'key', scopes: [] }]);
    // the only requirement is gone: inherit again rather than become public ([])
    expect(doc().routes.get(listPets.id)!.security).toBeUndefined();
    expect(doc().routes.get(getPet.id)!.security).toEqual([{ schemeId: 'key', scopes: [] }]);

    store().undo();
    expect(doc().routes.get(listPets.id)!.security).toEqual([{ schemeId: 'bearer', scopes: [] }]);
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

  it('redo returns to the most recent state after undo', () => {
    store().updateRoute(listPets.id, { summary: 'one' });
    store().updateRoute(listPets.id, { summary: 'two' });
    store().undo();
    expect(summary()).toBe('one');
    expect(store().canRedo()).toBe(true);
    store().redo();
    expect(summary()).toBe('two');
    expect(store().canRedo()).toBe(false);
    // and the whole chain can be replayed, one step at a time
    store().undo();
    store().undo();
    expect(summary()).toBe('List');
    store().redo();
    expect(summary()).toBe('one');
    store().redo();
    expect(summary()).toBe('two');
    store().redo(); // no-op at the end
    expect(summary()).toBe('two');
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

  it('counts references nested inside inline schemas (e.g. arrays of refs)', () => {
    const arrayOfOwners = createSchema('array');
    arrayOfOwners.items = ref(owner);
    store().addResponse(getPet.id, '200', {
      id: 'x',
      description: 'owners',
      content: new Map([['application/json', { schema: { kind: 'inline', schema: arrayOfOwners } }]]),
      headers: new Map([['X-Owner', { id: 'h', name: 'X-Owner', in: 'header', required: false, schema: ref(owner) }]]),
    });
    const wrapper = createSchema('object');
    wrapper.properties!.set('primary', { name: 'primary', required: false, schema: ref(owner) });
    store().addFieldToSchema(pet.id, { name: 'contact', required: false, schema: { kind: 'inline', schema: wrapper } });

    // Pet.owner + response items + response header + Pet.contact.primary
    expect(store().getSchemaUsageCount(owner.id)).toBe(4);
  });

  it('reflects deletions', () => {
    store().deleteRoute(listPets.id);
    expect(store().getSchemaUsageCount(pet.id)).toBe(0);
  });
});

describe('editor store: structural sharing', () => {
  it('an edit copies only the touched node and its Map; everything else keeps identity', () => {
    const prev = doc();
    store().updateRoute(listPets.id, { summary: 'changed' });
    const next = doc();
    expect(next.routes).not.toBe(prev.routes);
    expect(next.routes.get(listPets.id)).not.toBe(prev.routes.get(listPets.id));
    expect(next.routes.get(getPet.id)).toBe(prev.routes.get(getPet.id));
    expect(next.schemas).toBe(prev.schemas);
    expect(next.info).toBe(prev.info);
    expect(next.securitySchemes).toBe(prev.securitySchemes);
    // the untouched parts of the edited route are shared too
    expect(next.routes.get(listPets.id)!.responses).toBe(prev.routes.get(listPets.id)!.responses);
  });

  it('history snapshots share untouched nodes with the current document', () => {
    store().updateField(pet.id, 'age', { description: 'years' });
    const [before, after] = store().history;
    expect(after.schemas.get(owner.id)).toBe(before.schemas.get(owner.id));
    expect(after.routes).toBe(before.routes);
    expect(after.schemas.get(pet.id)!.properties!.get('name')).toBe(before.schemas.get(pet.id)!.properties!.get('name'));
    expect(before.schemas.get(pet.id)!.properties!.get('age')!.description).toBeUndefined();
  });

  it('no-op actions create no history entry and keep the document', () => {
    const prev = doc();
    store().addTag({ name: 'pets' });
    store().deleteTag('unknown');
    store().deleteRoute('unknown');
    store().deleteSchema('unknown');
    store().deleteField(pet.id, 'unknown');
    store().updateResponse(listPets.id, '999', { description: 'x' });
    store().updateServer(7, { url: 'x' });
    expect(doc()).toBe(prev);
    expect(store().canUndo()).toBe(false);
  });
});

describe('editor store: history coalescing', () => {
  const summary = () => doc().routes.get(listPets.id)!.summary;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    useEditorStore.setState({ historyCoalesceMs: 1000 });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const type = (text: string, at: number) => {
    vi.setSystemTime(at);
    store().updateRoute(listPets.id, { summary: text });
  };
  /** Undoes everything, returning how many undo steps there were. */
  const undoSteps = () => {
    let steps = 0;
    while (store().canUndo()) {
      store().undo();
      steps++;
    }
    return steps;
  };

  it('merges keystrokes on the same field into one undo step', () => {
    type('L', 0);
    type('Li', 200);
    type('Lis', 400);
    type('List all', 1300); // < 1s after the previous keystroke
    store().undo();
    expect(summary()).toBe('List');
    expect(store().canUndo()).toBe(false);
    store().redo();
    expect(summary()).toBe('List all');
  });

  it('starts a new step after a pause, on another field and on sealHistory', () => {
    const description = () => doc().routes.get(listPets.id)!.description;
    type('a', 0);
    type('ab', 2500); // pause
    vi.setSystemTime(2600);
    store().updateRoute(listPets.id, { description: 'd' }); // other field
    vi.setSystemTime(2700);
    store().updateRoute(listPets.id, { description: 'de' });
    store().sealHistory(); // e.g. on blur
    vi.setSystemTime(2800);
    store().updateRoute(listPets.id, { description: 'def' });

    store().undo();
    expect(description()).toBe('de');
    store().undo();
    expect([summary(), description()]).toEqual(['ab', undefined]);
    store().undo();
    expect(summary()).toBe('a');
    store().undo();
    expect(summary()).toBe('List');
    expect(store().canUndo()).toBe(false);
  });

  it('starts a new step after undo and redo, even within the coalescing window', () => {
    type('a', 0);
    type('ab', 100);
    store().undo();
    store().redo();
    type('abc', 200);
    store().undo();
    expect(summary()).toBe('ab');
  });

  it('never merges structural edits', () => {
    for (let i = 0; i < 3; i++) {
      vi.setSystemTime(i * 10);
      store().addParameter(getPet.id, { id: `p${i}`, name: `p${i}`, in: 'query', required: false, schema: str() });
    }
    vi.setSystemTime(40);
    store().updateField(pet.id, 'age', { required: true });
    vi.setSystemTime(50);
    store().updateField(pet.id, 'age', { required: false });
    expect(undoSteps()).toBe(5);
  });

  it('keeps merging while a field is renamed keystroke by keystroke', () => {
    const names = ['age', 'ag', 'a', 'ab', 'abc'];
    for (let i = 1; i < names.length; i++) {
      vi.setSystemTime(i * 100);
      store().updateField(pet.id, names[i - 1], { name: names[i] });
    }
    expect(Array.from(doc().schemas.get(pet.id)!.properties!.keys())).toEqual(['name', 'abc', 'owner']);
    store().undo();
    expect(Array.from(doc().schemas.get(pet.id)!.properties!.keys())).toEqual(['name', 'age', 'owner']);
    expect(store().canUndo()).toBe(false);
  });
});

describe('editor store: bookkeeping', () => {
  it('undo/redo across an add and an import restore exactly the earlier documents', () => {
    const start = doc();
    const r = createRoute('/new', 'get');
    store().addRoute(r);
    const added = doc();
    store().setDocument(createEmptyDocument());
    store().undo();
    expect(doc()).toBe(added);
    store().undo();
    expect(doc()).toBe(start);
    store().redo();
    expect(doc()).toBe(added);
  });

  it('memoizes usage counts per document version', () => {
    const first = store().getSchemaUsageCounts();
    expect(store().getSchemaUsageCounts()).toBe(first);
    expect(first.get(pet.id)).toBe(1);
    store().deleteRoute(listPets.id);
    const second = store().getSchemaUsageCounts();
    expect(second).not.toBe(first);
    expect(second.get(pet.id)).toBeUndefined();
    expect(store().getSchemaUsageCount(pet.id)).toBe(0);
  });
});
