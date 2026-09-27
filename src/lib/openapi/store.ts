import { create } from 'zustand';
import {
  ApiDocument,
  SchemaNode,
  Route,
  Command,
  CommandType,
  PropertyDef,
  ParameterDef,
  ResponseDef,
  RequestBody,
  SecurityRequirement,
  SecurityScheme,
  Server,
  Tag,
  InfoObject,
  NodeId,
  createEmptyDocument,
} from './types';
import { getSchemaUsageCounts } from './refs';

export type TabType = 'routes' | 'schemas' | 'settings';

/*
 * Immutability contract
 * ---------------------
 * Documents in this store are never mutated. Every action builds a new
 * ApiDocument that shares every untouched node with the previous one
 * (structural sharing): editing one route copies that route, the `routes` Map
 * and the document object, nothing else. Consequences:
 *  - history snapshots are just references to earlier documents, so an edit
 *    costs O(entries in the one Map it touches) time and memory instead of a
 *    deep copy of the whole document;
 *  - unchanged routes/schemas keep their identity, so selectors such as
 *    `s => s.document.routes.get(id)` only re-render what actually changed;
 *  - callers must not mutate objects they read from the store (or objects
 *    after passing them in); build new ones instead.
 */

export interface EditorState {
  // Document state
  document: ApiDocument;

  // Version counter for tracking changes (used by YAML preview)
  documentVersion: number;

  // Selection state
  selectedSchemaId: NodeId | null;
  selectedRouteId: NodeId | null;

  // History for undo/redo: every document state, history[historyIndex] === document
  history: ApiDocument[];
  historyIndex: number;
  maxHistorySize: number;
  /**
   * Consecutive edits of the same text field (same target, same keys) closer
   * than this many ms are merged into one undo step. 0 disables merging.
   */
  historyCoalesceMs: number;

  // Command log (most recent entries only)
  commandLog: Command[];

  // UI state
  activeTab: TabType;
  yamlPreviewOpen: boolean;

  // Actions - Document
  setDocument: (doc: ApiDocument) => void;
  updateInfo: (info: Partial<InfoObject>) => void;

  // Actions - Schemas
  addSchema: (schema: SchemaNode) => void;
  updateSchema: (id: NodeId, updates: Partial<SchemaNode>) => void;
  deleteSchema: (id: NodeId) => void;
  addFieldToSchema: (schemaId: NodeId, field: PropertyDef) => void;
  updateField: (schemaId: NodeId, fieldName: string, updates: Partial<PropertyDef>) => void;
  deleteField: (schemaId: NodeId, fieldName: string) => void;

  // Actions - Routes
  addRoute: (route: Route) => void;
  updateRoute: (id: NodeId, updates: Partial<Route>) => void;
  deleteRoute: (id: NodeId) => void;
  addParameter: (routeId: NodeId, param: ParameterDef) => void;
  updateParameter: (routeId: NodeId, paramId: NodeId, updates: Partial<ParameterDef>) => void;
  deleteParameter: (routeId: NodeId, paramId: NodeId) => void;
  setRequestBody: (routeId: NodeId, body: RequestBody | undefined) => void;
  addResponse: (routeId: NodeId, statusCode: string, response: ResponseDef) => void;
  updateResponse: (routeId: NodeId, statusCode: string, updates: Partial<ResponseDef>) => void;
  deleteResponse: (routeId: NodeId, statusCode: string) => void;

  // Actions - Servers
  addServer: (server: Server) => void;
  updateServer: (index: number, server: Server) => void;
  deleteServer: (index: number) => void;

  // Actions - Security
  addSecurityScheme: (scheme: SecurityScheme) => void;
  updateSecurityScheme: (id: NodeId, updates: Partial<SecurityScheme>) => void;
  deleteSecurityScheme: (id: NodeId) => void;

  // Actions - Tags
  addTag: (tag: Tag) => void;
  deleteTag: (name: string) => void;

  // Actions - Selection
  selectSchema: (id: NodeId | null) => void;
  selectRoute: (id: NodeId | null) => void;
  setActiveTab: (tab: TabType) => void;
  setYamlPreviewOpen: (open: boolean) => void;

  // Actions - History
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  /** End the current typing burst: the next edit starts a new undo step (call on blur). */
  sealHistory: () => void;

  // Helpers
  getSchemaById: (id: NodeId) => SchemaNode | undefined;
  getRouteById: (id: NodeId) => Route | undefined;
  getSchemaUsageCount: (id: NodeId) => number;
  /** Usage count of every referenced schema, computed once per document version. */
  getSchemaUsageCounts: () => ReadonlyMap<NodeId, number>;

  // Persistence - Initialize document without adding to history (for loading from storage)
  initializeDocument: (doc: ApiDocument) => void;
}

const MAX_COMMAND_LOG = 100;

// ---------------------------------------------------------------------------
// Immutable update helpers
// ---------------------------------------------------------------------------

function mapWith<K, V>(map: Map<K, V>, key: K, value: V): Map<K, V> {
  const next = new Map(map);
  next.set(key, value);
  return next;
}

function mapWithout<K, V>(map: Map<K, V>, key: K): Map<K, V> {
  const next = new Map(map);
  next.delete(key);
  return next;
}

// Append `doc` after the current entry (dropping any redo branch) and keep at
// most maxHistorySize undo steps.
function pushHistory(state: Pick<EditorState, 'history' | 'historyIndex' | 'maxHistorySize'>, doc: ApiDocument): ApiDocument[] {
  const next = [...state.history.slice(0, state.historyIndex + 1), doc];
  const overflow = next.length - (state.maxHistorySize + 1);
  return overflow > 0 ? next.slice(overflow) : next;
}

/**
 * Coalescing key for a text edit: only updates whose values are all strings or
 * numbers (what an <input> produces per keystroke) are merged; structural
 * edits (adding a variant, toggling a flag, replacing a Map) never are.
 */
function textEditKey(target: string, updates: object): string | undefined {
  const keys = Object.keys(updates);
  if (keys.length === 0) return undefined;
  for (const k of keys) {
    const v = (updates as Record<string, unknown>)[k];
    if (typeof v !== 'string' && typeof v !== 'number') return undefined;
  }
  return `${target}|${keys.sort().join(',')}`;
}

/** Keep a selection only if it still exists in `doc`. */
function pruneSelection(state: EditorState, doc: ApiDocument): Pick<EditorState, 'selectedRouteId' | 'selectedSchemaId'> {
  return {
    selectedRouteId: state.selectedRouteId && doc.routes.has(state.selectedRouteId) ? state.selectedRouteId : null,
    selectedSchemaId: state.selectedSchemaId && doc.schemas.has(state.selectedSchemaId) ? state.selectedSchemaId : null,
  };
}

interface CommitOptions {
  /** merge with the previous edit when it had the same key (see historyCoalesceMs) */
  coalesceKey?: string;
  /** key the *next* edit must match (differs from coalesceKey when an edit renames its target) */
  nextCoalesceKey?: string;
  extra?: Partial<EditorState>;
}

const initialDocument = createEmptyDocument();

export const useEditorStore = create<EditorState>((set, get) => {
  // Last coalescable edit; kept outside the state so it never triggers renders.
  let lastEdit: { key: string; at: number } | null = null;

  function commit(document: ApiDocument, type: CommandType, payload: unknown, options: CommitOptions = {}) {
    const state = get();
    const now = Date.now();
    const { coalesceKey } = options;
    const merge =
      coalesceKey !== undefined &&
      state.historyCoalesceMs > 0 &&
      lastEdit !== null &&
      lastEdit.key === coalesceKey &&
      now - lastEdit.at <= state.historyCoalesceMs &&
      state.historyIndex > 0 &&
      state.historyIndex === state.history.length - 1;

    let history: ApiDocument[];
    if (merge) {
      history = state.history.slice();
      history[state.historyIndex] = document;
    } else {
      history = pushHistory(state, document);
    }
    lastEdit = coalesceKey !== undefined ? { key: options.nextCoalesceKey ?? coalesceKey, at: now } : null;

    const entry: Command = { type, payload, timestamp: now };
    const commandLog =
      state.commandLog.length >= MAX_COMMAND_LOG
        ? [...state.commandLog.slice(state.commandLog.length - MAX_COMMAND_LOG + 1), entry]
        : [...state.commandLog, entry];

    set({
      document,
      history,
      historyIndex: history.length - 1,
      documentVersion: state.documentVersion + 1,
      commandLog,
      ...options.extra,
    });
  }

  /** Replace one route (copying only it and the routes Map). */
  function commitRoute(routeId: NodeId, type: CommandType, payload: unknown, fn: (route: Route) => Route | null, options?: CommitOptions) {
    const doc = get().document;
    const route = doc.routes.get(routeId);
    if (!route) return;
    const next = fn(route);
    if (!next) return;
    commit({ ...doc, routes: mapWith(doc.routes, routeId, next) }, type, payload, options);
  }

  /** Replace one schema (copying only it and the schemas Map). */
  function commitSchema(schemaId: NodeId, type: CommandType, payload: unknown, fn: (schema: SchemaNode) => SchemaNode | null, options?: CommitOptions) {
    const doc = get().document;
    const schema = doc.schemas.get(schemaId);
    if (!schema) return;
    const next = fn(schema);
    if (!next) return;
    commit({ ...doc, schemas: mapWith(doc.schemas, schemaId, next) }, type, payload, options);
  }

  return {
    // Initial state
    document: initialDocument,
    documentVersion: 0,
    selectedSchemaId: null,
    selectedRouteId: null,
    history: [initialDocument],
    historyIndex: 0,
    maxHistorySize: 50,
    historyCoalesceMs: 1000,
    commandLog: [],
    activeTab: 'routes',
    yamlPreviewOpen: false,

    // Document actions
    setDocument: (doc) => {
      commit(doc, 'IMPORT_DOCUMENT', null, { extra: pruneSelection(get(), doc) });
    },

    updateInfo: (info) => {
      const doc = get().document;
      commit({ ...doc, info: { ...doc.info, ...info } }, 'UPDATE_INFO', info, { coalesceKey: textEditKey('info', info) });
    },

    // Schema actions
    addSchema: (schema) => {
      const doc = get().document;
      commit({ ...doc, schemas: mapWith(doc.schemas, schema.id, schema) }, 'ADD_SCHEMA', schema, {
        extra: { selectedSchemaId: schema.id },
      });
    },

    updateSchema: (id, updates) => {
      commitSchema(
        id,
        'UPDATE_SCHEMA',
        { id, updates },
        (schema) => {
          const updated = { ...schema, ...updates };
          // Defensive copy: the caller may keep mutating the Map it passed in
          if (updates.properties) updated.properties = new Map(updates.properties);
          return updated;
        },
        { coalesceKey: textEditKey(`schema:${id}`, updates) }
      );
    },

    deleteSchema: (id) => {
      const state = get();
      if (!state.document.schemas.has(id)) return;
      commit({ ...state.document, schemas: mapWithout(state.document.schemas, id) }, 'DELETE_SCHEMA', { id }, {
        extra: { selectedSchemaId: state.selectedSchemaId === id ? null : state.selectedSchemaId },
      });
    },

    addFieldToSchema: (schemaId, field) => {
      commitSchema(schemaId, 'ADD_FIELD', { schemaId, field }, (schema) => {
        if (schema.type !== 'object') return null;
        const properties = new Map(schema.properties ?? []);
        properties.set(field.name, field);
        let required = schema.required;
        if (field.required && !(required ?? []).includes(field.name)) {
          required = [...(required ?? []), field.name];
        }
        return { ...schema, properties, required };
      });
    },

    updateField: (schemaId, fieldName, updates) => {
      const newName = updates.name && updates.name !== fieldName ? updates.name : undefined;
      const keyBase = (name: string) => textEditKey(`field:${schemaId}:${name}`, updates);
      commitSchema(
        schemaId,
        'UPDATE_FIELD',
        { schemaId, fieldName, updates },
        (schema) => {
          const field = schema.properties?.get(fieldName);
          if (!schema.properties || !field) return null;
          // Renaming onto another existing field would silently drop that field
          if (newName && schema.properties.has(newName)) return null;

          const updatedField = { ...field, ...updates };
          let properties: Map<string, PropertyDef>;
          let required = schema.required;
          if (newName) {
            // Rebuild the Map so the renamed field keeps its position
            properties = new Map(
              Array.from(schema.properties, ([k, v]): [string, PropertyDef] => (k === fieldName ? [newName, updatedField] : [k, v]))
            );
            if (required?.includes(fieldName)) {
              required = required.map((n) => (n === fieldName ? newName : n));
            }
          } else {
            properties = mapWith(schema.properties, fieldName, updatedField);
          }

          if (updates.required !== undefined) {
            const name = newName ?? fieldName;
            const list = required ?? [];
            const has = list.includes(name);
            if (updates.required && !has) required = [...list, name];
            else if (!updates.required && has) required = list.filter((n) => n !== name);
            else required = list;
          }
          return { ...schema, properties, required };
        },
        { coalesceKey: keyBase(fieldName), nextCoalesceKey: keyBase(newName ?? fieldName) }
      );
    },

    deleteField: (schemaId, fieldName) => {
      commitSchema(schemaId, 'DELETE_FIELD', { schemaId, fieldName }, (schema) => {
        if (!schema.properties?.has(fieldName)) return null;
        return {
          ...schema,
          properties: mapWithout(schema.properties, fieldName),
          required: schema.required?.includes(fieldName) ? schema.required.filter((n) => n !== fieldName) : schema.required,
        };
      });
    },

    // Route actions
    addRoute: (route) => {
      const doc = get().document;
      commit({ ...doc, routes: mapWith(doc.routes, route.id, route) }, 'ADD_ROUTE', route, {
        extra: { selectedRouteId: route.id },
      });
    },

    updateRoute: (id, updates) => {
      commitRoute(id, 'UPDATE_ROUTE', { id, updates }, (route) => ({ ...route, ...updates }), {
        coalesceKey: textEditKey(`route:${id}`, updates),
      });
    },

    deleteRoute: (id) => {
      const state = get();
      if (!state.document.routes.has(id)) return;
      commit({ ...state.document, routes: mapWithout(state.document.routes, id) }, 'DELETE_ROUTE', { id }, {
        extra: { selectedRouteId: state.selectedRouteId === id ? null : state.selectedRouteId },
      });
    },

    addParameter: (routeId, param) => {
      commitRoute(routeId, 'ADD_PARAMETER', { routeId, param }, (route) => ({
        ...route,
        parameters: [...route.parameters, param],
      }));
    },

    updateParameter: (routeId, paramId, updates) => {
      commitRoute(
        routeId,
        'UPDATE_PARAMETER',
        { routeId, paramId, updates },
        (route) => ({
          ...route,
          parameters: route.parameters.map((p) => (p.id === paramId ? { ...p, ...updates } : p)),
        }),
        { coalesceKey: textEditKey(`param:${routeId}:${paramId}`, updates) }
      );
    },

    deleteParameter: (routeId, paramId) => {
      commitRoute(routeId, 'DELETE_PARAMETER', { routeId, paramId }, (route) => ({
        ...route,
        parameters: route.parameters.filter((p) => p.id !== paramId),
      }));
    },

    setRequestBody: (routeId, body) => {
      commitRoute(routeId, 'SET_REQUEST_BODY', { routeId, body }, (route) => ({ ...route, requestBody: body }));
    },

    addResponse: (routeId, statusCode, response) => {
      commitRoute(routeId, 'ADD_RESPONSE', { routeId, statusCode, response }, (route) => ({
        ...route,
        responses: mapWith(route.responses, statusCode, response),
      }));
    },

    updateResponse: (routeId, statusCode, updates) => {
      commitRoute(
        routeId,
        'UPDATE_RESPONSE',
        { routeId, statusCode, updates },
        (route) => {
          const response = route.responses.get(statusCode);
          if (!response) return null;
          return { ...route, responses: mapWith(route.responses, statusCode, { ...response, ...updates }) };
        },
        { coalesceKey: textEditKey(`response:${routeId}:${statusCode}`, updates) }
      );
    },

    deleteResponse: (routeId, statusCode) => {
      commitRoute(routeId, 'DELETE_RESPONSE', { routeId, statusCode }, (route) => ({
        ...route,
        responses: mapWithout(route.responses, statusCode),
      }));
    },

    // Server actions
    addServer: (server) => {
      const doc = get().document;
      commit({ ...doc, servers: [...doc.servers, server] }, 'ADD_SERVER', server);
    },

    updateServer: (index, server) => {
      const doc = get().document;
      if (index < 0 || index >= doc.servers.length) return;
      commit(
        { ...doc, servers: doc.servers.map((s, i) => (i === index ? server : s)) },
        'UPDATE_SERVER',
        { index, server },
        { coalesceKey: `server:${index}` }
      );
    },

    deleteServer: (index) => {
      const doc = get().document;
      if (index < 0 || index >= doc.servers.length) return;
      commit({ ...doc, servers: doc.servers.filter((_, i) => i !== index) }, 'DELETE_SERVER', { index });
    },

    // Security actions
    addSecurityScheme: (scheme) => {
      const doc = get().document;
      commit({ ...doc, securitySchemes: mapWith(doc.securitySchemes, scheme.id, scheme) }, 'ADD_SECURITY_SCHEME', scheme);
    },

    updateSecurityScheme: (id, updates) => {
      const doc = get().document;
      const scheme = doc.securitySchemes.get(id);
      if (!scheme) return;
      commit(
        { ...doc, securitySchemes: mapWith(doc.securitySchemes, id, { ...scheme, ...updates }) },
        'UPDATE_SECURITY_SCHEME',
        { id, updates },
        { coalesceKey: textEditKey(`scheme:${id}`, updates) }
      );
    },

    deleteSecurityScheme: (id) => {
      const doc = get().document;
      if (!doc.securitySchemes.has(id)) return;
      // Drop requirements on the deleted scheme. A list emptied this way falls
      // back to inheriting (undefined), not to "no authentication" ([]).
      const withoutScheme = (reqs: SecurityRequirement[] | undefined) => {
        if (!reqs || !reqs.some((r) => r.schemeId === id)) return reqs;
        const kept = reqs.filter((r) => r.schemeId !== id);
        return kept.length > 0 ? kept : undefined;
      };
      let routes = doc.routes;
      for (const [routeId, route] of doc.routes) {
        const security = withoutScheme(route.security);
        if (security === route.security) continue;
        if (routes === doc.routes) routes = new Map(doc.routes);
        routes.set(routeId, { ...route, security });
      }
      commit(
        { ...doc, securitySchemes: mapWithout(doc.securitySchemes, id), security: withoutScheme(doc.security), routes },
        'DELETE_SECURITY_SCHEME',
        { id }
      );
    },

    // Tag actions
    addTag: (tag) => {
      const doc = get().document;
      if (doc.tags.some((t) => t.name === tag.name)) return;
      commit({ ...doc, tags: [...doc.tags, tag] }, 'ADD_TAG', tag);
    },

    deleteTag: (name) => {
      const doc = get().document;
      if (!doc.tags.some((t) => t.name === name)) return;
      commit({ ...doc, tags: doc.tags.filter((t) => t.name !== name) }, 'DELETE_TAG', { name });
    },

    // Selection actions
    selectSchema: (id) => set({ selectedSchemaId: id }),
    selectRoute: (id) => set({ selectedRouteId: id }),
    setActiveTab: (tab) => set({ activeTab: tab }),
    setYamlPreviewOpen: (open) => set({ yamlPreviewOpen: open }),

    // History actions
    undo: () => {
      const state = get();
      if (state.historyIndex <= 0) return;
      lastEdit = null;
      const document = state.history[state.historyIndex - 1];
      set({
        document,
        historyIndex: state.historyIndex - 1,
        documentVersion: state.documentVersion + 1,
        ...pruneSelection(state, document),
      });
    },

    redo: () => {
      const state = get();
      if (state.historyIndex >= state.history.length - 1) return;
      lastEdit = null;
      const document = state.history[state.historyIndex + 1];
      set({
        document,
        historyIndex: state.historyIndex + 1,
        documentVersion: state.documentVersion + 1,
        ...pruneSelection(state, document),
      });
    },

    canUndo: () => get().historyIndex > 0,
    canRedo: () => get().historyIndex < get().history.length - 1,

    sealHistory: () => {
      lastEdit = null;
    },

    // Helper methods
    getSchemaById: (id) => get().document.schemas.get(id),
    getRouteById: (id) => get().document.routes.get(id),
    getSchemaUsageCount: (id) => getSchemaUsageCounts(get().document).get(id) ?? 0,
    getSchemaUsageCounts: () => getSchemaUsageCounts(get().document),

    // Initialize document from storage without adding to history
    initializeDocument: (doc) => {
      lastEdit = null;
      set({
        document: doc,
        history: [doc],
        historyIndex: 0,
        documentVersion: 0,
        selectedSchemaId: null,
        selectedRouteId: null,
        commandLog: [],
      });
    },
  };
});
