import { dump as dumpYaml } from 'js-yaml';
import {
  ApiDocument,
  SchemaNode,
  Route,
  SchemaOrRef,
  ParameterDef,
  ResponseDef,
  RequestBody,
  SecurityRequirement,
  SecurityScheme,
  NodeId,
} from './types';
import { forEachRefInRoute, forEachRefInSchema } from './refs';

// OpenAPI output types
interface OpenAPIDocument {
  openapi: string;
  info: {
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
  };
  servers?: Array<{
    url: string;
    description?: string;
    variables?: Record<string, unknown>;
  }>;
  paths: Record<string, Record<string, unknown>>;
  components?: {
    schemas?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
  };
  tags?: Array<{
    name: string;
    description?: string;
  }>;
  security?: Array<Record<string, string[]>>;
}

/**
 * ApiDocument -> YAML text.
 *
 * Incremental: the YAML of every operation and component schema is cached per
 * node object, so after an edit only the changed nodes are re-emitted and the
 * text is re-assembled by concatenation. This relies on the store's structural
 * sharing (nodes are replaced, never mutated). Output is byte-identical to
 * stringifyYaml(serializeDocument(doc)).
 */
export function serializeToYaml(doc: ApiDocument): string {
  return emitIncremental(doc);
}

/**
 * Plain OpenAPI object -> YAML text (js-yaml, ~5x faster than the `yaml`
 * package on large specs).
 * - noRefs: shared objects are written out in full, never as &anchor/*alias;
 * - default schema on output so strings a YAML 1.1 reader would retype
 *   (2024-06-20, yes, on, 1e3...) are quoted for every consumer;
 * - lineWidth -1: no folding of long descriptions;
 * - skipInvalid: undefined values are omitted instead of throwing.
 */
export function stringifyYaml(value: unknown): string {
  return dumpYaml(value, { indent: 2, lineWidth: -1, noRefs: true, quotingType: '"', skipInvalid: true });
}

export function serializeDocument(doc: ApiDocument): OpenAPIDocument {
  return buildDocument(doc, false);
}

/**
 * With `shell`, component schema values are the SchemaNodes themselves and
 * path items map methods to Routes (not serialized), for emitIncremental.
 */
function buildDocument(doc: ApiDocument, shell: boolean): OpenAPIDocument {
  const output: OpenAPIDocument = {
    openapi: '3.0.3',
    info: {
      title: doc.info.title,
      version: doc.info.version,
    },
    paths: {},
  };

  // Info
  if (doc.info.description) {
    output.info.description = doc.info.description;
  }
  if (doc.info.termsOfService) {
    output.info.termsOfService = doc.info.termsOfService;
  }
  if (doc.info.contact && (doc.info.contact.name || doc.info.contact.email || doc.info.contact.url)) {
    output.info.contact = {};
    if (doc.info.contact.name) output.info.contact.name = doc.info.contact.name;
    if (doc.info.contact.email) output.info.contact.email = doc.info.contact.email;
    if (doc.info.contact.url) output.info.contact.url = doc.info.contact.url;
  }
  if (doc.info.license?.name) {
    output.info.license = { name: doc.info.license.name };
    if (doc.info.license.url) output.info.license.url = doc.info.license.url;
  }

  // Servers
  if (doc.servers.length > 0) {
    output.servers = doc.servers.map((s) => ({
      url: s.url,
      ...(s.description && { description: s.description }),
      ...(s.variables && Object.keys(s.variables).length > 0 && { variables: s.variables }),
    }));
  }

  // Tags
  if (doc.tags.length > 0) {
    output.tags = doc.tags.map((t) => ({
      name: t.name,
      ...(t.description && { description: t.description }),
    }));
  }

  // Components
  const schemas: Record<string, unknown> = {};
  const securitySchemes: Record<string, unknown> = {};

  // Serialize named schemas
  for (const [id, schema] of doc.schemas) {
    if (schema.name) {
      schemas[schema.name] = shell ? schema : serializeSchema(schema, doc);
    }
  }

  // Serialize security schemes
  for (const [id, scheme] of doc.securitySchemes) {
    securitySchemes[scheme.name] = serializeSecurityScheme(scheme);
  }

  if (Object.keys(schemas).length > 0 || Object.keys(securitySchemes).length > 0) {
    output.components = {};
    if (Object.keys(schemas).length > 0) {
      output.components.schemas = schemas;
    }
    if (Object.keys(securitySchemes).length > 0) {
      output.components.securitySchemes = securitySchemes;
    }
  }

  const rootSecurity = serializeSecurity(doc.security, doc);
  if (rootSecurity) {
    output.security = rootSecurity;
  }

  // Paths - group routes by path
  const pathGroups = new Map<string, Route[]>();
  for (const route of doc.routes.values()) {
    const routes = pathGroups.get(route.path) || [];
    routes.push(route);
    pathGroups.set(route.path, routes);
  }

  // Sort paths alphabetically
  const sortedPaths = Array.from(pathGroups.keys()).sort();
  for (const path of sortedPaths) {
    const routes = pathGroups.get(path)!;
    output.paths[path] = {};
    for (const route of routes) {
      output.paths[path][route.method] = shell ? route : serializeOperation(route, doc);
    }
  }

  return output;
}

function inferEnumType(values: unknown[] | undefined): NonNullable<SchemaNode['enumType']> {
  if (values && values.length > 0) {
    if (values.every((v) => typeof v === 'number')) {
      return values.every((v) => Number.isInteger(v)) ? 'integer' : 'number';
    }
    if (values.every((v) => typeof v === 'boolean')) return 'boolean';
  }
  return 'string';
}

function serializeSchema(schema: SchemaNode, doc: ApiDocument): Record<string, unknown> {
  // An unresolved reference imported verbatim (e.g. to an external file)
  if (schema.extraKeywords && typeof schema.extraKeywords.$ref === 'string') {
    return { ...schema.extraKeywords };
  }

  const result: Record<string, unknown> = {};

  if (schema.type === 'oneOf' || schema.type === 'anyOf' || schema.type === 'allOf') {
    // Composition types
    if (schema.variants && schema.variants.length > 0) {
      result[schema.type] = schema.variants.map((v) => serializeSchemaOrRef(v, doc));
    }
    if (schema.discriminator?.propertyName) {
      const discriminator: Record<string, unknown> = { propertyName: schema.discriminator.propertyName };
      if (schema.discriminator.mapping && Object.keys(schema.discriminator.mapping).length > 0) {
        discriminator.mapping = schema.discriminator.mapping;
      }
      result.discriminator = discriminator;
    }
    if (schema.description) {
      result.description = schema.description;
    }
  } else if (schema.type === 'enum') {
    result.type = schema.enumType ?? inferEnumType(schema.enumValues);
    if (schema.format) {
      result.format = schema.format;
    }
    if (schema.enumValues && schema.enumValues.length > 0) {
      result.enum = schema.enumValues;
    }
    if (schema.description) {
      result.description = schema.description;
    }
  } else if (schema.type === 'array') {
    result.type = 'array';
    if (schema.items) {
      result.items = serializeSchemaOrRef(schema.items, doc);
    }
    if (schema.description) {
      result.description = schema.description;
    }
  } else if (schema.type === 'object') {
    result.type = 'object';
    if (schema.properties && schema.properties.size > 0) {
      const props: Record<string, unknown> = {};
      for (const [name, prop] of schema.properties) {
        const propSchema = serializeSchemaOrRef(prop.schema, doc);
        if (prop.description) {
          propSchema.description = prop.description;
        }
        props[name] = propSchema;
      }
      result.properties = props;
    }
    if (schema.required && schema.required.length > 0) {
      result.required = schema.required;
    }
    if (schema.description) {
      result.description = schema.description;
    }
  } else {
    // Primitives
    result.type = schema.type;
    if (schema.description) {
      result.description = schema.description;
    }
    if (schema.format) {
      result.format = schema.format;
    }
    if (schema.minimum !== undefined) {
      result.minimum = schema.minimum;
    }
    if (schema.maximum !== undefined) {
      result.maximum = schema.maximum;
    }
    if (schema.minLength !== undefined) {
      result.minLength = schema.minLength;
    }
    if (schema.maxLength !== undefined) {
      result.maxLength = schema.maxLength;
    }
    if (schema.pattern) {
      result.pattern = schema.pattern;
    }
  }

  // Keywords valid for every schema kind
  if (schema.nullable) {
    result.nullable = true;
  }
  if (schema.example !== undefined) {
    result.example = schema.example;
  }
  if (schema.default !== undefined) {
    result.default = schema.default;
  }
  if (schema.extraKeywords) {
    for (const [key, value] of Object.entries(schema.extraKeywords)) {
      if (!(key in result)) result[key] = value;
    }
  }

  return result;
}

function serializeSchemaOrRef(schemaOrRef: SchemaOrRef, doc: ApiDocument): Record<string, unknown> {
  if (schemaOrRef.kind === 'ref') {
    const targetSchema = doc.schemas.get(schemaOrRef.targetId);
    if (targetSchema?.name) {
      return { $ref: `#/components/schemas/${targetSchema.name}` };
    }
    // Fallback for anonymous schemas - inline them
    if (targetSchema) {
      return serializeSchema(targetSchema, doc);
    }
    return { type: 'object' }; // Fallback
  }
  return serializeSchema(schemaOrRef.schema, doc);
}

function serializeOperation(route: Route, doc: ApiDocument): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (route.summary) {
    result.summary = route.summary;
  }
  if (route.description) {
    result.description = route.description;
  }
  if (route.operationId) {
    result.operationId = route.operationId;
  }
  if (route.tags.length > 0) {
    result.tags = route.tags;
  }
  if (route.deprecated) {
    result.deprecated = true;
  }

  // Parameters
  if (route.parameters.length > 0) {
    result.parameters = route.parameters.map((p) => serializeParameter(p, doc));
  }

  // Request body
  if (route.requestBody) {
    result.requestBody = serializeRequestBody(route.requestBody, doc);
  }

  // Responses
  const responses: Record<string, unknown> = {};
  for (const [statusCode, response] of route.responses) {
    responses[statusCode] = serializeResponse(response, doc);
  }
  result.responses = responses;

  // Security
  const security = serializeSecurity(route.security, doc);
  if (security) {
    result.security = security;
  }

  return result;
}

/**
 * Requirements pointing at a deleted scheme are dropped (an empty `{}` would
 * mean "anonymous access allowed"). An explicitly empty list is kept, since it
 * means "no authentication"; a list that only held dangling requirements is
 * omitted so the operation falls back to the document security.
 */
function serializeSecurity(
  requirements: SecurityRequirement[] | undefined,
  doc: ApiDocument
): Array<Record<string, string[]>> | undefined {
  if (!requirements) return undefined;
  const result: Array<Record<string, string[]>> = [];
  for (const req of requirements) {
    const scheme = doc.securitySchemes.get(req.schemeId);
    if (scheme) result.push({ [scheme.name]: req.scopes });
  }
  if (result.length === 0 && requirements.length > 0) return undefined;
  return result;
}

function serializeParameter(param: ParameterDef, doc: ApiDocument): Record<string, unknown> {
  const result: Record<string, unknown> = {
    name: param.name,
    in: param.in,
  };

  if (param.required) {
    result.required = true;
  }
  if (param.description) {
    result.description = param.description;
  }

  result.schema = serializeSchemaOrRef(param.schema, doc);

  if (param.example !== undefined) {
    result.example = param.example;
  }

  return result;
}

function serializeRequestBody(body: RequestBody, doc: ApiDocument): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (body.description) {
    result.description = body.description;
  }
  if (body.required) {
    result.required = true;
  }

  const content: Record<string, unknown> = {};
  for (const [contentType, media] of body.content) {
    content[contentType] = {
      schema: serializeSchemaOrRef(media.schema, doc),
    };
    if (media.example !== undefined) {
      (content[contentType] as Record<string, unknown>).example = media.example;
    }
  }
  result.content = content;

  return result;
}

function serializeResponse(response: ResponseDef, doc: ApiDocument): Record<string, unknown> {
  const result: Record<string, unknown> = {
    description: response.description,
  };

  if (response.headers && response.headers.size > 0) {
    const headers: Record<string, unknown> = {};
    for (const [name, header] of response.headers) {
      const out: Record<string, unknown> = {};
      if (header.description) out.description = header.description;
      if (header.required) out.required = true;
      out.schema = serializeSchemaOrRef(header.schema, doc);
      if (header.example !== undefined) out.example = header.example;
      headers[name] = out;
    }
    result.headers = headers;
  }

  if (response.content && response.content.size > 0) {
    const content: Record<string, unknown> = {};
    for (const [contentType, media] of response.content) {
      content[contentType] = {
        schema: serializeSchemaOrRef(media.schema, doc),
      };
      if (media.example !== undefined) {
        (content[contentType] as Record<string, unknown>).example = media.example;
      }
    }
    result.content = content;
  }

  return result;
}

function serializeSecurityScheme(scheme: SecurityScheme): Record<string, unknown> {
  const result: Record<string, unknown> = {
    type: scheme.type,
  };

  if (scheme.description) {
    result.description = scheme.description;
  }

  if (scheme.type === 'http') {
    result.scheme = scheme.scheme || 'bearer';
    if (scheme.bearerFormat) {
      result.bearerFormat = scheme.bearerFormat;
    }
  }

  if (scheme.type === 'apiKey') {
    result.in = scheme.in || 'header';
    result.name = scheme.paramName || 'api_key';
  }

  if (scheme.type === 'oauth2' && scheme.flows) {
    result.flows = scheme.flows;
  }

  if (scheme.type === 'openIdConnect' && scheme.openIdConnectUrl) {
    result.openIdConnectUrl = scheme.openIdConnectUrl;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Incremental YAML emission
// ---------------------------------------------------------------------------

interface Fragment {
  text: string;
  /** [schemaId, nameAtEmit, schemaId, nameAtEmit, ...] for every ref in the node */
  deps: string[];
}

interface FragmentCache {
  /** global inputs of every fragment: security scheme names and, when unnamed (inlined) schemas exist, all schema names */
  context: string;
  operations: WeakMap<Route, Fragment>;
  schemas: WeakMap<SchemaNode, Fragment>;
  keys: Map<string, string>;
}

let fragmentCache: FragmentCache | null = null;
const nodeTokens = new WeakMap<object, number>();
let nextNodeToken = 0;

function nodeToken(node: object): number {
  let token = nodeTokens.get(node);
  if (token === undefined) {
    token = nextNodeToken++;
    nodeTokens.set(node, token);
  }
  return token;
}

function contextSignature(doc: ApiDocument): string {
  const parts: string[] = [];
  let hasUnnamed = false;
  for (const schema of doc.schemas.values()) {
    if (!schema.name) hasUnnamed = true;
  }
  if (hasUnnamed) {
    // Refs to unnamed schemas are inlined (recursively), so any schema change
    // may affect any fragment: fall back to invalidating on every rename.
    for (const schema of doc.schemas.values()) {
      parts.push(schema.id, schema.name ? schema.name : `#${nodeToken(schema)}`);
    }
  }
  parts.push('|');
  for (const scheme of doc.securitySchemes.values()) parts.push(scheme.id, scheme.name);
  return parts.join('\u0000');
}

/** Indent every non-empty line (empty lines inside block scalars stay empty). */
function indentLines(text: string, spaces: string): string {
  return text.replace(/^(?=.)/gm, spaces);
}

/** Schema names this node's YAML embeds (in $ref strings). */
function collectDeps(node: Route | SchemaNode, doc: ApiDocument, isRoute: boolean): string[] {
  const deps: string[] = [];
  const visit = (targetId: string) => {
    deps.push(targetId, doc.schemas.get(targetId)?.name ?? '');
  };
  if (isRoute) forEachRefInRoute(node as Route, visit);
  else forEachRefInSchema(node as SchemaNode, visit);
  return deps;
}

function depsValid(fragment: Fragment, doc: ApiDocument): boolean {
  const { deps } = fragment;
  for (let i = 0; i < deps.length; i += 2) {
    if ((doc.schemas.get(deps[i])?.name ?? '') !== deps[i + 1]) return false;
  }
  return true;
}

const NULL_SUFFIX = ': null\n';

/** The YAML rendering of a mapping key, e.g. `/pets/{id}` or `"200"`; null for complex keys. */
function keyText(cache: FragmentCache, key: string): string | null {
  let text = cache.keys.get(key);
  if (text === undefined) {
    const line = stringifyYaml({ [key]: null });
    if (!line.endsWith(NULL_SUFFIX) || line.startsWith('? ')) return null;
    text = line.slice(0, -NULL_SUFFIX.length);
    cache.keys.set(key, text);
  }
  return text;
}

function emitIncremental(doc: ApiDocument): string {
  const context = contextSignature(doc);
  if (!fragmentCache || fragmentCache.context !== context) {
    fragmentCache = { context, operations: new WeakMap(), schemas: new WeakMap(), keys: new Map() };
  }
  const cache = fragmentCache;
  const shell = buildDocument(doc, true) as unknown as Record<string, unknown>;
  const out: string[] = [];

  for (const [key, value] of Object.entries(shell)) {
    if (key === 'paths') {
      const paths = value as Record<string, Record<string, Route>>;
      if (Object.keys(paths).length === 0) {
        out.push('paths: {}\n');
        continue;
      }
      out.push('paths:\n');
      for (const [path, operations] of Object.entries(paths)) {
        const pathKey = keyText(cache, path);
        if (pathKey === null) return stringifyYaml(serializeDocument(doc));
        out.push(`  ${pathKey}:\n`);
        for (const [method, route] of Object.entries(operations)) {
          let fragment = cache.operations.get(route);
          if (fragment === undefined || !depsValid(fragment, doc)) {
            fragment = {
              text: indentLines(stringifyYaml({ [method]: serializeOperation(route, doc) }), '    '),
              deps: collectDeps(route, doc, true),
            };
            cache.operations.set(route, fragment);
          }
          out.push(fragment.text);
        }
      }
    } else if (key === 'components') {
      const { schemas, ...rest } = value as { schemas?: Record<string, SchemaNode> };
      out.push('components:\n');
      if (schemas) {
        out.push('  schemas:\n');
        for (const [name, schema] of Object.entries(schemas)) {
          let fragment = cache.schemas.get(schema);
          if (fragment === undefined || !depsValid(fragment, doc)) {
            fragment = {
              text: indentLines(stringifyYaml({ [name]: serializeSchema(schema, doc) }), '    '),
              deps: collectDeps(schema, doc, false),
            };
            cache.schemas.set(schema, fragment);
          }
          out.push(fragment.text);
        }
      }
      if (Object.keys(rest).length > 0) out.push(indentLines(stringifyYaml(rest), '  '));
    } else {
      out.push(stringifyYaml({ [key]: value }));
    }
  }
  return out.join('');
}
