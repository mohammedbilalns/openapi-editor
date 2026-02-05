import { create } from 'zustand';
import {
  ApiDocument,
  SchemaNode,
  Route,
  Command,
  PropertyDef,
  ParameterDef,
  ResponseDef,
  RequestBody,
  SecurityScheme,
  Server,
  Tag,
  InfoObject,
  NodeId,
  HttpMethod,
  SchemaType,
  SchemaOrRef,
  createEmptyDocument,
  createSchema,
  createRoute,
  generateId,
} from './types';

interface EditorState {
  // Document state
  document: ApiDocument;
  
  // Version counter for tracking changes (used by YAML preview)
  documentVersion: number;
  
  // Selection state
  selectedSchemaId: NodeId | null;
  selectedRouteId: NodeId | null;
  
  // History for undo/redo
  history: ApiDocument[];
  historyIndex: number;
  maxHistorySize: number;
  
  // Command log
  commandLog: Command[];
  
  // UI state
  activeTab: 'routes' | 'schemas' | 'settings';
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
  setActiveTab: (tab: 'routes' | 'schemas' | 'settings') => void;
  setYamlPreviewOpen: (open: boolean) => void;
  
  // Actions - History
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  
  // Helpers
  getSchemaById: (id: NodeId) => SchemaNode | undefined;
  getRouteById: (id: NodeId) => Route | undefined;
  getSchemaUsageCount: (id: NodeId) => number;
  
  // Persistence - Initialize document without adding to history (for loading from storage)
  initializeDocument: (doc: ApiDocument) => void;
}

// Helper to deep clone Maps in document
function cloneDocument(doc: ApiDocument): ApiDocument {
  return {
    ...doc,
    routes: new Map(Array.from(doc.routes.entries()).map(([k, v]) => [k, { 
      ...v, 
      parameters: [...v.parameters],
      responses: new Map(v.responses),
      tags: [...v.tags],
    }])),
    schemas: new Map(Array.from(doc.schemas.entries()).map(([k, v]) => [k, {
      ...v,
      properties: v.properties ? new Map(v.properties) : undefined,
      required: v.required ? [...v.required] : undefined,
      enumValues: v.enumValues ? [...v.enumValues] : undefined,
      variants: v.variants ? [...v.variants] : undefined,
    }])),
    securitySchemes: new Map(doc.securitySchemes),
    servers: [...doc.servers],
    tags: [...doc.tags],
  };
}

export const useEditorStore = create<EditorState>((set, get) => ({
  // Initial state
  document: createEmptyDocument(),
  documentVersion: 0,
  selectedSchemaId: null,
  selectedRouteId: null,
  history: [],
  historyIndex: -1,
  maxHistorySize: 50,
  commandLog: [],
  activeTab: 'routes',
  yamlPreviewOpen: false,

  // Document actions
  setDocument: (doc) => {
    const state = get();
    const newHistory = [...state.history.slice(0, state.historyIndex + 1), cloneDocument(state.document)];
    if (newHistory.length > state.maxHistorySize) {
      newHistory.shift();
    }
    set({
      document: doc,
      history: newHistory,
      historyIndex: newHistory.length - 1,
          documentVersion: state.documentVersion + 1,
      commandLog: [...state.commandLog, { type: 'IMPORT_DOCUMENT', payload: null, timestamp: Date.now() }],
    });
  },

  updateInfo: (info) => {
    const state = get();
    const newDoc = cloneDocument(state.document);
    newDoc.info = { ...newDoc.info, ...info };
    
    const newHistory = [...state.history.slice(0, state.historyIndex + 1), cloneDocument(state.document)];
    set({
      document: newDoc,
      history: newHistory,
      historyIndex: newHistory.length - 1,
          documentVersion: state.documentVersion + 1,
      commandLog: [...state.commandLog, { type: 'UPDATE_INFO', payload: info, timestamp: Date.now() }],
    });
  },

  // Schema actions
  addSchema: (schema) => {
    const state = get();
    const newDoc = cloneDocument(state.document);
    newDoc.schemas.set(schema.id, schema);
    
    const newHistory = [...state.history.slice(0, state.historyIndex + 1), cloneDocument(state.document)];
    set({
      document: newDoc,
      history: newHistory,
      historyIndex: newHistory.length - 1,
          documentVersion: state.documentVersion + 1,
      selectedSchemaId: schema.id,
      commandLog: [...state.commandLog, { type: 'ADD_SCHEMA', payload: schema, timestamp: Date.now() }],
    });
  },

  updateSchema: (id, updates) => {
    const state = get();
    const schema = state.document.schemas.get(id);
    if (!schema) return;

    const newDoc = cloneDocument(state.document);
    const updatedSchema = { ...schema, ...updates };
    
    // Handle properties Map if updated
    if (updates.properties) {
      updatedSchema.properties = new Map(updates.properties);
    }
    
    newDoc.schemas.set(id, updatedSchema);
    
    const newHistory = [...state.history.slice(0, state.historyIndex + 1), cloneDocument(state.document)];
    set({
      document: newDoc,
      history: newHistory,
      historyIndex: newHistory.length - 1,
          documentVersion: state.documentVersion + 1,
      commandLog: [...state.commandLog, { type: 'UPDATE_SCHEMA', payload: { id, updates }, timestamp: Date.now() }],
    });
  },

  deleteSchema: (id) => {
    const state = get();
    const newDoc = cloneDocument(state.document);
    newDoc.schemas.delete(id);
    
    const newHistory = [...state.history.slice(0, state.historyIndex + 1), cloneDocument(state.document)];
    set({
      document: newDoc,
      history: newHistory,
      historyIndex: newHistory.length - 1,
          documentVersion: state.documentVersion + 1,
      selectedSchemaId: state.selectedSchemaId === id ? null : state.selectedSchemaId,
      commandLog: [...state.commandLog, { type: 'DELETE_SCHEMA', payload: { id }, timestamp: Date.now() }],
    });
  },

  addFieldToSchema: (schemaId, field) => {
    const state = get();
    const schema = state.document.schemas.get(schemaId);
    if (!schema || schema.type !== 'object') return;

    const newDoc = cloneDocument(state.document);
    const updatedSchema = newDoc.schemas.get(schemaId)!;
    
    if (!updatedSchema.properties) {
      updatedSchema.properties = new Map();
    }
    updatedSchema.properties.set(field.name, field);
    
    if (field.required) {
      if (!updatedSchema.required) {
        updatedSchema.required = [];
      }
      if (!updatedSchema.required.includes(field.name)) {
        updatedSchema.required.push(field.name);
      }
    }
    
    const newHistory = [...state.history.slice(0, state.historyIndex + 1), cloneDocument(state.document)];
    set({
      document: newDoc,
      history: newHistory,
      historyIndex: newHistory.length - 1,
          documentVersion: state.documentVersion + 1,
      commandLog: [...state.commandLog, { type: 'ADD_FIELD', payload: { schemaId, field }, timestamp: Date.now() }],
    });
  },

  updateField: (schemaId, fieldName, updates) => {
    const state = get();
    const schema = state.document.schemas.get(schemaId);
    if (!schema || !schema.properties) return;

    const field = schema.properties.get(fieldName);
    if (!field) return;

    const newDoc = cloneDocument(state.document);
    const updatedSchema = newDoc.schemas.get(schemaId)!;
    const updatedField = { ...field, ...updates };
    
    // Handle field rename
    if (updates.name && updates.name !== fieldName) {
      updatedSchema.properties!.delete(fieldName);
      updatedSchema.properties!.set(updates.name, updatedField);
      
      // Update required array
      if (updatedSchema.required) {
        const idx = updatedSchema.required.indexOf(fieldName);
        if (idx !== -1) {
          updatedSchema.required[idx] = updates.name;
        }
      }
    } else {
      updatedSchema.properties!.set(fieldName, updatedField);
    }
    
    // Handle required change
    if (updates.required !== undefined) {
      if (!updatedSchema.required) {
        updatedSchema.required = [];
      }
      const name = updates.name || fieldName;
      const idx = updatedSchema.required.indexOf(name);
      if (updates.required && idx === -1) {
        updatedSchema.required.push(name);
      } else if (!updates.required && idx !== -1) {
        updatedSchema.required.splice(idx, 1);
      }
    }
    
    const newHistory = [...state.history.slice(0, state.historyIndex + 1), cloneDocument(state.document)];
    set({
      document: newDoc,
      history: newHistory,
      historyIndex: newHistory.length - 1,
          documentVersion: state.documentVersion + 1,
      commandLog: [...state.commandLog, { type: 'UPDATE_FIELD', payload: { schemaId, fieldName, updates }, timestamp: Date.now() }],
    });
  },

  deleteField: (schemaId, fieldName) => {
    const state = get();
    const schema = state.document.schemas.get(schemaId);
    if (!schema || !schema.properties) return;

    const newDoc = cloneDocument(state.document);
    const updatedSchema = newDoc.schemas.get(schemaId)!;
    updatedSchema.properties!.delete(fieldName);
    
    if (updatedSchema.required) {
      const idx = updatedSchema.required.indexOf(fieldName);
      if (idx !== -1) {
        updatedSchema.required.splice(idx, 1);
      }
    }
    
    const newHistory = [...state.history.slice(0, state.historyIndex + 1), cloneDocument(state.document)];
    set({
      document: newDoc,
      history: newHistory,
      historyIndex: newHistory.length - 1,
          documentVersion: state.documentVersion + 1,
      commandLog: [...state.commandLog, { type: 'DELETE_FIELD', payload: { schemaId, fieldName }, timestamp: Date.now() }],
    });
  },

  // Route actions
  addRoute: (route) => {
    const state = get();
    const newDoc = cloneDocument(state.document);
    newDoc.routes.set(route.id, route);
    
    const newHistory = [...state.history.slice(0, state.historyIndex + 1), cloneDocument(state.document)];
    set({
      document: newDoc,
      history: newHistory,
      historyIndex: newHistory.length - 1,
          documentVersion: state.documentVersion + 1,
      selectedRouteId: route.id,
      commandLog: [...state.commandLog, { type: 'ADD_ROUTE', payload: route, timestamp: Date.now() }],
    });
  },

  updateRoute: (id, updates) => {
    const state = get();
    const route = state.document.routes.get(id);
    if (!route) return;

    const newDoc = cloneDocument(state.document);
    newDoc.routes.set(id, { ...route, ...updates });
    
    const newHistory = [...state.history.slice(0, state.historyIndex + 1), cloneDocument(state.document)];
    set({
      document: newDoc,
      history: newHistory,
      historyIndex: newHistory.length - 1,
          documentVersion: state.documentVersion + 1,
      commandLog: [...state.commandLog, { type: 'UPDATE_ROUTE', payload: { id, updates }, timestamp: Date.now() }],
    });
  },

  deleteRoute: (id) => {
    const state = get();
    const newDoc = cloneDocument(state.document);
    newDoc.routes.delete(id);
    
    const newHistory = [...state.history.slice(0, state.historyIndex + 1), cloneDocument(state.document)];
    set({
      document: newDoc,
      history: newHistory,
      historyIndex: newHistory.length - 1,
          documentVersion: state.documentVersion + 1,
      selectedRouteId: state.selectedRouteId === id ? null : state.selectedRouteId,
      commandLog: [...state.commandLog, { type: 'DELETE_ROUTE', payload: { id }, timestamp: Date.now() }],
    });
  },

  addParameter: (routeId, param) => {
    const state = get();
    const route = state.document.routes.get(routeId);
    if (!route) return;

    const newDoc = cloneDocument(state.document);
    const updatedRoute = newDoc.routes.get(routeId)!;
    updatedRoute.parameters = [...updatedRoute.parameters, param];
    
    const newHistory = [...state.history.slice(0, state.historyIndex + 1), cloneDocument(state.document)];
    set({
      document: newDoc,
      history: newHistory,
      historyIndex: newHistory.length - 1,
          documentVersion: state.documentVersion + 1,
      commandLog: [...state.commandLog, { type: 'ADD_PARAMETER', payload: { routeId, param }, timestamp: Date.now() }],
    });
  },

  updateParameter: (routeId, paramId, updates) => {
    const state = get();
    const route = state.document.routes.get(routeId);
    if (!route) return;

    const newDoc = cloneDocument(state.document);
    const updatedRoute = newDoc.routes.get(routeId)!;
    updatedRoute.parameters = updatedRoute.parameters.map(p =>
      p.id === paramId ? { ...p, ...updates } : p
    );
    
    const newHistory = [...state.history.slice(0, state.historyIndex + 1), cloneDocument(state.document)];
    set({
      document: newDoc,
      history: newHistory,
      historyIndex: newHistory.length - 1,
          documentVersion: state.documentVersion + 1,
      commandLog: [...state.commandLog, { type: 'UPDATE_PARAMETER', payload: { routeId, paramId, updates }, timestamp: Date.now() }],
    });
  },

  deleteParameter: (routeId, paramId) => {
    const state = get();
    const route = state.document.routes.get(routeId);
    if (!route) return;

    const newDoc = cloneDocument(state.document);
    const updatedRoute = newDoc.routes.get(routeId)!;
    updatedRoute.parameters = updatedRoute.parameters.filter(p => p.id !== paramId);
    
    const newHistory = [...state.history.slice(0, state.historyIndex + 1), cloneDocument(state.document)];
    set({
      document: newDoc,
      history: newHistory,
      historyIndex: newHistory.length - 1,
          documentVersion: state.documentVersion + 1,
      commandLog: [...state.commandLog, { type: 'DELETE_PARAMETER', payload: { routeId, paramId }, timestamp: Date.now() }],
    });
  },

  setRequestBody: (routeId, body) => {
    const state = get();
    const route = state.document.routes.get(routeId);
    if (!route) return;

    const newDoc = cloneDocument(state.document);
    const updatedRoute = newDoc.routes.get(routeId)!;
    updatedRoute.requestBody = body;
    
    const newHistory = [...state.history.slice(0, state.historyIndex + 1), cloneDocument(state.document)];
    set({
      document: newDoc,
      history: newHistory,
      historyIndex: newHistory.length - 1,
          documentVersion: state.documentVersion + 1,
      commandLog: [...state.commandLog, { type: 'SET_REQUEST_BODY', payload: { routeId, body }, timestamp: Date.now() }],
    });
  },

  addResponse: (routeId, statusCode, response) => {
    const state = get();
    const route = state.document.routes.get(routeId);
    if (!route) return;

    const newDoc = cloneDocument(state.document);
    const updatedRoute = newDoc.routes.get(routeId)!;
    updatedRoute.responses.set(statusCode, response);
    
    const newHistory = [...state.history.slice(0, state.historyIndex + 1), cloneDocument(state.document)];
    set({
      document: newDoc,
      history: newHistory,
      historyIndex: newHistory.length - 1,
          documentVersion: state.documentVersion + 1,
      commandLog: [...state.commandLog, { type: 'ADD_RESPONSE', payload: { routeId, statusCode, response }, timestamp: Date.now() }],
    });
  },

  updateResponse: (routeId, statusCode, updates) => {
    const state = get();
    const route = state.document.routes.get(routeId);
    if (!route) return;

    const response = route.responses.get(statusCode);
    if (!response) return;

    const newDoc = cloneDocument(state.document);
    const updatedRoute = newDoc.routes.get(routeId)!;
    updatedRoute.responses.set(statusCode, { ...response, ...updates });
    
    const newHistory = [...state.history.slice(0, state.historyIndex + 1), cloneDocument(state.document)];
    set({
      document: newDoc,
      history: newHistory,
      historyIndex: newHistory.length - 1,
          documentVersion: state.documentVersion + 1,
      commandLog: [...state.commandLog, { type: 'UPDATE_RESPONSE', payload: { routeId, statusCode, updates }, timestamp: Date.now() }],
    });
  },

  deleteResponse: (routeId, statusCode) => {
    const state = get();
    const route = state.document.routes.get(routeId);
    if (!route) return;

    const newDoc = cloneDocument(state.document);
    const updatedRoute = newDoc.routes.get(routeId)!;
    updatedRoute.responses.delete(statusCode);
    
    const newHistory = [...state.history.slice(0, state.historyIndex + 1), cloneDocument(state.document)];
    set({
      document: newDoc,
      history: newHistory,
      historyIndex: newHistory.length - 1,
          documentVersion: state.documentVersion + 1,
      commandLog: [...state.commandLog, { type: 'DELETE_RESPONSE', payload: { routeId, statusCode }, timestamp: Date.now() }],
    });
  },

  // Server actions
  addServer: (server) => {
    const state = get();
    const newDoc = cloneDocument(state.document);
    newDoc.servers.push(server);
    
    const newHistory = [...state.history.slice(0, state.historyIndex + 1), cloneDocument(state.document)];
    set({
      document: newDoc,
      history: newHistory,
      historyIndex: newHistory.length - 1,
          documentVersion: state.documentVersion + 1,
      commandLog: [...state.commandLog, { type: 'ADD_SERVER', payload: server, timestamp: Date.now() }],
    });
  },

  updateServer: (index, server) => {
    const state = get();
    const newDoc = cloneDocument(state.document);
    newDoc.servers[index] = server;
    
    const newHistory = [...state.history.slice(0, state.historyIndex + 1), cloneDocument(state.document)];
    set({
      document: newDoc,
      history: newHistory,
      historyIndex: newHistory.length - 1,
          documentVersion: state.documentVersion + 1,
      commandLog: [...state.commandLog, { type: 'UPDATE_SERVER', payload: { index, server }, timestamp: Date.now() }],
    });
  },

  deleteServer: (index) => {
    const state = get();
    const newDoc = cloneDocument(state.document);
    newDoc.servers.splice(index, 1);
    
    const newHistory = [...state.history.slice(0, state.historyIndex + 1), cloneDocument(state.document)];
    set({
      document: newDoc,
      history: newHistory,
      historyIndex: newHistory.length - 1,
          documentVersion: state.documentVersion + 1,
      commandLog: [...state.commandLog, { type: 'DELETE_SERVER', payload: { index }, timestamp: Date.now() }],
    });
  },

  // Security actions
  addSecurityScheme: (scheme) => {
    const state = get();
    const newDoc = cloneDocument(state.document);
    newDoc.securitySchemes.set(scheme.id, scheme);
    
    const newHistory = [...state.history.slice(0, state.historyIndex + 1), cloneDocument(state.document)];
    set({
      document: newDoc,
      history: newHistory,
      historyIndex: newHistory.length - 1,
          documentVersion: state.documentVersion + 1,
      commandLog: [...state.commandLog, { type: 'ADD_SECURITY_SCHEME', payload: scheme, timestamp: Date.now() }],
    });
  },

  updateSecurityScheme: (id, updates) => {
    const state = get();
    const scheme = state.document.securitySchemes.get(id);
    if (!scheme) return;

    const newDoc = cloneDocument(state.document);
    newDoc.securitySchemes.set(id, { ...scheme, ...updates });
    
    const newHistory = [...state.history.slice(0, state.historyIndex + 1), cloneDocument(state.document)];
    set({
      document: newDoc,
      history: newHistory,
      historyIndex: newHistory.length - 1,
          documentVersion: state.documentVersion + 1,
      commandLog: [...state.commandLog, { type: 'UPDATE_SECURITY_SCHEME', payload: { id, updates }, timestamp: Date.now() }],
    });
  },

  deleteSecurityScheme: (id) => {
    const state = get();
    const newDoc = cloneDocument(state.document);
    newDoc.securitySchemes.delete(id);
    
    const newHistory = [...state.history.slice(0, state.historyIndex + 1), cloneDocument(state.document)];
    set({
      document: newDoc,
      history: newHistory,
      historyIndex: newHistory.length - 1,
          documentVersion: state.documentVersion + 1,
      commandLog: [...state.commandLog, { type: 'DELETE_SECURITY_SCHEME', payload: { id }, timestamp: Date.now() }],
    });
  },

  // Tag actions
  addTag: (tag) => {
    const state = get();
    const newDoc = cloneDocument(state.document);
    if (!newDoc.tags.some(t => t.name === tag.name)) {
      newDoc.tags.push(tag);
    }
    
    const newHistory = [...state.history.slice(0, state.historyIndex + 1), cloneDocument(state.document)];
    set({
      document: newDoc,
      history: newHistory,
      historyIndex: newHistory.length - 1,
          documentVersion: state.documentVersion + 1,
      commandLog: [...state.commandLog, { type: 'ADD_TAG', payload: tag, timestamp: Date.now() }],
    });
  },

  deleteTag: (name) => {
    const state = get();
    const newDoc = cloneDocument(state.document);
    newDoc.tags = newDoc.tags.filter(t => t.name !== name);
    
    const newHistory = [...state.history.slice(0, state.historyIndex + 1), cloneDocument(state.document)];
    set({
      document: newDoc,
      history: newHistory,
      historyIndex: newHistory.length - 1,
          documentVersion: state.documentVersion + 1,
      commandLog: [...state.commandLog, { type: 'DELETE_TAG', payload: { name }, timestamp: Date.now() }],
    });
  },

  // Selection actions
  selectSchema: (id) => set({ selectedSchemaId: id }),
  selectRoute: (id) => set({ selectedRouteId: id }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setYamlPreviewOpen: (open) => set({ yamlPreviewOpen: open }),

  // History actions
  undo: () => {
    const state = get();
    if (state.historyIndex < 0) return;
    
    const previousDoc = state.history[state.historyIndex];
    set({
      document: previousDoc,
      historyIndex: state.historyIndex - 1,
      documentVersion: state.documentVersion + 1,
    });
  },

  redo: () => {
    const state = get();
    if (state.historyIndex >= state.history.length - 1) return;
    
    const nextDoc = state.history[state.historyIndex + 2];
    if (nextDoc) {
      set({
        document: nextDoc,
        historyIndex: state.historyIndex + 1,
        documentVersion: state.documentVersion + 1,
      });
    }
  },

  canUndo: () => get().historyIndex >= 0,
  canRedo: () => get().historyIndex < get().history.length - 1,

  // Helper methods
  getSchemaById: (id) => get().document.schemas.get(id),
  getRouteById: (id) => get().document.routes.get(id),
  
  getSchemaUsageCount: (id) => {
    const state = get();
    let count = 0;
    
    // Check routes for references
    for (const route of state.document.routes.values()) {
      // Check parameters
      for (const param of route.parameters) {
        if (param.schema.kind === 'ref' && param.schema.targetId === id) {
          count++;
        }
      }
      
      // Check request body
      if (route.requestBody?.content) {
        for (const media of route.requestBody.content.values()) {
          if (media.schema.kind === 'ref' && media.schema.targetId === id) {
            count++;
          }
        }
      }
      
      // Check responses
      for (const response of route.responses.values()) {
        if (response.content) {
          for (const media of response.content.values()) {
            if (media.schema.kind === 'ref' && media.schema.targetId === id) {
              count++;
            }
          }
        }
      }
    }
    
    // Check other schemas for references
    for (const schema of state.document.schemas.values()) {
      if (schema.id === id) continue;
      
      // Check properties
      if (schema.properties) {
        for (const prop of schema.properties.values()) {
          if (prop.schema.kind === 'ref' && prop.schema.targetId === id) {
            count++;
          }
        }
      }
      
      // Check array items
      if (schema.items?.kind === 'ref' && schema.items.targetId === id) {
        count++;
      }
      
      // Check variants
      if (schema.variants) {
        for (const variant of schema.variants) {
          if (variant.kind === 'ref' && variant.targetId === id) {
            count++;
          }
        }
      }
    }
    
    return count;
  },
  
  // Initialize document from storage without adding to history
  initializeDocument: (doc) => {
    set({
      document: doc,
      history: [],
      historyIndex: -1,
      documentVersion: 0,
      selectedSchemaId: null,
      selectedRouteId: null,
      commandLog: [],
    });
  },
}));
