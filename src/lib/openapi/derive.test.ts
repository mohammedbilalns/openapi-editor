import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './store';
import {
  UNTAGGED,
  selectCanRedo,
  selectCanUndo,
  selectRouteIds,
  selectRouteIdsByTag,
  selectSchemaIds,
  selectSchemaOptions,
  toRouteSummary,
} from './derive';
import { createEmptyDocument, createRoute, createSchema, type Route, type SchemaNode } from './types';

const store = () => useEditorStore.getState();
const state = () => useEditorStore.getState();

let a: Route;
let b: Route;
let untagged: Route;
let pet: SchemaNode;

beforeEach(() => {
  const doc = createEmptyDocument();
  a = { ...createRoute('/a', 'get'), tags: ['pets', 'admin'] };
  b = { ...createRoute('/b', 'post'), tags: ['pets'] };
  untagged = createRoute('/c', 'delete');
  pet = createSchema('object', 'Pet');
  for (const r of [a, b, untagged]) doc.routes.set(r.id, r);
  doc.schemas.set(pet.id, pet);
  store().initializeDocument(doc);
  useEditorStore.setState({ historyCoalesceMs: 0 });
});

describe('selectors', () => {
  it('id lists keep their identity across edits that do not touch that Map', () => {
    const routeIds = selectRouteIds(state());
    expect(routeIds).toEqual([a.id, b.id, untagged.id]);

    store().updateSchema(pet.id, { description: 'x' });
    expect(selectRouteIds(state())).toBe(routeIds);
    const schemaIds = selectSchemaIds(state());
    store().updateRoute(a.id, { summary: 'x' });
    expect(selectSchemaIds(state())).toBe(schemaIds);

    const extra = createRoute('/d', 'get');
    store().addRoute(extra);
    expect(selectRouteIds(state())).toEqual([a.id, b.id, untagged.id, extra.id]);
  });

  it('route summaries stay equal while the route is unchanged', () => {
    const before = toRouteSummary(state().document.routes.get(b.id)!);
    store().updateRoute(a.id, { summary: 'only a changes' });
    expect(toRouteSummary(state().document.routes.get(b.id)!)).toBe(before);
    store().updateRoute(b.id, { deprecated: true });
    const after = toRouteSummary(state().document.routes.get(b.id)!);
    expect(after).not.toBe(before);
    expect(after).toMatchObject({ id: b.id, method: 'post', path: '/b', deprecated: true });
  });

  it('schema options only change when a schema is added, removed, renamed or retyped', () => {
    const options = selectSchemaOptions(state());
    expect(options).toEqual([{ id: pet.id, name: 'Pet', type: 'object' }]);
    store().updateSchema(pet.id, { description: 'described' });
    store().addFieldToSchema(pet.id, { name: 'n', required: false, schema: { kind: 'ref', targetId: pet.id } });
    expect(selectSchemaOptions(state())).toBe(options);

    store().updateSchema(pet.id, { name: 'Animal' });
    const renamed = selectSchemaOptions(state());
    expect(renamed).toEqual([{ id: pet.id, name: 'Animal', type: 'object' }]);
    store().deleteSchema(pet.id);
    expect(selectSchemaOptions(state())).toEqual([]);
  });

  it('groups route ids by tag in document order, untagged separately', () => {
    const groups = selectRouteIdsByTag(state());
    expect(Object.fromEntries(groups)).toEqual({
      pets: [a.id, b.id],
      admin: [a.id],
      [UNTAGGED]: [untagged.id],
    });
    useEditorStore.setState({ historyCoalesceMs: 500 }); // not a document change
    expect(selectRouteIdsByTag(state())).toBe(groups);
    store().updateRoute(b.id, { tags: ['admin'] });
    expect(selectRouteIdsByTag(state()).get('admin')).toEqual([a.id, b.id]);
  });

  it('undo/redo availability', () => {
    expect([selectCanUndo(state()), selectCanRedo(state())]).toEqual([false, false]);
    store().updateRoute(a.id, { summary: 's' });
    expect([selectCanUndo(state()), selectCanRedo(state())]).toEqual([true, false]);
    store().undo();
    expect([selectCanUndo(state()), selectCanRedo(state())]).toEqual([false, true]);
  });
});
