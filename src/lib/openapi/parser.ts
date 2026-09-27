import * as YAML from 'yaml';
import {
  ApiDocument,
  SchemaNode,
  Route,
  SchemaOrRef,
  ParameterDef,
  ResponseDef,
  RequestBody,
  MediaType,
  SecurityScheme,
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

export function parseYaml(yamlContent: string): ParseResult {
  const errors: ValidationError[] = [];

  // Parse YAML
  let parsed: OpenAPISchema;
  try {
    parsed = YAML.parse(yamlContent);
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
  if (!parsed.openapi || !String(parsed.openapi).startsWith('3.')) {
    errors.push({
      code: 'INVALID_VERSION',
      message: `Unsupported OpenAPI version: ${parsed.openapi}. Only OpenAPI 3.x is supported.`,
      severity: 'error',
      location: { path: ['openapi'] },
    });
  }

  const components: Record<string, RawObject> = {};
  for (const [section, value] of Object.entries(asObject(parsed.components))) {
    components[section] = asObject(value);
  }
  const ctx: ParseContext = { schemaNameToId: new Map(), components, errors };

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
      .map((s) => ({
        url: s.url!,
        description: s.description,
      }));
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

function parseSchema(data: unknown, name: string | undefined, id: NodeId, ctx: ParseContext): SchemaNode {
  const schemaData = asObject(data);

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
  } else if (schemaData.type === 'array') {
    type = 'array';
  } else if (schemaData.type === 'string') {
    type = 'string';
  } else if (schemaData.type === 'number') {
    type = 'number';
  } else if (schemaData.type === 'integer') {
    type = 'integer';
  } else if (schemaData.type === 'boolean') {
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
    schema.enumValues = schemaData.enum as string[];
  }

  if (type === 'oneOf' || type === 'anyOf' || type === 'allOf') {
    const variants = schemaData[type];
    if (Array.isArray(variants)) {
      schema.variants = variants.map((v) => parseSchemaOrRef(v, ctx));
    }
    if (type === 'oneOf' && schemaData.discriminator) {
      const disc = asObject(schemaData.discriminator);
      schema.discriminator = {
        propertyName: disc.propertyName as string,
      };
    }
  }

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

  return scheme;
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
