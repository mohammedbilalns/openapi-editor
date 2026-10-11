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
  ExtraFields,
  generateId,
  createEmptyDocument,
  setOwn,
} from './types';

export interface ParseResult {
  document: ApiDocument | null;
  errors: ValidationError[];
}

type RawObject = Record<string, unknown>;

// YAML leaves empty values as null (e.g. `items:` with nothing after it);
// treat anything that is not an object as an empty object.
function asObject(value: unknown): RawObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as RawObject)
    : {};
}

function isObject(value: unknown): value is RawObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Largest document accepted (characters, ~bytes): bigger input is refused before parsing. */
export const MAX_DOCUMENT_CHARS = 50 * 1024 * 1024;

/**
 * Component sections that are inlined where they are used (not kept as
 * components). Definitions nothing refers to are reported, not kept.
 */
const INLINED_COMPONENT_SECTIONS = ['parameters', 'responses', 'requestBodies', 'headers'] as const;

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
  /** `section/name` of every inlined component that was referenced */
  usedComponents: Set<string>;
  /** number of `$ref`s whose sibling keywords were ignored */
  refSiblings: number;
  errors: ValidationError[];
}

const MAX_REF_HOPS = 16;
const SCHEMA_REF_PREFIX = '#/components/schemas/';

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

function warn(ctx: ParseContext, code: string, message: string) {
  ctx.errors.push({ code, message, severity: 'warning', location: {} });
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
    const name = ref.startsWith(prefix) && hops < MAX_REF_HOPS ? decodePointerSegment(ref.slice(prefix.length)) : undefined;
    const sectionObject = ctx.components[section];
    const target = name !== undefined && sectionObject && Object.hasOwn(sectionObject, name) ? sectionObject[name] : undefined;
    if (target === undefined) {
      warn(ctx, 'UNRESOLVED_REF', `Unresolved reference: ${ref}`);
      return null;
    }
    ctx.usedComponents.add(`${section}/${name}`);
    current = asObject(target);
  }
  return current;
}

/** True when `value` contains a `$ref` to a component schema (kept as plain text in an extra bag). */
function containsSchemaRef(value: unknown, depth = 0): boolean {
  if (value === null || typeof value !== 'object' || depth > 200) return false;
  if (Array.isArray(value)) return value.some((v) => containsSchemaRef(v, depth + 1));
  for (const key in value) {
    const v = (value as RawObject)[key];
    if (key === '$ref' && typeof v === 'string' && v.startsWith(SCHEMA_REF_PREFIX)) return true;
    if (containsSchemaRef(v, depth + 1)) return true;
  }
  return false;
}

/**
 * The keys of `raw` that are not `known`, verbatim. Warns (once per bag) when
 * they hold schema `$ref`s, since those are text: renames don't follow them.
 */
function extraOf(
  raw: RawObject,
  known: ReadonlySet<string>,
  ctx: ParseContext,
  where: string,
  /** keys of `known` the model did not take this time (e.g. `required: false`) */
  unconsumed?: readonly string[],
): ExtraFields | undefined {
  let extra: ExtraFields | undefined;
  for (const key in raw) {
    if (known.has(key)) continue;
    setOwn((extra ??= {}), key, raw[key]);
  }
  if (unconsumed) {
    for (const key of unconsumed) {
      if (Object.hasOwn(raw, key)) setOwn((extra ??= {}), key, raw[key]);
    }
  }
  if (extra) warnRefsKeptAsText(extra, ctx, where);
  return extra;
}

function warnRefsKeptAsText(extra: ExtraFields, ctx: ParseContext, where: string) {
  for (const key in extra) {
    if (key === '$ref') continue; // an unresolved (e.g. external) ref, reported on its own
    if (containsSchemaRef(extra[key])) {
      warn(
        ctx,
        'REFS_KEPT_AS_TEXT',
        `References inside ${where} (${key}) are kept as written: renaming or deleting the schemas they point to won't update them.`,
      );
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Text -> plain JS value

/** Thrown by parseText when YAML aliases expand the document far beyond its size. */
export class YamlAliasLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'YamlAliasLimitError';
  }
}

/** Could the text use anchors and aliases? (cheap pre-check; false positives only cost a walk) */
const MAY_HAVE_ANCHOR = /&[^\s,[\]{}]/;
const MAY_HAVE_ALIAS = /\*[^\s,[\]{}]/;

/**
 * Size of `root` as if every alias were written out (roughly its character
 * count), memoized per object so shared subtrees are visited once. Throws
 * YamlAliasLimitError past `budget` or on a cycle.
 */
const aliasesTooLarge = () =>
  new YamlAliasLimitError(
    'The document uses YAML aliases (*name) that expand to far more data than the file contains, so it was not opened.',
  );

function checkAliasExpansion(root: unknown, budget: number): void {
  const sizes = new Map<object, number>();
  const active = new Set<object>();
  const tooLarge = aliasesTooLarge;
  const size = (value: unknown): number => {
    if (typeof value === 'string') return value.length + 1;
    if (value === null || typeof value !== 'object') return 1;
    const known = sizes.get(value);
    if (known !== undefined) return known;
    if (active.has(value)) throw new YamlAliasLimitError('The document has a YAML alias that refers to itself, so it was not opened.');
    active.add(value);
    let total = 1;
    if (Array.isArray(value)) {
      for (const item of value) {
        total += size(item);
        if (total > budget) throw tooLarge();
      }
    } else {
      for (const key in value) {
        total += key.length + size((value as RawObject)[key]);
        if (total > budget) throw tooLarge();
      }
    }
    active.delete(value);
    sizes.set(value, total);
    return total;
  };
  size(root);
}

/**
 * YAML/JSON text -> plain JS value.
 *
 * JSON (the usual format of large published specs) goes through JSON.parse,
 * ~80x faster than any YAML parser; anything else, or JSON that fails to
 * parse, goes through js-yaml (~13x faster than the `yaml` package on large
 * specs). CORE_SCHEMA is YAML 1.2 core: no timestamps (so `version: 2024-06-20`
 * stays a string) and no `<<` merge keys. Duplicate keys are an error.
 *
 * js-yaml shares the object an alias points to instead of copying it, so a
 * few hundred bytes of nested aliases can stand for gigabytes once written
 * out ("billion laughs"). Such documents are refused (YamlAliasLimitError).
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
  const value = loadYaml(source, { schema: CORE_SCHEMA });
  if (MAY_HAVE_ALIAS.test(source) && MAY_HAVE_ANCHOR.test(source)) {
    checkAliasExpansion(value, 4 * source.length + 1_000_000);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Document

const ROOT_KEYS = new Set(['openapi', 'info', 'servers', 'paths', 'components', 'security', 'tags']);
const COMPONENT_KEYS = new Set(['schemas', 'securitySchemes', ...INLINED_COMPONENT_SECTIONS]);

export function parseYaml(yamlContent: string): ParseResult {
  if (yamlContent.length > MAX_DOCUMENT_CHARS) {
    return {
      document: null,
      errors: [
        {
          code: 'DOCUMENT_TOO_LARGE',
          message: `The document is larger than ${MAX_DOCUMENT_CHARS / 1024 / 1024} MB, which is more than the editor can open.`,
          severity: 'error',
          location: {},
        },
      ],
    };
  }

  const errors: ValidationError[] = [];

  // Parse YAML
  let parsed: RawObject;
  try {
    parsed = parseText(yamlContent) as RawObject;
  } catch (error) {
    const aliasLimit = error instanceof YamlAliasLimitError;
    return {
      document: null,
      errors: [
        {
          code: aliasLimit ? 'YAML_ALIAS_LIMIT' : 'YAML_PARSE_ERROR',
          message: aliasLimit
            ? error.message
            : `Failed to parse YAML: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

  try {
    return buildDocument(parsed, errors);
  } catch (error) {
    // e.g. JSON nested thousands of levels deep overflows the recursive walk
    if (!(error instanceof RangeError)) throw error;
    return {
      document: null,
      errors: [
        {
          code: 'DOCUMENT_TOO_DEEP',
          message: 'The document is nested too deeply to open.',
          severity: 'error',
          location: {},
        },
      ],
    };
  }
}

/** Plain OpenAPI object -> ApiDocument. */
function buildDocument(parsed: RawObject, errors: ValidationError[]): ParseResult {
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

  const rawComponents = asObject(parsed.components);
  const components: Record<string, RawObject> = {};
  for (const section of COMPONENT_KEYS) {
    if (Object.hasOwn(rawComponents, section)) components[section] = asObject(rawComponents[section]);
  }
  const ctx: ParseContext = {
    schemaNameToId: new Map(),
    securitySchemeNameToId: new Map(),
    components,
    usedComponents: new Set(),
    refSiblings: 0,
    errors,
  };

  // Create document
  const doc = createEmptyDocument();

  // Parse info
  if (isObject(parsed.info)) {
    doc.info = parseInfo(parsed.info, ctx);
  } else {
    errors.push({
      code: 'MISSING_INFO',
      message: 'Missing required "info" object',
      severity: 'error',
      location: { path: ['info'] },
    });
  }

  // Parse servers
  if (Array.isArray(parsed.servers)) {
    doc.servers = parseServers(parsed.servers, ctx, 'the servers');
  }

  // Parse tags
  if (Array.isArray(parsed.tags)) {
    doc.tags = parsed.tags
      .filter((t): t is RawObject => isObject(t) && Boolean(t.name))
      .map((t) => {
        const tag: ApiDocument['tags'][number] = { name: String(t.name), description: t.description as string | undefined };
        const extra = extraOf(t, TAG_KEYS, ctx, `tag “${tag.name}”`);
        if (extra) tag.extra = extra;
        return tag;
      });
  }

  // First pass: register all schema names for $ref resolution
  const rawSchemas = components.schemas ?? {};
  for (const name of Object.keys(rawSchemas)) {
    ctx.schemaNameToId.set(name, generateId());
  }

  // Parse schemas
  for (const name of Object.keys(rawSchemas)) {
    const id = ctx.schemaNameToId.get(name)!;
    doc.schemas.set(id, parseSchema(rawSchemas[name], name, id, ctx));
  }

  // Parse security schemes
  const rawSchemes = components.securitySchemes ?? {};
  for (const name of Object.keys(rawSchemes)) {
    const scheme = parseSecurityScheme(name, rawSchemes[name], ctx);
    doc.securitySchemes.set(scheme.id, scheme);
    ctx.securitySchemeNameToId.set(name, scheme.id);
  }

  // Document-wide security
  if (Array.isArray(parsed.security)) {
    doc.security = parseSecurityRequirements(parsed.security, ctx);
  }

  // Parse paths
  let pathExtensions: ExtraFields | undefined;
  const rawPaths = asObject(parsed.paths);
  for (const path of Object.keys(rawPaths)) {
    const pathItemData = rawPaths[path];
    if (path.startsWith('x-')) {
      setOwn((pathExtensions ??= {}), path, pathItemData);
      continue;
    }
    const pathItem = asObject(pathItemData);
    const pathParameters = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];
    let pathExtra: ExtraFields | undefined;
    let operations = 0;

    for (const key of Object.keys(pathItem)) {
      const method = key.toLowerCase();
      if (key === 'parameters') continue;
      if (!isHttpMethod(method)) {
        setOwn((pathExtra ??= {}), key, pathItem[key]);
        continue;
      }
      const operationData = pathItem[key];
      if (!isObject(operationData)) continue;

      const route = parseOperation(path, method, operationData, pathParameters, ctx);
      doc.routes.set(route.id, route);
      operations++;
    }

    if (pathExtra) warnRefsKeptAsText(pathExtra, ctx, `path ${path}`);
    if (operations === 0) {
      warn(ctx, 'PATH_WITHOUT_OPERATIONS', `Path ${path} has no operations, so it was not kept.`);
    } else if (pathExtra) {
      // shared by every route of the path item; the serializer writes it once
      for (const route of doc.routes.values()) {
        if (route.path === path && route.pathExtra === undefined) route.pathExtra = pathExtra;
      }
    }
  }

  // Unmodelled root keys and component sections (examples, links, callbacks, x-*)
  const rootExtra = extraOf(parsed, ROOT_KEYS, ctx, 'the document root');
  const componentsExtra = extraOf(rawComponents, COMPONENT_KEYS, ctx, 'components');
  if (rootExtra || componentsExtra || pathExtensions) {
    doc.extra = { ...rootExtra };
    if (componentsExtra) doc.extra.components = componentsExtra;
    if (pathExtensions) doc.extra.paths = pathExtensions;
  }

  for (const section of INLINED_COMPONENT_SECTIONS) {
    const unused = Object.keys(components[section] ?? {}).filter((name) => !ctx.usedComponents.has(`${section}/${name}`));
    if (unused.length > 0) {
      warn(
        ctx,
        'COMPONENT_NOT_KEPT',
        `Reusable ${section} are copied into the operations that use them; unused ones are not kept: ${unused.map((n) => `“${n}”`).join(', ')}.`,
      );
    }
  }

  if (ctx.refSiblings > 0) {
    warn(
      ctx,
      'REF_SIBLINGS_IGNORED',
      `${ctx.refSiblings === 1 ? 'One $ref has' : `${ctx.refSiblings} $refs have`} keywords next to it; OpenAPI 3.0 ignores them, so they were not kept.`,
    );
  }

  return { document: doc, errors };
}

const INFO_KEYS = new Set(['title', 'version', 'description', 'termsOfService', 'contact', 'license']);
const CONTACT_KEYS = new Set(['name', 'url', 'email']);
const LICENSE_KEYS = new Set(['name', 'url']);
const TAG_KEYS = new Set(['name', 'description']);
const SERVER_KEYS = new Set(['url', 'description', 'variables']);
const SERVER_VARIABLE_KEYS = new Set(['default', 'enum', 'description']);

function parseInfo(info: RawObject, ctx: ParseContext): InfoObject {
  const { errors } = ctx;
  const result: InfoObject = {
    title: (info.title as string) || 'Untitled API',
    version: info.version === undefined || info.version === null || info.version === '' ? '1.0.0' : String(info.version),
  };

  if (!info.title) {
    errors.push({
      code: 'MISSING_TITLE',
      message: 'Missing required "info.title"',
      severity: 'warning',
      location: { path: ['info', 'title'] },
    });
  }

  if (!info.version) {
    errors.push({
      code: 'MISSING_VERSION',
      message: 'Missing required "info.version"',
      severity: 'warning',
      location: { path: ['info', 'version'] },
    });
  }

  if (info.description) {
    result.description = info.description as string;
  }
  if (info.termsOfService) {
    result.termsOfService = info.termsOfService as string;
  }
  const known = new Set(INFO_KEYS);
  if (isObject(info.contact)) {
    const contact = info.contact;
    result.contact = {
      name: contact.name as string | undefined,
      url: contact.url as string | undefined,
      email: contact.email as string | undefined,
    };
    const extra = extraOf(contact, CONTACT_KEYS, ctx, 'the contact');
    if (extra) result.contact.extra = extra;
  } else {
    known.delete('contact');
  }
  const license = asObject(info.license);
  if (license.name) {
    result.license = {
      name: license.name as string,
      url: license.url as string | undefined,
    };
    const extra = extraOf(license, LICENSE_KEYS, ctx, 'the license');
    if (extra) result.license.extra = extra;
  } else {
    known.delete('license'); // kept verbatim (not valid without a name)
  }

  const extra = extraOf(info, known, ctx, 'info');
  if (extra) result.extra = extra;
  return result;
}

function parseServers(list: unknown[], ctx: ParseContext, where: string): Server[] {
  return list
    .filter((s): s is RawObject => isObject(s) && Boolean(s.url))
    .map((s) => {
      const server: Server = { url: String(s.url), description: s.description as string | undefined };
      const rawVariables = asObject(s.variables);
      const names = Object.keys(rawVariables);
      if (names.length > 0) {
        server.variables = {};
        for (const name of names) {
          const v = asObject(rawVariables[name]);
          const variable: ServerVariable = { default: v.default === undefined ? '' : String(v.default) };
          if (Array.isArray(v.enum)) variable.enum = v.enum.map(String);
          if (typeof v.description === 'string') variable.description = v.description;
          const extra = extraOf(v, SERVER_VARIABLE_KEYS, ctx, where);
          if (extra) variable.extra = extra;
          setOwn(server.variables, name, variable);
        }
      }
      const extra = extraOf(s, SERVER_KEYS, ctx, where);
      if (extra) server.extra = extra;
      return server;
    });
}

// ---------------------------------------------------------------------------
// Schemas

/** Keywords that can map onto SchemaNode fields; whether they do depends on the schema (see parseSchema). */
const MODELED_SCHEMA_KEYWORDS = new Set([
  '$ref', 'type', 'description', 'properties', 'required', 'items', 'oneOf', 'anyOf', 'allOf',
  'enum', 'format', 'example', 'default', 'minimum', 'maximum', 'minLength', 'maxLength',
  'pattern', 'discriminator', 'nullable', 'additionalProperties', 'not',
]);

const TYPE_KEYWORDS = new Set<SchemaType>(['object', 'array', 'string', 'number', 'integer', 'boolean']);
const ENUM_TYPES = new Set(['string', 'integer', 'number', 'boolean']);
const DISCRIMINATOR_KEYS = new Set(['propertyName', 'mapping']);

function inferEnumType(values: unknown[]): string {
  if (values.length > 0) {
    if (values.every((v) => typeof v === 'number')) return values.every((v) => Number.isInteger(v)) ? 'integer' : 'number';
    if (values.every((v) => typeof v === 'boolean')) return 'boolean';
  }
  return 'string';
}

function schemaLabel(name: string | undefined) {
  return name ? `schema “${name}”` : 'an inline schema';
}

function parseSchema(
  data: unknown,
  name: string | undefined,
  id: NodeId,
  ctx: ParseContext,
  descriptionOnField = false,
): SchemaNode {
  const schemaData = asObject(data);

  // OpenAPI 3.1 allows `type: [string, 'null']`; map it to 3.0 `nullable`.
  // Other type lists keep their first entry for the editor and the whole list for export.
  let rawType = schemaData.type;
  let nullable = schemaData.nullable === true;
  let typeList: string[] | undefined;
  if (Array.isArray(rawType)) {
    const nonNull = rawType.filter((t) => t !== 'null');
    if (nonNull.length < rawType.length) nullable = true;
    if (nonNull.length > 1 && nonNull.every((t) => typeof t === 'string')) typeList = nonNull as string[];
    rawType = nonNull[0];
  }

  // Determine schema type
  let type: SchemaType;
  let untyped = false;
  /** `type` could not be represented: keep it verbatim */
  let keepRawType = false;
  const composition = Array.isArray(schemaData.oneOf)
    ? 'oneOf'
    : Array.isArray(schemaData.anyOf)
      ? 'anyOf'
      : Array.isArray(schemaData.allOf)
        ? 'allOf'
        : undefined;

  if (composition) {
    type = composition;
    keepRawType = schemaData.type !== undefined;
    nullable = schemaData.nullable === true;
    typeList = undefined;
  } else if (Array.isArray(schemaData.enum)) {
    type = 'enum';
    if (rawType === undefined) untyped = true;
    else if (typeof rawType !== 'string' || !ENUM_TYPES.has(rawType)) {
      untyped = true;
      keepRawType = true;
    }
  } else if (typeof rawType === 'string' && TYPE_KEYWORDS.has(rawType as SchemaType)) {
    type = rawType as SchemaType;
  } else {
    // no (usable) type: an "any" schema, or an object/array known by its keywords
    type = isObject(schemaData.items) ? 'array' : 'object';
    untyped = true;
    keepRawType = rawType !== undefined;
  }
  if (keepRawType) typeList = undefined;

  const description = typeof schemaData.description === 'string' ? schemaData.description : undefined;
  const schema: SchemaNode = {
    id,
    name,
    type,
    // an object property's description is stored once, on the property (see below)
    description: descriptionOnField ? undefined : description,
  };
  if (untyped) schema.untyped = true;
  if (typeList) {
    schema.typeList = typeList;
    warn(
      ctx,
      'MULTIPLE_TYPES',
      `${name ? `Schema “${name}”` : 'An inline schema'} allows several types (${typeList.join(', ')}); the editor shows the first and exports the list unchanged.`,
    );
  }

  // Object keywords (on any schema: e.g. allOf with sibling properties)
  if (isObject(schemaData.properties)) {
    schema.properties = new Map();
    const props = schemaData.properties;
    const required = Array.isArray(schemaData.required) ? (schemaData.required as string[]) : [];
    const requiredSet = new Set(required);

    for (const propName of Object.keys(props)) {
      const propData = props[propName];
      // Stored once, on the field: the field's description is what the editor
      // edits (and the only place a $ref'd field can keep one).
      const propSchema = parseSchemaOrRef(propData, ctx, true);
      const sibling = asObject(propData).description;
      schema.properties.set(propName, {
        name: propName,
        schema: propSchema,
        required: requiredSet.has(propName),
        description: typeof sibling === 'string' ? sibling : undefined,
      });
    }

    schema.required = required;
  } else if (Array.isArray(schemaData.required)) {
    schema.required = schemaData.required as string[];
  }

  if (isObject(schemaData.items)) {
    schema.items = parseSchemaOrRef(schemaData.items, ctx);
  }
  if (isObject(schemaData.additionalProperties)) {
    schema.additionalProperties = parseSchemaOrRef(schemaData.additionalProperties, ctx);
  }
  if (isObject(schemaData.not)) {
    schema.not = parseSchemaOrRef(schemaData.not, ctx);
  }

  if (type === 'enum') {
    const values = schemaData.enum as Array<string | number | boolean>;
    schema.enumValues = values;
    if (!keepRawType && typeof rawType === 'string') {
      if (rawType !== 'string' || inferEnumType(values) !== 'string') schema.enumType = rawType as SchemaNode['enumType'];
    }
  }

  if (composition) {
    schema.variants = (schemaData[composition] as unknown[]).map((v) => parseSchemaOrRef(v, ctx));
  }

  const disc = schemaData.discriminator;
  const discriminatorModeled = isObject(disc) && typeof disc.propertyName === 'string';
  if (discriminatorModeled) {
    schema.discriminator = { propertyName: disc.propertyName as string };
    const mapping = asObject(disc.mapping);
    const keys = Object.keys(mapping);
    if (keys.length > 0) {
      schema.discriminator.mapping = mapping as Record<string, string>;
      for (const key of keys) {
        const value = mapping[key];
        if (typeof value !== 'string') continue;
        const targetName = value.startsWith(SCHEMA_REF_PREFIX) ? decodePointerSegment(value.slice(SCHEMA_REF_PREFIX.length)) : value;
        const targetId = ctx.schemaNameToId.get(targetName);
        if (targetId) setOwn((schema.mappingTargets ??= {}), value, targetId);
      }
    }
    const dropped = Object.keys(disc).filter((k) => !DISCRIMINATOR_KEYS.has(k));
    if (dropped.length > 0) {
      warn(ctx, 'UNSUPPORTED_KEYWORD', `The discriminator of ${schemaLabel(name)} has keys the editor can't keep: ${dropped.join(', ')}.`);
    }
  }

  if (nullable) schema.nullable = true;

  // Primitive constraints (on any schema)
  if (schemaData.format) schema.format = schemaData.format as string;
  if (schemaData.minimum !== undefined) schema.minimum = schemaData.minimum as number;
  if (schemaData.maximum !== undefined) schema.maximum = schemaData.maximum as number;
  if (schemaData.minLength !== undefined) schema.minLength = schemaData.minLength as number;
  if (schemaData.maxLength !== undefined) schema.maxLength = schemaData.maxLength as number;
  if (schemaData.pattern) schema.pattern = schemaData.pattern as string;
  if (schemaData.example !== undefined) schema.example = schemaData.example;
  if (schemaData.default !== undefined) schema.default = schemaData.default;

  // Everything the model did not take, verbatim
  let extra: ExtraFields | undefined;
  for (const key in schemaData) {
    if (!MODELED_SCHEMA_KEYWORDS.has(key)) setOwn((extra ??= {}), key, schemaData[key]);
  }
  // Modelled keywords the model could not take here (rare, so checked one by one)
  if (typeof schemaData.$ref === 'string') extra = keepKeyword(extra, schemaData, '$ref');
  if (keepRawType) extra = keepKeyword(extra, schemaData, 'type');
  for (const key of ['oneOf', 'anyOf', 'allOf'] as const) {
    if (key === composition || schemaData[key] === undefined) continue;
    // A second composition: parsed, so its refs follow renames, but not editable
    if (Array.isArray(schemaData[key])) {
      (schema.otherCompositions ??= {})[key] = (schemaData[key] as unknown[]).map((v) => parseSchemaOrRef(v, ctx));
    } else extra = keepKeyword(extra, schemaData, key);
  }
  if (type !== 'enum') extra = keepKeyword(extra, schemaData, 'enum');
  if (description === undefined) extra = keepKeyword(extra, schemaData, 'description');
  if (!schema.properties) extra = keepKeyword(extra, schemaData, 'properties');
  if (!Array.isArray(schemaData.required)) extra = keepKeyword(extra, schemaData, 'required');
  if (!schema.items) extra = keepKeyword(extra, schemaData, 'items');
  if (!schema.additionalProperties) extra = keepKeyword(extra, schemaData, 'additionalProperties');
  if (!schema.not) extra = keepKeyword(extra, schemaData, 'not');
  if (!schema.discriminator) extra = keepKeyword(extra, schemaData, 'discriminator');
  // `nullable: false` is kept verbatim (the model only records true)
  if (schemaData.nullable !== true) extra = keepKeyword(extra, schemaData, 'nullable');
  if (!schemaData.format) extra = keepKeyword(extra, schemaData, 'format');
  if (!schemaData.pattern) extra = keepKeyword(extra, schemaData, 'pattern');
  if (extra) {
    schema.extraKeywords = extra;
    warnRefsKeptAsText(extra, ctx, schemaLabel(name));
  }

  return schema;
}

/** `extra` plus `raw[key]` when present. */
function keepKeyword(extra: ExtraFields | undefined, raw: RawObject, key: string): ExtraFields | undefined {
  if (raw[key] === undefined) return extra;
  const out = extra ?? {};
  setOwn(out, key, raw[key]);
  return out;
}

/**
 * `$ref` or inline schema. `descriptionOnField`: an object property, whose
 * description the caller stores on the property (so neither a `$ref` sibling
 * `description` nor the inline schema's own is kept here).
 */
function parseSchemaOrRef(data: unknown, ctx: ParseContext, descriptionOnField = false): SchemaOrRef {
  const schemaData = asObject(data);

  // Check for $ref
  if (typeof schemaData.$ref === 'string') {
    const refPath = schemaData.$ref;
    if (refPath.startsWith(SCHEMA_REF_PREFIX)) {
      const targetId = ctx.schemaNameToId.get(decodePointerSegment(refPath.slice(SCHEMA_REF_PREFIX.length)));
      if (targetId) {
        const keys = Object.keys(schemaData).length;
        if (keys > 2 || (keys === 2 && !(descriptionOnField && schemaData.description !== undefined))) ctx.refSiblings++;
        return { kind: 'ref', targetId };
      }
    }
    warn(ctx, 'UNRESOLVED_REF', `Unresolved reference: ${refPath}`);
    // Keep the reference text (e.g. an external file ref) so export is lossless
    const unresolved = parseSchema(schemaData, undefined, generateId(), ctx, descriptionOnField);
    unresolved.extraKeywords = { $ref: refPath, ...unresolved.extraKeywords };
    return { kind: 'inline', schema: unresolved };
  }

  // Inline schema
  return {
    kind: 'inline',
    schema: parseSchema(schemaData, undefined, generateId(), ctx, descriptionOnField),
  };
}

// ---------------------------------------------------------------------------
// Security

const SECURITY_SCHEME_KEYS: Record<string, readonly string[]> = {
  http: ['scheme', 'bearerFormat'],
  apiKey: ['in', 'name'],
  openIdConnect: ['openIdConnectUrl'],
  oauth2: ['flows'],
};
const FLOW_NAMES = ['implicit', 'password', 'clientCredentials', 'authorizationCode'] as const;
const FLOWS_KEYS = new Set<string>(FLOW_NAMES);
const FLOW_KEYS = new Set(['authorizationUrl', 'tokenUrl', 'refreshUrl', 'scopes']);

function parseSecurityScheme(name: string, data: unknown, ctx: ParseContext): SecurityScheme {
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
    for (const key of FLOW_NAMES) {
      if (!rawFlows[key]) continue;
      const raw = asObject(rawFlows[key]);
      const flow: OAuthFlow = { scopes: { ...(asObject(raw.scopes) as Record<string, string>) } };
      if (typeof raw.authorizationUrl === 'string') flow.authorizationUrl = raw.authorizationUrl;
      if (typeof raw.tokenUrl === 'string') flow.tokenUrl = raw.tokenUrl;
      if (typeof raw.refreshUrl === 'string') flow.refreshUrl = raw.refreshUrl;
      const extra = extraOf(raw, FLOW_KEYS, ctx, `security scheme “${name}”`);
      if (extra) flow.extra = extra;
      flows[key] = flow;
    }
    const extra = extraOf(rawFlows, FLOWS_KEYS, ctx, `security scheme “${name}”`);
    if (extra) flows.extra = extra;
    scheme.flows = flows;
  }

  const known = new Set(['type', 'description', ...(SECURITY_SCHEME_KEYS[scheme.type] ?? [])]);
  const extra = extraOf(schemeData, known, ctx, `security scheme “${name}”`);
  if (extra) scheme.extra = extra;

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

// ---------------------------------------------------------------------------
// Operations

const OPERATION_KEYS = new Set([
  'summary', 'description', 'operationId', 'tags', 'security', 'parameters', 'requestBody', 'responses', 'deprecated',
]);

/** Resolve and parse a list of raw parameters, skipping empty or unresolvable entries. */
function parseParameterList(list: unknown[], ctx: ParseContext, where: string): ParameterDef[] {
  const result: ParameterDef[] = [];
  for (const raw of list) {
    if (raw === null || typeof raw !== 'object') continue;
    const resolved = resolveComponent(raw, 'parameters', ctx);
    if (resolved) result.push(parseParameter(resolved, ctx, false, where));
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
  const where = `${method.toUpperCase()} ${path}`;
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
  if (data.deprecated === true) {
    route.deprecated = true;
  }
  if (Array.isArray(data.security)) {
    // an explicit empty list means "no authentication" and overrides the root
    route.security = parseSecurityRequirements(data.security, ctx);
  }

  // Parameters: path-item level ones apply to every operation unless the
  // operation redefines the same name + location.
  const own = parseParameterList(Array.isArray(data.parameters) ? data.parameters : [], ctx, where);
  const inherited = parseParameterList(pathParameters, ctx, where).filter(
    (p) => !own.some((o) => o.name === p.name && o.in === p.in)
  );
  route.parameters = [...inherited, ...own];

  // Parse request body
  if (data.requestBody) {
    const body = resolveComponent(data.requestBody, 'requestBodies', ctx);
    if (body) route.requestBody = parseRequestBody(body, ctx, where);
  }

  // Parse responses (x-* keys of the Responses object are kept verbatim)
  const rawResponses = asObject(data.responses);
  let responseExtensions: ExtraFields | undefined;
  for (const statusCode of Object.keys(rawResponses)) {
    if (statusCode.startsWith('x-')) {
      setOwn((responseExtensions ??= {}), statusCode, rawResponses[statusCode]);
      continue;
    }
    const resolved = resolveComponent(rawResponses[statusCode], 'responses', ctx);
    route.responses.set(statusCode, parseResponse(resolved ?? {}, ctx, where));
  }

  // Ensure at least one response
  if (route.responses.size === 0) {
    route.responses.set('200', {
      id: generateId(),
      description: 'Successful response',
    });
  }

  const extra = extraOf(data, OPERATION_KEYS, ctx, where, data.deprecated === true ? undefined : ['deprecated']);
  if (extra || responseExtensions) {
    route.extra = { ...extra };
    // a bag entry named like a modelled container holds that container's extra entries
    if (responseExtensions) route.extra.responses = responseExtensions;
  }

  return route;
}

const PARAMETER_KEYS = new Set(['name', 'in', 'description', 'schema', 'example', 'required', 'content']);
const MEDIA_TYPE_KEYS = new Set(['schema', 'example']);

/** A header object is a parameter without `name` / `in` (the parser passes them in). */
function parseParameter(paramData: RawObject, ctx: ParseContext, isHeader: boolean, where: string): ParameterDef {
  const param: ParameterDef = {
    id: generateId(),
    name: (paramData.name as string) || 'param',
    in: (paramData.in as ParameterDef['in']) || 'query',
    required: paramData.required === true,
    schema: { kind: 'inline', schema: { id: generateId(), type: 'string' } },
    description: paramData.description as string | undefined,
    example: paramData.example,
  };
  const unconsumed: string[] = [];
  if (paramData.required !== true) unconsumed.push('required');

  const content = asObject(paramData.content);
  const mediaTypes = Object.keys(content);
  if (paramData.schema) {
    param.schema = parseSchemaOrRef(paramData.schema, ctx);
  } else if (mediaTypes.length > 0) {
    // `content` instead of `schema`: the media type's schema is the parameter's schema
    const media = asObject(content[mediaTypes[0]]);
    param.schema = media.schema ? parseSchemaOrRef(media.schema, ctx) : { kind: 'inline', schema: emptySchema() };
    param.content = { mediaType: mediaTypes[0] };
    const extra = extraOf(media, MEDIA_TYPE_KEYS_SCHEMA_ONLY, ctx, where);
    if (extra) param.content.extra = extra;
    if (mediaTypes.length > 1) {
      warn(
        ctx,
        'PARAMETER_CONTENT_ENTRIES',
        `${isHeader ? 'Header' : 'Parameter'} “${param.name}” in ${where} has several media types; only ${mediaTypes[0]} was kept.`,
      );
    }
  }
  if (!param.content) unconsumed.push('content');
  if (isHeader) param.in = 'header';

  const extra = extraOf(paramData, PARAMETER_KEYS, ctx, where, unconsumed);
  if (extra) param.extra = extra;
  return param;
}

const MEDIA_TYPE_KEYS_SCHEMA_ONLY = new Set(['schema']);

/** Placeholder for a media type without `schema` ("any"; export leaves `schema` out again). */
function emptySchema(): SchemaNode {
  return { id: generateId(), type: 'object', untyped: true };
}

function parseContent(content: unknown, ctx: ParseContext, where: string): Map<string, MediaType> {
  const result = new Map<string, MediaType>();
  const raw = asObject(content);
  for (const contentType of Object.keys(raw)) {
    const media = asObject(raw[contentType]);
    const parsed: MediaType = media.schema
      ? { schema: parseSchemaOrRef(media.schema, ctx), example: media.example }
      : { schema: { kind: 'inline', schema: emptySchema() }, example: media.example, schemaOmitted: true };
    const extra = extraOf(media, MEDIA_TYPE_KEYS, ctx, where, media.schema ? undefined : ['schema']);
    if (extra) parsed.extra = extra;
    result.set(contentType, parsed);
  }
  return result;
}

const REQUEST_BODY_KEYS = new Set(['description', 'content', 'required']);

function parseRequestBody(data: RawObject, ctx: ParseContext, where: string): RequestBody {
  const body: RequestBody = {
    id: generateId(),
    description: data.description as string | undefined,
    required: data.required === true,
    content: parseContent(data.content, ctx, where),
  };
  const extra = extraOf(data, REQUEST_BODY_KEYS, ctx, where, data.required === true ? undefined : ['required']);
  if (extra) body.extra = extra;
  return body;
}

const RESPONSE_KEYS = new Set(['description', 'content', 'headers']);

function parseResponse(data: RawObject, ctx: ParseContext, where: string): ResponseDef {
  const response: ResponseDef = {
    id: generateId(),
    description: (data.description as string) || 'Response',
  };

  if (isObject(data.content)) {
    response.content = parseContent(data.content, ctx, where);
  }

  if (isObject(data.headers)) {
    const headers = new Map<string, ParameterDef>();
    for (const headerName of Object.keys(data.headers)) {
      const resolved = resolveComponent(data.headers[headerName], 'headers', ctx);
      if (!resolved) continue;
      headers.set(headerName, parseParameter({ ...resolved, name: headerName, in: 'header' }, ctx, true, where));
    }
    if (headers.size > 0) response.headers = headers;
  }

  const unconsumed: string[] = [];
  if (!isObject(data.content)) unconsumed.push('content');
  if (!isObject(data.headers)) unconsumed.push('headers');
  const extra = extraOf(data, RESPONSE_KEYS, ctx, where, unconsumed);
  if (extra) response.extra = extra;

  return response;
}

const HTTP_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace']);

export function isHttpMethod(method: string): method is HttpMethod {
  return HTTP_METHODS.has(method);
}

/**
 * Parses an external standalone schema file (e.g. schemas/user.yaml).
 */
export function parseStandaloneSchema(
  data: unknown,
  name: string | undefined,
  id: NodeId = generateId(),
  schemaNameToId: Map<string, NodeId> = new Map(),
): { schema: SchemaNode; errors: ValidationError[] } {
  const ctx: ParseContext = {
    schemaNameToId,
    securitySchemeNameToId: new Map(),
    components: {},
    usedComponents: new Set(),
    refSiblings: 0,
    errors: [],
  };
  const schema = parseSchema(data, name, id, ctx);
  return { schema, errors: ctx.errors };
}

/**
 * Parses an external standalone path item file (e.g. paths/users.yaml).
 */
export function parseStandalonePathItem(
  path: string,
  data: unknown,
  schemaNameToId: Map<string, NodeId> = new Map(),
): { routes: Route[]; pathExtra?: ExtraFields; errors: ValidationError[] } {
  const ctx: ParseContext = {
    schemaNameToId,
    securitySchemeNameToId: new Map(),
    components: {},
    usedComponents: new Set(),
    refSiblings: 0,
    errors: [],
  };
  const pathItem = asObject(data);
  const pathParameters = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];
  let pathExtra: ExtraFields | undefined;
  const routes: Route[] = [];

  for (const key of Object.keys(pathItem)) {
    const method = key.toLowerCase();
    if (key === 'parameters') continue;
    if (!isHttpMethod(method)) {
      setOwn((pathExtra ??= {}), key, pathItem[key]);
      continue;
    }
    const operationData = pathItem[key];
    if (!isObject(operationData)) continue;

    const route = parseOperation(path, method, operationData, pathParameters, ctx);
    routes.push(route);
  }

  if (pathExtra) {
    for (const route of routes) {
      if (route.pathExtra === undefined) route.pathExtra = pathExtra;
    }
  }

  return { routes, pathExtra, errors: ctx.errors };
}
