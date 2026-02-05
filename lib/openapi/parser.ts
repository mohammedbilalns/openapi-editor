import * as YAML from 'yaml';
import {
  ApiDocument,
  SchemaNode,
  Route,
  SchemaOrRef,
  PropertyDef,
  ParameterDef,
  ResponseDef,
  RequestBody,
  MediaType,
  SecurityScheme,
  Server,
  Tag,
  InfoObject,
  NodeId,
  HttpMethod,
  SchemaType,
  ValidationError,
  generateId,
  createEmptyDocument,
} from './types';

interface ParseResult {
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
  components?: {
    schemas?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
  };
  tags?: Array<{
    name?: string;
    description?: string;
  }>;
}

// Map to track schema names to IDs for $ref resolution
const schemaNameToId = new Map<string, NodeId>();

export function parseYaml(yamlContent: string): ParseResult {
  const errors: ValidationError[] = [];
  schemaNameToId.clear();

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
  if (!parsed.openapi || !parsed.openapi.startsWith('3.')) {
    errors.push({
      code: 'INVALID_VERSION',
      message: `Unsupported OpenAPI version: ${parsed.openapi}. Only OpenAPI 3.x is supported.`,
      severity: 'error',
      location: { path: ['openapi'] },
    });
  }

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
  if (parsed.components?.schemas) {
    for (const name of Object.keys(parsed.components.schemas)) {
      const id = generateId();
      schemaNameToId.set(name, id);
    }
  }

  // Parse schemas
  if (parsed.components?.schemas) {
    for (const [name, schemaData] of Object.entries(parsed.components.schemas)) {
      const id = schemaNameToId.get(name)!;
      const schema = parseSchema(schemaData, name, id, errors);
      doc.schemas.set(id, schema);
    }
  }

  // Parse security schemes
  if (parsed.components?.securitySchemes) {
    for (const [name, schemeData] of Object.entries(parsed.components.securitySchemes)) {
      const scheme = parseSecurityScheme(name, schemeData, errors);
      doc.securitySchemes.set(scheme.id, scheme);
    }
  }

  // Parse paths
  if (parsed.paths) {
    for (const [path, pathItem] of Object.entries(parsed.paths)) {
      if (!pathItem || typeof pathItem !== 'object') continue;

      for (const [method, operationData] of Object.entries(pathItem)) {
        if (!isHttpMethod(method)) continue;
        if (!operationData || typeof operationData !== 'object') continue;

        const route = parseOperation(path, method, operationData as Record<string, unknown>, doc, errors);
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

function parseSchema(
  data: unknown,
  name: string | undefined,
  id: NodeId,
  errors: ValidationError[]
): SchemaNode {
  const schemaData = data as Record<string, unknown>;

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
    const props = schemaData.properties as Record<string, unknown>;
    const required = (schemaData.required as string[]) || [];

    for (const [propName, propData] of Object.entries(props)) {
      const propSchema = parseSchemaOrRef(propData, errors);
      schema.properties.set(propName, {
        name: propName,
        schema: propSchema,
        required: required.includes(propName),
        description: (propData as Record<string, unknown>)?.description as string | undefined,
      });
    }

    schema.required = required;
  }

  if (type === 'array' && schemaData.items) {
    schema.items = parseSchemaOrRef(schemaData.items, errors);
  }

  if (type === 'enum' && schemaData.enum) {
    schema.enumValues = schemaData.enum as string[];
  }

  if (['oneOf', 'anyOf', 'allOf'].includes(type)) {
    const variants = schemaData[type] as unknown[];
    if (Array.isArray(variants)) {
      schema.variants = variants.map((v) => parseSchemaOrRef(v, errors));
    }
    if (type === 'oneOf' && schemaData.discriminator) {
      const disc = schemaData.discriminator as Record<string, unknown>;
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

function parseSchemaOrRef(data: unknown, errors: ValidationError[]): SchemaOrRef {
  const schemaData = data as Record<string, unknown>;

  // Check for $ref
  if (schemaData.$ref && typeof schemaData.$ref === 'string') {
    const refPath = schemaData.$ref;
    const match = refPath.match(/^#\/components\/schemas\/(.+)$/);
    if (match) {
      const refName = match[1];
      const targetId = schemaNameToId.get(refName);
      if (targetId) {
        return { kind: 'ref', targetId };
      }
      errors.push({
        code: 'UNRESOLVED_REF',
        message: `Unresolved reference: ${refPath}`,
        severity: 'warning',
        location: {},
      });
    }
  }

  // Inline schema
  const inlineId = generateId();
  return {
    kind: 'inline',
    schema: parseSchema(data, undefined, inlineId, errors),
  };
}

function parseSecurityScheme(
  name: string,
  data: unknown,
  errors: ValidationError[]
): SecurityScheme {
  const schemeData = data as Record<string, unknown>;

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

function parseOperation(
  path: string,
  method: HttpMethod,
  data: Record<string, unknown>,
  doc: ApiDocument,
  errors: ValidationError[]
): Route {
  const route: Route = {
    id: generateId(),
    path,
    method,
    tags: (data.tags as string[]) || [],
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

  // Parse parameters
  if (data.parameters && Array.isArray(data.parameters)) {
    route.parameters = data.parameters.map((p) => parseParameter(p, errors));
  }

  // Parse request body
  if (data.requestBody) {
    route.requestBody = parseRequestBody(data.requestBody as Record<string, unknown>, errors);
  }

  // Parse responses
  if (data.responses && typeof data.responses === 'object') {
    for (const [statusCode, responseData] of Object.entries(data.responses)) {
      const response = parseResponse(responseData as Record<string, unknown>, errors);
      route.responses.set(statusCode, response);
    }
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

function parseParameter(data: unknown, errors: ValidationError[]): ParameterDef {
  const paramData = data as Record<string, unknown>;

  return {
    id: generateId(),
    name: (paramData.name as string) || 'param',
    in: (paramData.in as ParameterDef['in']) || 'query',
    required: (paramData.required as boolean) || false,
    schema: paramData.schema
      ? parseSchemaOrRef(paramData.schema, errors)
      : { kind: 'inline', schema: { id: generateId(), type: 'string' } },
    description: paramData.description as string | undefined,
    example: paramData.example,
  };
}

function parseRequestBody(data: Record<string, unknown>, errors: ValidationError[]): RequestBody {
  const content = new Map<string, MediaType>();

  if (data.content && typeof data.content === 'object') {
    for (const [contentType, mediaData] of Object.entries(data.content)) {
      const media = mediaData as Record<string, unknown>;
      content.set(contentType, {
        schema: media.schema
          ? parseSchemaOrRef(media.schema, errors)
          : { kind: 'inline', schema: { id: generateId(), type: 'object' } },
        example: media.example,
      });
    }
  }

  return {
    id: generateId(),
    description: data.description as string | undefined,
    required: (data.required as boolean) || false,
    content,
  };
}

function parseResponse(data: Record<string, unknown>, errors: ValidationError[]): ResponseDef {
  const response: ResponseDef = {
    id: generateId(),
    description: (data.description as string) || 'Response',
  };

  if (data.content && typeof data.content === 'object') {
    response.content = new Map();
    for (const [contentType, mediaData] of Object.entries(data.content)) {
      const media = mediaData as Record<string, unknown>;
      response.content.set(contentType, {
        schema: media.schema
          ? parseSchemaOrRef(media.schema, errors)
          : { kind: 'inline', schema: { id: generateId(), type: 'object' } },
        example: media.example,
      });
    }
  }

  return response;
}

function isHttpMethod(method: string): method is HttpMethod {
  return ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'].includes(method.toLowerCase());
}
