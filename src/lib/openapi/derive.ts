// Pure, memoized derivations over EditorState. Framework-agnostic: usable with
// `useEditorStore(selector)`, `useEditorStore.subscribe`, or in tests.
//
// They rely on the store's structural sharing (see store.ts): a Map or node
// keeps its identity until something inside it changes, so results can be
// cached per Map/node object and returned by reference when nothing changed.
import type { EditorState } from './store';
import type { HttpMethod, NodeId, Route, SchemaNode, SchemaType } from './types';
import { getSchemaUsageCounts } from './refs';

const keysCache = new WeakMap<Map<NodeId, unknown>, NodeId[]>();
function keysOf(map: Map<NodeId, unknown>): NodeId[] {
  let keys = keysCache.get(map);
  if (!keys) {
    keys = Array.from(map.keys());
    keysCache.set(map, keys);
  }
  return keys;
}

/** Route ids in document order. Same array while `document.routes` is unchanged; combine with useShallow. */
export const selectRouteIds = (s: EditorState): NodeId[] => keysOf(s.document.routes);

/** Schema ids in document order. Same array while `document.schemas` is unchanged; combine with useShallow. */
export const selectSchemaIds = (s: EditorState): NodeId[] => keysOf(s.document.schemas);

export const selectCanUndo = (s: EditorState): boolean => s.historyIndex > 0;
export const selectCanRedo = (s: EditorState): boolean => s.historyIndex < s.history.length - 1;

export const selectSchemaUsageCounts = (s: EditorState): ReadonlyMap<NodeId, number> => getSchemaUsageCounts(s.document);

// ---------------------------------------------------------------------------
// Row models for long lists: small, primitive-valued objects that stay
// referentially equal while the underlying node is unchanged, so memoized
// rows (React.memo) skip re-rendering.
// ---------------------------------------------------------------------------

export interface RouteSummary {
  id: NodeId;
  method: HttpMethod;
  path: string;
  summary?: string;
  operationId?: string;
  tags: string[];
  deprecated: boolean;
}

const routeSummaryCache = new WeakMap<Route, RouteSummary>();
export function toRouteSummary(route: Route): RouteSummary {
  let summary = routeSummaryCache.get(route);
  if (!summary) {
    summary = {
      id: route.id,
      method: route.method,
      path: route.path,
      summary: route.summary,
      operationId: route.operationId,
      tags: route.tags,
      deprecated: route.deprecated === true,
    };
    routeSummaryCache.set(route, summary);
  }
  return summary;
}

export interface SchemaSummary {
  id: NodeId;
  name: string;
  type: SchemaType;
  description?: string;
}

const schemaSummaryCache = new WeakMap<SchemaNode, SchemaSummary>();
export function toSchemaSummary(schema: SchemaNode): SchemaSummary {
  let summary = schemaSummaryCache.get(schema);
  if (!summary) {
    summary = { id: schema.id, name: schema.name ?? '', type: schema.type, description: schema.description };
    schemaSummaryCache.set(schema, summary);
  }
  return summary;
}

/**
 * `{ id, name, type }` of every schema, for pickers/comboboxes. Returns the
 * previous array when no schema was added, removed, renamed or retyped, so
 * editing a description or a field does not re-render every picker.
 */
export interface SchemaOption {
  id: NodeId;
  name: string;
  type: SchemaType;
}

let lastSchemaOptions: { map: Map<NodeId, SchemaNode>; options: SchemaOption[] } | null = null;
export function selectSchemaOptions(s: EditorState): SchemaOption[] {
  const map = s.document.schemas;
  if (lastSchemaOptions?.map === map) return lastSchemaOptions.options;
  const prev = lastSchemaOptions?.options;
  let same = prev !== undefined && prev.length === map.size;
  const options: SchemaOption[] = [];
  let i = 0;
  for (const schema of map.values()) {
    const name = schema.name ?? '';
    if (same && (prev![i].id !== schema.id || prev![i].name !== name || prev![i].type !== schema.type)) same = false;
    options.push({ id: schema.id, name, type: schema.type });
    i++;
  }
  const result = same ? prev! : options;
  lastSchemaOptions = { map, options: result };
  return result;
}

/** Tag name used for routes without tags in selectRouteIdsByTag. */
export const UNTAGGED = '';

const byTagCache = new WeakMap<Map<NodeId, Route>, Map<string, NodeId[]>>();
/**
 * Route ids grouped by tag (a route appears under each of its tags; untagged
 * routes under UNTAGGED), in document order. O(routes) once per routes Map.
 */
export function selectRouteIdsByTag(s: EditorState): Map<string, NodeId[]> {
  const routes = s.document.routes;
  let groups = byTagCache.get(routes);
  if (!groups) {
    groups = new Map();
    for (const route of routes.values()) {
      const tags = route.tags.length > 0 ? new Set(route.tags) : [UNTAGGED];
      for (const tag of tags) {
        let list = groups.get(tag);
        if (!list) groups.set(tag, (list = []));
        list.push(route.id);
      }
    }
    byTagCache.set(routes, groups);
  }
  return groups;
}
