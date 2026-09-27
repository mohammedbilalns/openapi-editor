import { CORE_SCHEMA, load as loadYaml } from 'js-yaml';
import {
  ApiDocument,
  SchemaNode,
  Route,
  SchemaOrRef,
  ParameterDef,
  ResponseDef,
  RequestBody,
  MediaType,
  OAuthFlow,
  OAuthFlows,
  SecurityRequirement,
  SecurityScheme,
  Server,
  ServerVariable,
  InfoObject,
  NodeId,
  HttpMethod,
  SchemaType,
  ValidationError,
  generateId,
  createEmptyDocument,
} from './types';

export interface ParseResult {
  document: ApiDocument | null;
  errors: ValidationError[];
}

interface OpenAPISchema {
  openapi?: string;
  info?: {
    title?: string;
    version?: string;
    description?: string;
    termsOfService?: string;
    contact?: {
      name?: string;
      url?: string;
      email?: string;
    };
    license?: {
      name?: string;
      url?: string;
    };
  };
  servers?: Array<{
    url?: string;
    description?: string;
  }>;
  paths?: Record<string, Record<string, unknown>>;
  components?: Record<string, Record<string, unknown> | undefined>;
  tags?: Array<{
    name?: string;
    description?: string;
  }>;
}

type RawObject = Record<string, unknown>;

// YAML leaves empty values as null (e.g. `items:` with nothing after it);
// treat anything that is not an object as an empty object.
function asObject(value: unknown): RawObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as RawObject)
    : {};
}

/**
 * Per-parse state. Kept out of module scope so parseYaml is re-entrant and
 * safe to run concurrently (e.g. in a Web Worker).
 */
interface ParseContext {
  /** component schema name -> node id, for $ref resolution */
  schemaNameToId: Map<string, NodeId>;
  /** security scheme name -> node id, for security requirements */
  securitySchemeNameToId: Map<string, NodeId>;
  /** raw `components` object, for resolving parameter/response/... refs */
  components: Record<string, RawObject>;
  errors: ValidationError[];
}

const MAX_REF_HOPS = 16;

/** Decode one JSON-pointer segment of a local $ref ("~1" -> "/", "~0" -> "~", %xx). */
function decodePointerSegment(segment: string): string {
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // keep as is
  }
  return decoded.replace(/~1/g, '/').replace(/~0/g, '~');
}

/**
 * Follow `$ref: '#/components/<section>/<name>'` (possibly chained) to the raw
 * component object. Non-ref input is returned as is. Returns null (and records
 * a warning) when the reference cannot be resolved.
 */
function resolveComponent(data: unknown, section: string, ctx: ParseContext): RawObject | null {
  let current = asObject(data);
  for (let hops = 0; typeof current.$ref === 'string'; hops++) {
    const ref = current.$ref;
    const prefix = `#/components/${section}/`;
    const target = ref.startsWith(prefix) && hops < MAX_REF_HOPS
      ? ctx.components[section]?.[decodePointerSegment(ref.slice(prefix.length))]
      : undefined;
    if (target === undefined) {
      ctx.errors.push({
        code: 'UNRESOLVED_REF',
        message: `Unresolved reference: ${ref}`,
        severity: 'warning',
        location: {},
      });
      return null;
    }
    current = asObject(target);
  }
  return current;
}

/**
 * YAML/JSON text -> plain JS value.
 *
 * JSON (the usual format of large published specs) goes through JSON.parse,
 * ~80x faster than any YAML parser; anything else, or JSON that fails to
 * parse, goes through js-yaml (~13x faster than the `yaml` package on large
 * specs). CORE_SCHEMA is YAML 1.2 core: no timestamps (so `version: 2024-06-20`
 * stays a string) and no `<<` merge keys. Duplicate keys are an error.
 */
export function parseText(text: string): unknown {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const first = source.match(/\S/)?.[0];
  if (first === '{' || first === '[') {
    try {
      return JSON.parse(source);
    } catch {
      // not strict JSON (comments, trailing commas, YAML flow style): fall through
    }
  }
  return loadYaml(source, { schema: CORE_SCHEMA });
}

export function parseYaml(yamlContent: string): ParseResult {
  const errors: ValidationError[] = [];

  // Parse YAML
  let parsed: OpenAPISchema;
  try {
    parsed = parseText(yamlContent) as OpenAPISchema;
  } catch (error) {
    return {
      document: null,
      errors: [
        {
          code: 'YAML_PARSE_ERROR',
          message: `Failed to parse YAML: ${error instanceof Error ? error.message : 'Unknown error'}`,
          severity: 'error',
          location: {},
        },
      ],
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      document: null,
      errors: [
        {
          code: 'INVALID_DOCUMENT',
          message: 'Document is empty or invalid',
          severity: 'error',
          location: {},
        },
      ],
    };
  }

  // Validate OpenAPI version
  const version = parsed.openapi === undefined ? '' : String(parsed.openapi);
  if (!version.startsWith('3.')) {
    errors.push({
      code: 'INVALID_VERSION',
      message: `Unsupported OpenAPI version: ${parsed.openapi}. Only OpenAPI 3.x is supported.`,
      severity: 'error',
      location: { path: ['openapi'] },
    });
  } else if (!version.startsWith('3.0')) {
    errors.push({
      code: 'OPENAPI_31_IMPORTED_AS_30',
      message: `OpenAPI ${version} is edited and exported as 3.0.3; keywords that only exist in ${version} are kept verbatim but may not be valid 3.0.`,
      severity: 'warning',
      location: { path: ['openapi'] },
    });
  }

  const components: Record<string, RawObject> = {};
  for (const [section, value] of Object.entries(asObject(parsed.components))) {
    components[section] = asObject(value);
  }
  const ctx: ParseContext = { schemaNameToId: new Map(), securitySchemeNameToId: new Map(), components, errors };

  // Create document
  const doc = createEmptyDocument();

  // Parse info
  if (parsed.info) {
    doc.info = parseInfo(parsed.info, errors);
  } else {
    errors.push({
      code: 'MISSING_INFO',
      message: 'Missing required "info" object',
      severity: 'error',
      location: { path: ['info'] },
    });
  }

  // Parse servers
  if (parsed.servers && Array.isArray(parsed.servers)) {
    doc.servers = parsed.servers
      .filter((s) => s && s.url)
      .map((s) => {
        const server: Server = { url: s.url!, description: s.description };
        const rawVariables = Object.entries(asObject((s as RawObject).variables));
        if (rawVariables.length > 0) {
          server.variables = {};
          for (const [name, value] of rawVariables) {
            const v = asObject(value);
            const variable: ServerVariable = { default: v.default === undefined ? '' : String(v.default) };
            if (Array.isArray(v.enum)) variable.enum = v.enum.map(String);
            if (typeof v.description === 'string') variable.description = v.description;
            server.variables[name] = variable;
          }
        }
        return server;
      });
  }

  // Parse tags
  if (parsed.tags && Array.isArray(parsed.tags)) {
    doc.tags = parsed.tags
      .filter((t) => t && t.name)
      .map((t) => ({
        name: t.name!,
        description: t.description,
      }));
  }

  // First pass: register all schema names for $ref resolution
  const rawSchemas = components.schemas ?? {};
  for (const name of Object.keys(rawSchemas)) {
    ctx.schemaNameToId.set(name, generateId());
  }

  // Parse schemas
  for (const [name, schemaData] of Object.entries(rawSchemas)) {
    const id = ctx.schemaNameToId.get(name)!;
    doc.schemas.set(id, parseSchema(schemaData, name, id, ctx));
  }

  // Parse security schemes
  for (const [name, schemeData] of Object.entries(components.securitySchemes ?? {})) {
    const scheme = parseSecurityScheme(name, schemeData);
    doc.securitySchemes.set(scheme.id, scheme);
    ctx.securitySchemeNameToId.set(name, scheme.id);
  }

  // Document-wide security
  const rootSecurity = (parsed as RawObject).security;
  if (Array.isArray(rootSecurity)) {
    doc.security = parseSecurityRequirements(rootSecurity, ctx);
  }

  // Parse paths
  if (parsed.paths) {
    for (const [path, pathItemData] of Object.entries(parsed.paths)) {
      if (!pathItemData || typeof pathItemData !== 'object') continue;
      const pathItem = asObject(pathItemData);
      const pathParameters = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];

      for (const [key, operationData] of Object.entries(pathItem)) {
        const method = key.toLowerCase();
        if (!isHttpMethod(method)) continue;
        if (!operationData || typeof operationData !== 'object') continue;

        const route = parseOperation(path, method, operationData as RawObject, pathParameters, ctx);
        doc.routes.set(route.id, route);
      }
    }
  }

  return { document: doc, errors };
}

function parseInfo(info: OpenAPISchema['info'], errors: ValidationError[]): InfoObject {
  const result: InfoObject = {
    title: info?.title || 'Untitled API',
    version: info?.version || '1.0.0',
  };

  if (!info?.title) {
    errors.push({
      code: 'MISSING_TITLE',
      message: 'Missing required "info.title"',
      severity: 'warning',
      location: { path: ['info', 'title'] },
    });
  }

  if (!info?.version) {
    errors.push({
      code: 'MISSING_VERSION',
      message: 'Missing required "info.version"',
      severity: 'warning',
      location: { path: ['info', 'version'] },
    });
  }

  if (info?.description) {
    result.description = info.description;
  }
  if (info?.termsOfService) {
    result.termsOfService = info.termsOfService;
  }
  if (info?.contact) {
    result.contact = {
      name: info.contact.name,
      url: info.contact.url,
      email: info.contact.email,
    };
  }
  if (info?.license?.name) {
    result.license = {
      name: info.license.name,
      url: info.license.url,
    };
  }

  return result;
}

// Keywords mapped onto SchemaNode fields; everything else goes to extraKeywords.
const MODELED_SCHEMA_KEYWORDS = new Set([
  '$ref', 'type', 'description', 'properties', 'required', 'items', 'oneOf', 'anyOf', 'allOf',
  'enum', 'format', 'example', 'default', 'minimum', 'maximum', 'minLength', 'maxLength',
  'pattern', 'discriminator', 'nullable',
]);

function parseSchema(data: unknown, name: string | undefined, id: NodeId, ctx: ParseContext): SchemaNode {
  const schemaData = asObject(data);

  // OpenAPI 3.1 allows `type: [string, 'null']`; map it to 3.0 `nullable`
  let rawType = schemaData.type;
  let nullable = schemaData.nullable === true;
  if (Array.isArray(rawType)) {
    const nonNull = rawType.filter((t) => t !== 'null');
    if (nonNull.length < rawType.length) nullable = true;
    rawType = nonNull[0];
  }

  // Determine schema type
  let type: SchemaType = 'object';

  if (schemaData.oneOf) {
    type = 'oneOf';
  } else if (schemaData.anyOf) {
    type = 'anyOf';
  } else if (schemaData.allOf) {
    type = 'allOf';
  } else if (schemaData.enum) {
    type = 'enum';
  } else if (rawType === 'array') {
    type = 'array';
  } else if (rawType === 'string') {
    type = 'string';
  } else if (rawType === 'number') {
    type = 'number';
  } else if (rawType === 'integer') {
    type = 'integer';
  } else if (rawType === 'boolean') {
    type = 'boolean';
  }

  const schema: SchemaNode = {
    id,
    name,
    type,
    description: schemaData.description as string | undefined,
  };

  // Parse based on type
  if (type === 'object' && schemaData.properties) {
    schema.properties = new Map();
    const props = asObject(schemaData.properties);
    const required = Array.isArray(schemaData.required) ? (schemaData.required as string[]) : [];
    const requiredSet = new Set(required);

    for (const [propName, propData] of Object.entries(props)) {
      schema.properties.set(propName, {
        name: propName,
        schema: parseSchemaOrRef(propData, ctx),
        required: requiredSet.has(propName),
        description: asObject(propData).description as string | undefined,
      });
    }

    schema.required = required;
  }

  if (type === 'array' && schemaData.items) {
    schema.items = parseSchemaOrRef(schemaData.items, ctx);
  }

  if (type === 'enum' && schemaData.enum) {
    schema.enumValues = schemaData.enum as Array<string | number | boolean>;
    if (rawType === 'integer' || rawType === 'number' || rawType === 'boolean') {
      schema.enumType = rawType;
    }
  }

  if (type === 'oneOf' || type === 'anyOf' || type === 'allOf') {
    const variants = schemaData[type];
    if (Array.isArray(variants)) {
      schema.variants = variants.map((v) => parseSchemaOrRef(v, ctx));
    }
    if (schemaData.discriminator) {
      const disc = asObject(schemaData.discriminator);
      schema.discriminator = {
        propertyName: disc.propertyName as string,
      };
      const mapping = asObject(disc.mapping);
      if (Object.keys(mapping).length > 0) {
        schema.discriminator.mapping = mapping as Record<string, string>;
      }
    }
  }

  if (nullable) schema.nullable = true;

  let extra: RawObject | undefined;
  for (const key in schemaData) {
    if (MODELED_SCHEMA_KEYWORDS.has(key)) continue;
    (extra ??= {})[key] = schemaData[key];
  }
  if (extra) schema.extraKeywords = extra;

  // Primitive constraints
  if (schemaData.format) schema.format = schemaData.format as string;
  if (schemaData.minimum !== undefined) schema.minimum = schemaData.minimum as number;
  if (schemaData.maximum !== undefined) schema.maximum = schemaData.maximum as number;
  if (schemaData.minLength !== undefined) schema.minLength = schemaData.minLength as number;
  if (schemaData.maxLength !== undefined) schema.maxLength = schemaData.maxLength as number;
  if (schemaData.pattern) schema.pattern = schemaData.pattern as string;
  if (schemaData.example !== undefined) schema.example = schemaData.example;
  if (schemaData.default !== undefined) schema.default = schemaData.default;

  return schema;
}

function parseSchemaOrRef(data: unknown, ctx: ParseContext): SchemaOrRef {
  const schemaData = asObject(data);

  // Check for $ref
  if (typeof schemaData.$ref === 'string') {
    const refPath = schemaData.$ref;
    const match = refPath.match(/^#\/components\/schemas\/(.+)$/);
    if (match) {
      const targetId = ctx.schemaNameToId.get(decodePointerSegment(match[1]));
      if (targetId) {
        return { kind: 'ref', targetId };
      }
    }
    ctx.errors.push({
      code: 'UNRESOLVED_REF',
      message: `Unresolved reference: ${refPath}`,
      severity: 'warning',
      location: {},
    });
    // Keep the reference text (e.g. an external file ref) so export is lossless
    const unresolved = parseSchema(schemaData, undefined, generateId(), ctx);
    unresolved.extraKeywords = { $ref: refPath, ...unresolved.extraKeywords };
    return { kind: 'inline', schema: unresolved };
  }

  // Inline schema
  return {
    kind: 'inline',
    schema: parseSchema(schemaData, undefined, generateId(), ctx),
  };
}

function parseSecurityScheme(name: string, data: unknown): SecurityScheme {
  const schemeData = asObject(data);

  const scheme: SecurityScheme = {
    id: generateId(),
    name,
    type: (schemeData.type as SecurityScheme['type']) || 'http',
  };

  if (schemeData.description) {
    scheme.description = schemeData.description as string;
  }

  if (scheme.type === 'http') {
    scheme.scheme = (schemeData.scheme as string) || 'bearer';
    if (schemeData.bearerFormat) {
      scheme.bearerFormat = schemeData.bearerFormat as string;
    }
  }

  if (scheme.type === 'apiKey') {
    scheme.in = (schemeData.in as 'header' | 'query' | 'cookie') || 'header';
    scheme.paramName = (schemeData.name as string) || 'api_key';
  }

  if (scheme.type === 'openIdConnect') {
    scheme.openIdConnectUrl = schemeData.openIdConnectUrl as string;
  }

  if (scheme.type === 'oauth2') {
    const flows: OAuthFlows = {};
    const rawFlows = asObject(schemeData.flows);
    for (const key of ['implicit', 'password', 'clientCredentials', 'authorizationCode'] as const) {
      if (!rawFlows[key]) continue;
      const raw = asObject(rawFlows[key]);
      const flow: OAuthFlow = { scopes: { ...(asObject(raw.scopes) as Record<string, string>) } };
      if (typeof raw.authorizationUrl === 'string') flow.authorizationUrl = raw.authorizationUrl;
      if (typeof raw.tokenUrl === 'string') flow.tokenUrl = raw.tokenUrl;
      if (typeof raw.refreshUrl === 'string') flow.refreshUrl = raw.refreshUrl;
      flows[key] = flow;
    }
    scheme.flows = flows;
  }

  return scheme;
}

/**
 * Parse a security requirement list. The model stores one scheme per
 * requirement (alternatives, OR); an empty requirement `{}` (anonymous access)
 * or a requirement combining several schemes (AND) cannot be represented and
 * is reported.
 */
function parseSecurityRequirements(list: unknown[], ctx: ParseContext): SecurityRequirement[] {
  const result: SecurityRequirement[] = [];
  for (const raw of list) {
    const entries = Object.entries(asObject(raw));
    if (entries.length !== 1) {
      ctx.errors.push({
        code: 'UNSUPPORTED_SECURITY_REQUIREMENT',
        message:
          entries.length === 0
            ? 'Optional security ({}) is not supported and was dropped'
            : `Combined security requirement (${entries.map(([n]) => n).join(' AND ')}) was split into alternatives`,
        severity: 'warning',
        location: {},
      });
    }
    for (const [name, scopes] of entries) {
      const schemeId = ctx.securitySchemeNameToId.get(name);
      if (!schemeId) {
        ctx.errors.push({
          code: 'UNRESOLVED_SECURITY_SCHEME',
          message: `Unknown security scheme: ${name}`,
          severity: 'warning',
          location: {},
        });
        continue;
      }
      result.push({ schemeId, scopes: Array.isArray(scopes) ? scopes.map(String) : [] });
    }
  }
  return result;
}

/** Resolve and parse a list of raw parameters, skipping empty or unresolvable entries. */
function parseParameterList(list: unknown[], ctx: ParseContext): ParameterDef[] {
  const result: ParameterDef[] = [];
  for (const raw of list) {
    if (raw === null || typeof raw !== 'object') continue;
    const resolved = resolveComponent(raw, 'parameters', ctx);
    if (resolved) result.push(parseParameter(resolved, ctx));
  }
  return result;
}

function parseOperation(
  path: string,
  method: HttpMethod,
  data: RawObject,
  pathParameters: unknown[],
  ctx: ParseContext
): Route {
  const route: Route = {
    id: generateId(),
    path,
    method,
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    parameters: [],
    responses: new Map(),
  };

  if (data.summary) {
    route.summary = data.summary as string;
  }
  if (data.description) {
    route.description = data.description as string;
  }
  if (data.operationId) {
    route.operationId = data.operationId as string;
  }
  if (data.deprecated) {
    route.deprecated = true;
  }
  if (Array.isArray(data.security)) {
    // an explicit empty list means "no authentication" and overrides the root
    route.security = parseSecurityRequirements(data.security, ctx);
  }

  // Parameters: path-item level ones apply to every operation unless the
  // operation redefines the same name + location.
  const own = parseParameterList(Array.isArray(data.parameters) ? data.parameters : [], ctx);
  const inherited = parseParameterList(pathParameters, ctx).filter(
    (p) => !own.some((o) => o.name === p.name && o.in === p.in)
  );
  route.parameters = [...inherited, ...own];

  // Parse request body
  if (data.requestBody) {
    const body = resolveComponent(data.requestBody, 'requestBodies', ctx);
    if (body) route.requestBody = parseRequestBody(body, ctx);
  }

  // Parse responses
  for (const [statusCode, responseData] of Object.entries(asObject(data.responses))) {
    const resolved = resolveComponent(responseData, 'responses', ctx);
    route.responses.set(statusCode, parseResponse(resolved ?? {}, ctx));
  }

  // Ensure at least one response
  if (route.responses.size === 0) {
    route.responses.set('200', {
      id: generateId(),
      description: 'Successful response',
    });
  }

  return route;
}

function parseParameter(paramData: RawObject, ctx: ParseContext): ParameterDef {
  return {
    id: generateId(),
    name: (paramData.name as string) || 'param',
    in: (paramData.in as ParameterDef['in']) || 'query',
    required: (paramData.required as boolean) || false,
    schema: paramData.schema
      ? parseSchemaOrRef(paramData.schema, ctx)
      : { kind: 'inline', schema: { id: generateId(), type: 'string' } },
    description: paramData.description as string | undefined,
    example: paramData.example,
  };
}

function parseContent(content: unknown, ctx: ParseContext, emptySchemaType: SchemaNode['type']): Map<string, MediaType> {
  const result = new Map<string, MediaType>();
  for (const [contentType, mediaData] of Object.entries(asObject(content))) {
    const media = asObject(mediaData);
    result.set(contentType, {
      schema: media.schema
        ? parseSchemaOrRef(media.schema, ctx)
        : { kind: 'inline', schema: { id: generateId(), type: emptySchemaType } },
      example: media.example,
    });
  }
  return result;
}

function parseRequestBody(data: RawObject, ctx: ParseContext): RequestBody {
  return {
    id: generateId(),
    description: data.description as string | undefined,
    required: (data.required as boolean) || false,
    content: parseContent(data.content, ctx, 'object'),
  };
}

function parseResponse(data: RawObject, ctx: ParseContext): ResponseDef {
  const response: ResponseDef = {
    id: generateId(),
    description: (data.description as string) || 'Response',
  };

  if (data.content && typeof data.content === 'object') {
    response.content = parseContent(data.content, ctx, 'object');
  }

  if (data.headers && typeof data.headers === 'object') {
    const headers = new Map<string, ParameterDef>();
    for (const [headerName, headerData] of Object.entries(asObject(data.headers))) {
      const resolved = resolveComponent(headerData, 'headers', ctx);
      if (!resolved) continue;
      headers.set(headerName, parseParameter({ ...resolved, name: headerName, in: 'header' }, ctx));
    }
    if (headers.size > 0) response.headers = headers;
  }

  return response;
}

const HTTP_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch', 'options', 'head']);

function isHttpMethod(method: string): method is HttpMethod {
  return HTTP_METHODS.has(method);
}
