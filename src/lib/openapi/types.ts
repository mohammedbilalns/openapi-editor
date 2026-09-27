// Core type definitions for OpenAPI WYSIWYG Editor

export type NodeId = string;

export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'options' | 'head';

export type SchemaType = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'enum' | 'oneOf' | 'anyOf' | 'allOf';

// References are TYPED EDGES, not strings
export interface SchemaRef {
  kind: 'ref';
  targetId: NodeId;
}

export interface InlineSchema {
  kind: 'inline';
  schema: SchemaNode;
}

export type SchemaOrRef = SchemaRef | InlineSchema;

export interface PropertyDef {
  name: string;
  schema: SchemaOrRef;
  required: boolean;
  description?: string;
}

export interface SchemaNode {
  id: NodeId;
  name?: string;
  type: SchemaType;
  description?: string;
  properties?: Map<string, PropertyDef>;
  items?: SchemaOrRef;
  variants?: SchemaOrRef[];
  enumValues?: string[];
  required?: string[];
  format?: string;
  example?: unknown;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  discriminator?: {
    propertyName: string;
    mapping?: Record<string, string>;
  };
}

export interface ParameterDef {
  id: NodeId;
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required: boolean;
  schema: SchemaOrRef;
  description?: string;
  example?: unknown;
}

export interface RequestBody {
  id: NodeId;
  description?: string;
  required: boolean;
  content: Map<string, MediaType>;
}

export interface MediaType {
  schema: SchemaOrRef;
  example?: unknown;
}

export interface ResponseDef {
  id: NodeId;
  description: string;
  content?: Map<string, MediaType>;
  headers?: Map<string, ParameterDef>;
}

export interface SecurityScheme {
  id: NodeId;
  name: string;
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
  description?: string;
  // apiKey
  in?: 'query' | 'header' | 'cookie';
  paramName?: string;
  // http
  scheme?: string;
  bearerFormat?: string;
  // oauth2
  flows?: OAuthFlows;
  // openIdConnect
  openIdConnectUrl?: string;
}

export interface OAuthFlows {
  implicit?: OAuthFlow;
  password?: OAuthFlow;
  clientCredentials?: OAuthFlow;
  authorizationCode?: OAuthFlow;
}

export interface OAuthFlow {
  authorizationUrl?: string;
  tokenUrl?: string;
  refreshUrl?: string;
  scopes: Record<string, string>;
}

export interface SecurityRequirement {
  schemeId: NodeId;
  scopes: string[];
}

export interface Tag {
  name: string;
  description?: string;
}

export interface Server {
  url: string;
  description?: string;
  variables?: Record<string, ServerVariable>;
}

export interface ServerVariable {
  default: string;
  enum?: string[];
  description?: string;
}

export interface InfoObject {
  title: string;
  version: string;
  description?: string;
  termsOfService?: string;
  contact?: {
    name?: string;
    url?: string;
    email?: string;
  };
  license?: {
    name: string;
    url?: string;
  };
}

export interface Route {
  id: NodeId;
  path: string;
  method: HttpMethod;
  summary?: string;
  description?: string;
  operationId?: string;
  tags: string[];
  parameters: ParameterDef[];
  requestBody?: RequestBody;
  responses: Map<string, ResponseDef>;
  security?: SecurityRequirement[];
  deprecated?: boolean;
}

export interface ApiDocument {
  id: NodeId;
  info: InfoObject;
  servers: Server[];
  routes: Map<NodeId, Route>;
  schemas: Map<NodeId, SchemaNode>;
  securitySchemes: Map<NodeId, SecurityScheme>;
  tags: Tag[];
}

// Command types for state mutations
export type CommandType =
  | 'ADD_SCHEMA'
  | 'UPDATE_SCHEMA'
  | 'DELETE_SCHEMA'
  | 'ADD_FIELD'
  | 'UPDATE_FIELD'
  | 'DELETE_FIELD'
  | 'ADD_ROUTE'
  | 'UPDATE_ROUTE'
  | 'DELETE_ROUTE'
  | 'ADD_PARAMETER'
  | 'UPDATE_PARAMETER'
  | 'DELETE_PARAMETER'
  | 'ADD_RESPONSE'
  | 'UPDATE_RESPONSE'
  | 'DELETE_RESPONSE'
  | 'SET_REQUEST_BODY'
  | 'UPDATE_INFO'
  | 'ADD_SERVER'
  | 'UPDATE_SERVER'
  | 'DELETE_SERVER'
  | 'ADD_SECURITY_SCHEME'
  | 'UPDATE_SECURITY_SCHEME'
  | 'DELETE_SECURITY_SCHEME'
  | 'ADD_TAG'
  | 'DELETE_TAG'
  | 'IMPORT_DOCUMENT';

export interface Command {
  type: CommandType;
  payload: unknown;
  timestamp: number;
}

// Validation types
export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationError {
  code: string;
  message: string;
  severity: ValidationSeverity;
  location: {
    nodeId?: NodeId;
    path?: string[];
    field?: string;
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

// Helper to create new IDs
export function generateId(): NodeId {
  return crypto.randomUUID();
}

// Helper to create empty document
export function createEmptyDocument(): ApiDocument {
  return {
    id: generateId(),
    info: {
      title: 'New API',
      version: '1.0.0',
      description: '',
    },
    servers: [],
    routes: new Map(),
    schemas: new Map(),
    securitySchemes: new Map(),
    tags: [],
  };
}

// Helper to create a new schema
export function createSchema(type: SchemaType, name?: string): SchemaNode {
  const schema: SchemaNode = {
    id: generateId(),
    type,
    name,
  };

  if (type === 'object') {
    schema.properties = new Map();
    schema.required = [];
  } else if (type === 'array') {
    schema.items = { kind: 'inline', schema: createSchema('string') };
  } else if (type === 'enum') {
    schema.enumValues = [];
  } else if (type === 'oneOf' || type === 'anyOf' || type === 'allOf') {
    schema.variants = [];
  }

  return schema;
}

// Helper to create a new route
export function createRoute(path: string, method: HttpMethod): Route {
  return {
    id: generateId(),
    path,
    method,
    tags: [],
    parameters: [],
    responses: new Map([
      ['200', {
        id: generateId(),
        description: 'Successful response',
      }],
    ]),
  };
}
