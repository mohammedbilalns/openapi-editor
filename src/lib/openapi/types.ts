// Core type definitions for OpenAPI WYSIWYG Editor

export type NodeId = string;

export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'options' | 'head' | 'trace';

/**
 * Keys of an OpenAPI object the editor does not model (x-* extensions,
 * externalDocs, links, callbacks, style, explode, ...), kept verbatim so
 * import/export is lossless. The UI does not edit them.
 */
export type ExtraFields = Record<string, unknown>;

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

export interface FileOrigin {
  /** Relative file path within the workspace (e.g. "schemas/user.yaml" or "paths/users.yaml") */
  filePath: string;
  /** True when the file directly represents this entity */
  isStandaloneFile: boolean;
  /** Optional JSON pointer if referencing an entity inside an external file */
  jsonPointer?: string;
}

export interface SchemaNode {
  id: NodeId;
  name?: string;
  /** Origin file where this schema is stored on disk */
  origin?: FileOrigin;
  type: SchemaType;
  description?: string;
  properties?: Map<string, PropertyDef>;
  items?: SchemaOrRef;
  variants?: SchemaOrRef[];
  /**
   * Compositions next to the one `type` names (`allOf` + `oneOf` on one
   * schema). The editor doesn't show them, but their references are tracked
   * (usage, rename, delete) and export writes them back.
   */
  otherCompositions?: Partial<Record<'oneOf' | 'anyOf' | 'allOf', SchemaOrRef[]>>;
  /** The enum's JSON values: strings, or numbers/booleans for non-string enums (see `enumType`). */
  enumValues?: Array<string | number | boolean>;
  required?: string[];
  format?: string;
  example?: unknown;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  /**
   * The source had no `type` keyword ("any" schema `{}`, or an object / array
   * / enum identified by its other keywords): export omits `type` too.
   */
  untyped?: boolean;
  /**
   * OpenAPI 3.1 `type: [string, integer]`: `type` holds the first entry (what
   * the editor shows); export writes the whole list while `type` is one of them.
   */
  typeList?: string[];
  /** `additionalProperties` as a schema (the boolean form stays in extraKeywords). */
  additionalProperties?: SchemaOrRef;
  not?: SchemaOrRef;
  /**
   * Targets of `discriminator.mapping` values, keyed by the mapping value text
   * (`#/components/schemas/Cat` or `Cat`). Export writes the target's current
   * name for every mapping value still found here, so renames follow.
   */
  mappingTargets?: Record<string, NodeId>;
  discriminator?: {
    propertyName: string;
    mapping?: Record<string, string>;
  };
  /** OpenAPI 3.0 `nullable` (3.1 `type: [T, 'null']` is imported as this) */
  nullable?: boolean;
  /**
   * JSON type of the values of an `enum` schema. Undefined means "infer from
   * the values" (editor-made enums hold strings).
   */
  enumType?: 'string' | 'integer' | 'number' | 'boolean';
  /**
   * Schema keywords the editor does not model (readOnly, additionalProperties,
   * title, minItems, x-*, ...), kept verbatim so import/export is lossless.
   */
  extraKeywords?: Record<string, unknown>;
}

export interface ParameterDef {
  id: NodeId;
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required: boolean;
  schema: SchemaOrRef;
  description?: string;
  example?: unknown;
  /**
   * Set when the source used `content` instead of `schema`: export writes
   * `content: {[mediaType]: {schema, ...extra}}` with `schema` above.
   */
  content?: { mediaType: string; extra?: ExtraFields };
  extra?: ExtraFields;
}

export interface RequestBody {
  id: NodeId;
  description?: string;
  required: boolean;
  content: Map<string, MediaType>;
  extra?: ExtraFields;
}

export interface MediaType {
  schema: SchemaOrRef;
  example?: unknown;
  /** The source had no `schema`: export omits it while `schema` is still the empty placeholder. */
  schemaOmitted?: boolean;
  extra?: ExtraFields;
}

export interface ResponseDef {
  id: NodeId;
  description: string;
  content?: Map<string, MediaType>;
  headers?: Map<string, ParameterDef>;
  extra?: ExtraFields;
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
  extra?: ExtraFields;
}

export interface OAuthFlows {
  implicit?: OAuthFlow;
  password?: OAuthFlow;
  clientCredentials?: OAuthFlow;
  authorizationCode?: OAuthFlow;
  extra?: ExtraFields;
}

export interface OAuthFlow {
  authorizationUrl?: string;
  tokenUrl?: string;
  refreshUrl?: string;
  scopes: Record<string, string>;
  extra?: ExtraFields;
}

export interface SecurityRequirement {
  schemeId: NodeId;
  scopes: string[];
}

export interface Tag {
  name: string;
  description?: string;
  extra?: ExtraFields;
}

export interface Server {
  url: string;
  description?: string;
  variables?: Record<string, ServerVariable>;
  extra?: ExtraFields;
}

export interface ServerVariable {
  default: string;
  enum?: string[];
  description?: string;
  extra?: ExtraFields;
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
    extra?: ExtraFields;
  };
  license?: {
    name: string;
    url?: string;
    extra?: ExtraFields;
  };
  extra?: ExtraFields;
}

export interface Route {
  id: NodeId;
  path: string;
  method: HttpMethod;
  /** Origin file where this route/operation is stored on disk */
  origin?: FileOrigin;
  summary?: string;
  description?: string;
  operationId?: string;
  tags: string[];
  parameters: ParameterDef[];
  requestBody?: RequestBody;
  responses: Map<string, ResponseDef>;
  security?: SecurityRequirement[];
  deprecated?: boolean;
  extra?: ExtraFields;
  /**
   * Unmodelled fields of the path item (summary, description, servers, x-*).
   * Routes imported from the same path item share one object; export merges
   * those of all routes on a path (first wins).
   */
  pathExtra?: ExtraFields;
}

export interface ApiDocument {
  id: NodeId;
  info: InfoObject;
  servers: Server[];
  routes: Map<NodeId, Route>;
  schemas: Map<NodeId, SchemaNode>;
  securitySchemes: Map<NodeId, SecurityScheme>;
  tags: Tag[];
  /** Document-wide security (OpenAPI root `security`); routes inherit it unless they set their own. */
  security?: SecurityRequirement[];
  /**
   * Unmodelled root keys (externalDocs, x-*, ...). Its `components` entry holds
   * the unmodelled `components` sections (examples, links, callbacks, x-*).
   */
  extra?: ExtraFields;
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
  | 'UPDATE_REQUEST_BODY'
  | 'UPDATE_INFO'
  | 'ADD_SERVER'
  | 'UPDATE_SERVER'
  | 'DELETE_SERVER'
  | 'ADD_SECURITY_SCHEME'
  | 'UPDATE_SECURITY_SCHEME'
  | 'DELETE_SECURITY_SCHEME'
  | 'ADD_TAG'
  | 'UPDATE_TAG'
  | 'DELETE_TAG'
  | 'IMPORT_DOCUMENT'
  | 'RESET_DOCUMENT';

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

/**
 * `target[key] = value` for keys that come from the document (schema names,
 * property names, status codes, extension keys...): a key named `__proto__`
 * becomes an own property instead of replacing the object's prototype.
 */
export function setOwn(target: Record<string, unknown>, key: string, value: unknown): void {
  if (key === '__proto__') {
    Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
  } else {
    target[key] = value;
  }
}
