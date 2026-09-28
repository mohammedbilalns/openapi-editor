import { DEFAULT_SCHEMA, Type, dump as dumpYaml } from 'js-yaml';
import {
  ApiDocument,
  SchemaNode,
  Route,
  SchemaOrRef,
  ParameterDef,
  ResponseDef,
  RequestBody,
  MediaType,
  SecurityRequirement,
  SecurityScheme,
  NodeId,
  ExtraFields,
  setOwn,
} from './types';
import { forEachRefInRoute, forEachRefInSchema } from './refs';

type Json = Record<string, unknown>;

// OpenAPI output types
interface OpenAPIDocument {
  openapi: string;
  info: Json & { title: string; version: string };
  servers?: Json[];
  paths: Record<string, Json>;
  components?: Json & {
    schemas?: Json;
    securitySchemes?: Json;
  };
  tags?: Json[];
  security?: Array<Record<string, string[]>>;
  [key: string]: unknown;
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
 * Plain strings a YAML 1.1 reader takes for numbers because of `_` digit
 * separators (`1_000`, `0x_1F`, `1_0.5`). js-yaml's YAML 1.2 schema doesn't,
 * so they would be written unquoted; this type only exists to make the dumper
 * quote them.
 */
const YAML11_UNDERSCORE_NUMBER = new Type('tag:yaml.org,2002:yaml11-underscore-number', {
  kind: 'scalar',
  resolve: (text: string) =>
    typeof text === 'string' &&
    text.includes('_') &&
    /^[-+]?(?:0b[01_]+|0x[0-9a-fA-F_]+|[0-9][0-9_]*(?::[0-5]?[0-9])*(?:\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?|\.[0-9_]+(?:[eE][-+]?[0-9]+)?)$/.test(text),
});
const DUMP_SCHEMA = DEFAULT_SCHEMA.extend({ implicit: [YAML11_UNDERSCORE_NUMBER] });

/**
 * Plain OpenAPI object -> YAML text (js-yaml, ~5x faster than the `yaml`
 * package on large specs).
 * - noRefs: shared objects are written out in full, never as &anchor/*alias;
 * - default schema (plus 1.1 underscore numbers) on output so strings a YAML
 *   1.1 reader would retype (2024-06-20, yes, on, 1e3, 1_000...) are quoted
 *   for every consumer;
 * - lineWidth -1: no folding of long descriptions;
 * - skipInvalid: undefined values are omitted instead of throwing.
 */
export function stringifyYaml(value: unknown): string {
  return dumpYaml(value, { indent: 2, lineWidth: -1, noRefs: true, quotingType: '"', skipInvalid: true, schema: DUMP_SCHEMA });
}

export function serializeDocument(doc: ApiDocument): OpenAPIDocument {
  return buildDocument(doc, false);
}

/** Copy the extra (unmodelled) fields into `target`, never overriding what the model wrote. */
function addExtra(target: Json, extra: ExtraFields | undefined): void {
  if (!extra) return;
  for (const key of Object.keys(extra)) {
    if (!Object.hasOwn(target, key)) setOwn(target, key, extra[key]);
  }
}

/**
 * Add the entries of `extra[key]` that `container` lacks: an extra-bag entry
 * named like a modelled container (`components`, `paths`, `responses`) holds
 * that container's unmodelled entries.
 */
function mergeExtraEntries(container: Json, extra: ExtraFields | undefined, key: string): void {
  const entries = extra && Object.hasOwn(extra, key) ? extra[key] : undefined;
  if (entries !== null && typeof entries === 'object' && !Array.isArray(entries)) addExtra(container, entries as ExtraFields);
}

function withoutKeys(extra: ExtraFields | undefined, keys: readonly string[]): ExtraFields | undefined {
  if (!extra || !keys.some((k) => Object.hasOwn(extra, k))) return extra;
  const copy: ExtraFields = {};
  for (const key of Object.keys(extra)) if (!keys.includes(key)) setOwn(copy, key, extra[key]);
  return copy;
}

/** `#/components/schemas/<name>`, escaping `~` and `/` as JSON pointer requires. */
function schemaRefText(name: string): string {
  return `#/components/schemas/${name.replace(/~/g, '~0').replace(/\//g, '~1')}`;
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
  const { info } = doc;
  if (info.description) {
    output.info.description = info.description;
  }
  if (info.termsOfService) {
    output.info.termsOfService = info.termsOfService;
  }
  if (info.contact && (info.contact.name || info.contact.email || info.contact.url || info.contact.extra)) {
    const contact: Json = {};
    if (info.contact.name) contact.name = info.contact.name;
    if (info.contact.email) contact.email = info.contact.email;
    if (info.contact.url) contact.url = info.contact.url;
    addExtra(contact, info.contact.extra);
    output.info.contact = contact;
  }
  if (info.license?.name) {
    const license: Json = { name: info.license.name };
    if (info.license.url) license.url = info.license.url;
    addExtra(license, info.license.extra);
    output.info.license = license;
  }
  addExtra(output.info, info.extra);

  // Servers
  if (doc.servers.length > 0) {
    output.servers = doc.servers.map((s) => {
      const server: Json = { url: s.url };
      if (s.description) server.description = s.description;
      if (s.variables && Object.keys(s.variables).length > 0) {
        const variables: Json = {};
        for (const [name, v] of Object.entries(s.variables)) {
          const variable: Json = { default: v.default };
          if (v.enum !== undefined) variable.enum = v.enum;
          if (v.description !== undefined) variable.description = v.description;
          addExtra(variable, v.extra);
          setOwn(variables, name, variable);
        }
        server.variables = variables;
      }
      addExtra(server, s.extra);
      return server;
    });
  }

  // Tags
  if (doc.tags.length > 0) {
    output.tags = doc.tags.map((t) => {
      const tag: Json = { name: t.name };
      if (t.description) tag.description = t.description;
      addExtra(tag, t.extra);
      return tag;
    });
  }

  // Components
  const schemas: Json = {};
  const securitySchemes: Json = {};

  // Serialize named schemas
  for (const schema of doc.schemas.values()) {
    if (schema.name) {
      setOwn(schemas, schema.name, shell ? schema : serializeSchema(schema, doc));
    }
  }

  // Serialize security schemes
  for (const scheme of doc.securitySchemes.values()) {
    setOwn(securitySchemes, scheme.name, serializeSecurityScheme(scheme));
  }

  const components: Json = {};
  if (Object.keys(schemas).length > 0) components.schemas = schemas;
  if (Object.keys(securitySchemes).length > 0) components.securitySchemes = securitySchemes;
  mergeExtraEntries(components, doc.extra, 'components');
  if (Object.keys(components).length > 0) output.components = components;

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
  const sortedPaths = Array.from(pathGroups.keys()).toSorted();
  for (const path of sortedPaths) {
    const routes = pathGroups.get(path)!;
    const item: Json = {};
    // path-item fields first (summary, description, servers, x-*), as usually written
    for (const route of routes) addExtra(item, route.pathExtra);
    for (const route of routes) {
      setOwn(item, route.method, shell ? route : serializeOperation(route, doc));
    }
    setOwn(output.paths, path, item);
  }
  mergeExtraEntries(output.paths, doc.extra, 'paths');

  addExtra(output, withoutKeys(doc.extra, ['components', 'paths']));

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

function serializeProperties(schema: SchemaNode, doc: ApiDocument): Json {
  const props: Json = {};
  for (const [name, prop] of schema.properties!) {
    let propSchema: Json;
    if (prop.schema.kind === 'inline') {
      // the field's description, where the schema's own would go
      propSchema = serializeSchema(prop.schema.schema, doc, prop.description || undefined);
    } else {
      propSchema = serializeSchemaOrRef(prop.schema, doc);
      if (prop.description) propSchema.description = prop.description;
    }
    if (name === '__proto__') setOwn(props, name, propSchema);
    else props[name] = propSchema;
  }
  return props;
}

function serializeDiscriminator(schema: SchemaNode, doc: ApiDocument): Json | undefined {
  const { discriminator } = schema;
  if (!discriminator?.propertyName) return undefined;
  const result: Json = { propertyName: discriminator.propertyName };
  if (discriminator.mapping && Object.keys(discriminator.mapping).length > 0) {
    const targets = schema.mappingTargets;
    const mapping: Json = {};
    for (const [key, value] of Object.entries(discriminator.mapping)) {
      // a mapping value resolved at import follows its target's renames
      const targetId = targets && typeof value === 'string' && Object.hasOwn(targets, value) ? targets[value] : undefined;
      const targetName = targetId === undefined ? undefined : doc.schemas.get(targetId)?.name;
      setOwn(mapping, key, targetName ? (value.startsWith('#') ? schemaRefText(targetName) : targetName) : value);
    }
    result.mapping = mapping;
  }
  return result;
}

/** `description` (when given) replaces the schema's own, e.g. an object property's description. */
function serializeSchema(schema: SchemaNode, doc: ApiDocument, description = schema.description): Json {
  // An unresolved reference imported verbatim (e.g. to an external file)
  if (schema.extraKeywords && typeof schema.extraKeywords.$ref === 'string') {
    const verbatim: Json = { ...schema.extraKeywords };
    if (description) verbatim.description = description;
    return verbatim;
  }

  const result: Json = {};

  if (schema.type === 'oneOf' || schema.type === 'anyOf' || schema.type === 'allOf') {
    // Composition types
    if (schema.variants && schema.variants.length > 0) {
      result[schema.type] = schema.variants.map((v) => serializeSchemaOrRef(v, doc));
    }
    const discriminator = serializeDiscriminator(schema, doc);
    if (discriminator) {
      result.discriminator = discriminator;
    }
    if (description) {
      result.description = description;
    }
  } else if (schema.type === 'enum') {
    if (!schema.untyped) {
      result.type = schema.enumType ?? inferEnumType(schema.enumValues);
    }
    if (schema.format) {
      result.format = schema.format;
    }
    if (schema.enumValues && schema.enumValues.length > 0) {
      result.enum = schema.enumValues;
    }
    if (description) {
      result.description = description;
    }
  } else if (schema.type === 'array') {
    if (!schema.untyped) result.type = 'array';
    if (schema.items) {
      result.items = serializeSchemaOrRef(schema.items, doc);
    }
    if (description) {
      result.description = description;
    }
  } else if (schema.type === 'object') {
    if (!schema.untyped) result.type = 'object';
    if (schema.properties && schema.properties.size > 0) {
      result.properties = serializeProperties(schema, doc);
    }
    if (schema.required && schema.required.length > 0) {
      result.required = schema.required;
    }
    if (description) {
      result.description = description;
    }
  } else {
    // Primitives
    result.type = schema.type;
    if (description) {
      result.description = description;
    }
    if (schema.format) {
      result.format = schema.format;
    }
    if (schema.minimum !== undefined) result.minimum = schema.minimum;
    if (schema.maximum !== undefined) result.maximum = schema.maximum;
    if (schema.minLength !== undefined) result.minLength = schema.minLength;
    if (schema.maxLength !== undefined) result.maxLength = schema.maxLength;
    if (schema.pattern) {
      result.pattern = schema.pattern;
    }
  }

  // An OpenAPI 3.1 type list, while the edited type is still one of its entries
  if (schema.typeList !== undefined && typeof result.type === 'string' && schema.typeList.includes(result.type)) {
    result.type = [...schema.typeList];
  }

  // Modelled keywords valid on every kind of schema (a schema may combine
  // them, e.g. allOf next to properties, or maxLength on an enum)
  if (schema.properties !== undefined && schema.properties.size > 0 && result.properties === undefined) {
    result.properties = serializeProperties(schema, doc);
  }
  if (schema.required !== undefined && schema.required.length > 0 && result.required === undefined) {
    result.required = schema.required;
  }
  if (schema.items !== undefined && result.items === undefined) {
    result.items = serializeSchemaOrRef(schema.items, doc);
  }
  if (schema.additionalProperties !== undefined) {
    result.additionalProperties = serializeSchemaOrRef(schema.additionalProperties, doc);
  }
  if (schema.not !== undefined) {
    result.not = serializeSchemaOrRef(schema.not, doc);
  }
  if (schema.otherCompositions !== undefined) {
    // The edited composition wins over a second one of the same kind
    for (const [key, list] of Object.entries(schema.otherCompositions)) {
      if (list && result[key] === undefined) result[key] = list.map((v) => serializeSchemaOrRef(v, doc));
    }
  }
  if (schema.discriminator !== undefined && result.discriminator === undefined) {
    const discriminator = serializeDiscriminator(schema, doc);
    if (discriminator) result.discriminator = discriminator;
  }
  if (schema.format && result.format === undefined) result.format = schema.format;
  if (schema.minimum !== undefined && result.minimum === undefined) result.minimum = schema.minimum;
  if (schema.maximum !== undefined && result.maximum === undefined) result.maximum = schema.maximum;
  if (schema.minLength !== undefined && result.minLength === undefined) result.minLength = schema.minLength;
  if (schema.maxLength !== undefined && result.maxLength === undefined) result.maxLength = schema.maxLength;
  if (schema.pattern && result.pattern === undefined) result.pattern = schema.pattern;

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
  if (schema.extraKeywords !== undefined) addExtra(result, schema.extraKeywords);

  return result;
}

/** Unnamed schemas being inlined right now (guards against cycles through them). */
const inlining = new Set<NodeId>();

function serializeSchemaOrRef(schemaOrRef: SchemaOrRef, doc: ApiDocument): Json {
  if (schemaOrRef.kind === 'ref') {
    const targetSchema = doc.schemas.get(schemaOrRef.targetId);
    if (targetSchema?.name) {
      return { $ref: schemaRefText(targetSchema.name) };
    }
    // Fallback for anonymous schemas - inline them. A reference back to one
    // that is being inlined can't be written out (there is no name to $ref):
    // it becomes `{}`, and the validator reports the missing name.
    if (targetSchema) {
      if (inlining.has(targetSchema.id)) return {};
      inlining.add(targetSchema.id);
      try {
        return serializeSchema(targetSchema, doc);
      } finally {
        inlining.delete(targetSchema.id);
      }
    }
    return { type: 'object' }; // Fallback
  }
  return serializeSchema(schemaOrRef.schema, doc);
}

function serializeOperation(route: Route, doc: ApiDocument): Json {
  const result: Json = {};

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
  const responses: Json = {};
  for (const [statusCode, response] of route.responses) {
    if (statusCode === '__proto__') setOwn(responses, statusCode, serializeResponse(response, doc));
    else responses[statusCode] = serializeResponse(response, doc);
  }
  mergeExtraEntries(responses, route.extra, 'responses');
  result.responses = responses;

  // Security
  const security = serializeSecurity(route.security, doc);
  if (security) {
    result.security = security;
  }

  addExtra(result, route.extra);

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

/** `schema`, or `content: {<media type>: {schema}}` for a parameter imported that way. */
function writeParameterSchema(target: Json, param: ParameterDef, doc: ApiDocument): void {
  const schema = serializeSchemaOrRef(param.schema, doc);
  if (param.content) {
    const media: Json = { schema };
    addExtra(media, param.content.extra);
    target.content = { [param.content.mediaType]: media };
  } else {
    target.schema = schema;
  }
}

function serializeParameter(param: ParameterDef, doc: ApiDocument): Json {
  const result: Json = {
    name: param.name,
    in: param.in,
  };

  if (param.required) {
    result.required = true;
  }
  if (param.description) {
    result.description = param.description;
  }

  writeParameterSchema(result, param, doc);

  if (param.example !== undefined) {
    result.example = param.example;
  }
  addExtra(result, param.extra);

  return result;
}

function serializeHeader(header: ParameterDef, doc: ApiDocument): Json {
  const result: Json = {};
  if (header.description) result.description = header.description;
  if (header.required) result.required = true;
  writeParameterSchema(result, header, doc);
  if (header.example !== undefined) result.example = header.example;
  addExtra(result, header.extra);
  return result;
}

/** The placeholder the parser puts in a media type without `schema`, still untouched. */
function isOmittedSchemaPlaceholder(schema: SchemaOrRef): boolean {
  if (schema.kind !== 'inline') return false;
  const s = schema.schema;
  for (const key of Object.keys(s) as Array<keyof SchemaNode>) {
    if (s[key] === undefined || key === 'id' || key === 'untyped' || key === 'type') continue;
    return false;
  }
  return s.type === 'object' && s.untyped === true;
}

function serializeContent(content: Map<string, MediaType>, doc: ApiDocument): Json {
  const result: Json = {};
  for (const [contentType, media] of content) {
    const out: Json = {};
    if (!(media.schemaOmitted && isOmittedSchemaPlaceholder(media.schema))) {
      out.schema = serializeSchemaOrRef(media.schema, doc);
    }
    if (media.example !== undefined) {
      out.example = media.example;
    }
    if (media.extra !== undefined) addExtra(out, media.extra);
    if (contentType === '__proto__') setOwn(result, contentType, out);
    else result[contentType] = out;
  }
  return result;
}

function serializeRequestBody(body: RequestBody, doc: ApiDocument): Json {
  const result: Json = {};

  if (body.description) {
    result.description = body.description;
  }
  if (body.required) {
    result.required = true;
  }

  result.content = serializeContent(body.content, doc);
  addExtra(result, body.extra);

  return result;
}

function serializeResponse(response: ResponseDef, doc: ApiDocument): Json {
  const result: Json = {
    description: response.description,
  };

  if (response.headers && response.headers.size > 0) {
    const headers: Json = {};
    for (const [name, header] of response.headers) {
      setOwn(headers, name, serializeHeader(header, doc));
    }
    result.headers = headers;
  }

  if (response.content && response.content.size > 0) {
    result.content = serializeContent(response.content, doc);
  }
  addExtra(result, response.extra);

  return result;
}

const FLOW_NAMES = ['implicit', 'password', 'clientCredentials', 'authorizationCode'] as const;

function serializeSecurityScheme(scheme: SecurityScheme): Json {
  const result: Json = {
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
    const flows: Json = {};
    for (const name of FLOW_NAMES) {
      const flow = scheme.flows[name];
      if (!flow) continue;
      const out: Json = {};
      if (flow.authorizationUrl !== undefined) out.authorizationUrl = flow.authorizationUrl;
      if (flow.tokenUrl !== undefined) out.tokenUrl = flow.tokenUrl;
      if (flow.refreshUrl !== undefined) out.refreshUrl = flow.refreshUrl;
      out.scopes = flow.scopes;
      addExtra(out, flow.extra);
      flows[name] = out;
    }
    addExtra(flows, scheme.flows.extra);
    result.flows = flows;
  }

  if (scheme.type === 'openIdConnect' && scheme.openIdConnectUrl) {
    result.openIdConnectUrl = scheme.openIdConnectUrl;
  }

  addExtra(result, scheme.extra);

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

const OPERATION_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace']);

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
      const paths = value as Record<string, Record<string, unknown>>;
      if (Object.keys(paths).length === 0) {
        out.push('paths: {}\n');
        continue;
      }
      out.push('paths:\n');
      const routePaths = new Set<string>();
      for (const route of doc.routes.values()) routePaths.add(route.path);
      for (const [path, item] of Object.entries(paths)) {
        if (!routePaths.has(path)) {
          // an x-* entry of the Paths object
          out.push(indentLines(stringifyYaml({ [path]: item }), '  '));
          continue;
        }
        const pathKey = keyText(cache, path);
        if (pathKey === null) return stringifyYaml(serializeDocument(doc));
        out.push(`  ${pathKey}:\n`);
        for (const [method, entry] of Object.entries(item)) {
          if (!OPERATION_METHODS.has(method)) {
            // a path-item field (summary, servers, x-*)
            out.push(indentLines(stringifyYaml({ [method]: entry }), '    '));
            continue;
          }
          const route = entry as Route;
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
