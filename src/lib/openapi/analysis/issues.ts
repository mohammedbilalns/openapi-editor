/**
 * Validation issues as the UI consumes them (BLUEPRINT §2.6).
 *
 * `validateDocument` reports `{ code, message, severity, location }` where the
 * location is mostly just the owning route/schema id. `toIssues` turns that
 * into issues that know their entity, the field inside it (for inline
 * `aria-invalid` + IssueText) and the URL + hash anchor to jump to (§2.4).
 * It runs right after the validator, so it can look at the document
 * to recover sub-locations the validator doesn't report.
 */
import type {
  ApiDocument,
  HttpMethod,
  NodeId,
  Route,
  SchemaNode,
  SchemaOrRef,
  ValidationError,
  ValidationResult,
  ValidationSeverity,
} from '../types'
import { forEachMappingTarget } from '../refs'

// ---------------------------------------------------------------------------
// Types

/** Issue keys for document-level settings, usable with `useIssuesFor`. */
export const INFO_ISSUES = 'settings:info'
export const SERVERS_ISSUES = 'settings:servers'

export type IssueEntity =
  | { kind: 'route'; id: NodeId; method: HttpMethod; path: string }
  | { kind: 'schema'; id: NodeId; name: string }
  | { kind: 'settings'; section: 'info' | 'servers' }
  | { kind: 'document' }

/**
 * The field an issue belongs to, inside its entity. Build dynamic ones with
 * `issueField`:
 * - route: `path`, `operationId`, `responses`, `requestBody`, `param:{paramId}`, `response:{code}`
 * - schema: `name`, `fields`, `field:{name}`, `items`, `enum`, `variants`, `discriminator`
 * - info: `title`, `version`, `description`; servers: `servers`
 */
export type IssueField = string

export const issueField = {
  param: (paramId: NodeId): IssueField => `param:${paramId}`,
  response: (code: string): IssueField => `response:${code}`,
  field: (name: string): IssueField => `field:${name}`,
} as const

export interface Issue {
  /** Unique within one validation result and stable across runs for the same problem. */
  key: string
  code: string
  message: string
  severity: ValidationSeverity
  /** `useIssuesFor` key: the route/schema id, `INFO_ISSUES` or `SERVERS_ISSUES`. */
  owner: string
  entity: IssueEntity
  field?: IssueField
  /** Short mono location inside the entity ("parameters.petId", "info.title"). */
  location: string
}

// ---------------------------------------------------------------------------
// Consuming issues

const EMPTY: readonly Issue[] = Object.freeze([])

/** Errors and warnings for one field (info-level issues stay in the Problems list, §2.6). */
export function fieldIssues(issues: readonly Issue[] | undefined, field: IssueField): readonly Issue[] {
  if (!issues || issues.length === 0) return EMPTY
  const matching = issues.filter((issue) => issue.field === field && issue.severity !== 'info')
  return matching.length === 0 ? EMPTY : matching
}

export type IssueControlProps = {
  'aria-invalid': true | undefined
  'aria-describedby': string | undefined
}

/**
 * Props to spread on the control for `field`: `aria-invalid` (destructive ring,
 * §9.8) only when it has errors, and `aria-describedby` pointing at the issue
 * text FieldRow/IssueText renders with id `${controlId}-issues` whenever it has
 * errors or warnings (warnings get the text line, not the red ring; §2.6).
 *
 * ```tsx
 * const issues = useIssuesFor(routeId)
 * <FieldRow label="Operation ID" htmlFor="op-id" issues={fieldIssues(issues, 'operationId')}>
 *   <Input id="op-id" {...issueProps(issues, 'operationId', 'op-id')} />
 * </FieldRow>
 * ```
 */
export function issueProps(
  issues: readonly Issue[] | undefined,
  field: IssueField,
  controlId?: string,
): IssueControlProps {
  const matching = fieldIssues(issues, field)
  if (matching.length === 0) return { 'aria-invalid': undefined, 'aria-describedby': undefined }
  return {
    'aria-invalid': matching.some((issue) => issue.severity === 'error') ? true : undefined,
    'aria-describedby': controlId ? `${controlId}-issues` : undefined,
  }
}

export type ProblemLink =
  | { to: '/routes/$routeId'; params: { routeId: string }; hash?: string }
  | { to: '/schemas/$schemaId'; params: { schemaId: string }; hash?: string }
  | { to: '/settings/$section'; params: { section: 'info' | 'servers' }; hash?: string }
  | { to: '/'; params?: undefined; hash?: undefined }

/** Hash anchor inside the entity page (BLUEPRINT §2.4), without the `#`. */
export function problemHash(issue: Pick<Issue, 'entity' | 'field'>): string | undefined {
  const { field, entity } = issue
  if (!field) return undefined
  if (entity.kind === 'route') {
    if (field.startsWith('param:')) return `param-${field.slice('param:'.length)}`
    if (field.startsWith('response:')) return `response-${field.slice('response:'.length)}`
    if (field === 'requestBody') return 'request-body'
    return undefined
  }
  if (entity.kind === 'schema' && field.startsWith('field:')) {
    return `field-${encodeURIComponent(field.slice('field:'.length))}`
  }
  return undefined
}

/** Typed TanStack `<Link>` props for an issue: `<Link {...problemLink(issue)} />`. */
export function problemLink(issue: Pick<Issue, 'entity' | 'field'>): ProblemLink {
  const hash = problemHash(issue)
  const { entity } = issue
  switch (entity.kind) {
    case 'route':
      return { to: '/routes/$routeId', params: { routeId: entity.id }, hash }
    case 'schema':
      return { to: '/schemas/$schemaId', params: { schemaId: entity.id }, hash }
    case 'settings':
      return { to: '/settings/$section', params: { section: entity.section }, hash }
    case 'document':
      return { to: '/' }
  }
}

/** The URL (path + hash) that shows an issue, e.g. `/routes/{id}#param-{paramId}`. */
export function problemHref(issue: Pick<Issue, 'entity' | 'field'>): string {
  const link = problemLink(issue)
  let path: string
  switch (link.to) {
    case '/routes/$routeId':
      path = `/routes/${encodeURIComponent(link.params.routeId)}`
      break
    case '/schemas/$schemaId':
      path = `/schemas/${encodeURIComponent(link.params.schemaId)}`
      break
    case '/settings/$section':
      path = `/settings/${link.params.section}`
      break
    default:
      path = '/'
  }
  return link.hash ? `${path}#${link.hash}` : path
}

/** Heading for the entity's group in the Problems list. */
export function entityLabel(entity: IssueEntity): string {
  switch (entity.kind) {
    case 'route':
      return `${entity.method.toUpperCase()} ${entity.path}`
    case 'schema':
      return entity.name
    case 'settings':
      return entity.section === 'info' ? 'API info' : 'Servers'
    case 'document':
      return 'Document'
  }
}

export function entityKey(entity: IssueEntity): string {
  switch (entity.kind) {
    case 'route':
    case 'schema':
      return entity.id
    case 'settings':
      return `settings:${entity.section}`
    case 'document':
      return 'document'
  }
}

export type IssueCounts = { errors: number; warnings: number; infos: number }

export function countIssues(issues: readonly Issue[]): IssueCounts {
  const counts = { errors: 0, warnings: 0, infos: 0 }
  for (const issue of issues) {
    if (issue.severity === 'error') counts.errors += 1
    else if (issue.severity === 'warning') counts.warnings += 1
    else counts.infos += 1
  }
  return counts
}

// ---------------------------------------------------------------------------
// Building issues from a validation result

type Located = { field?: IssueField; location: string }

const ROUTE_FIELD_BY_CODE: Record<string, Located> = {
  DUPLICATE_OPERATION: { field: 'path', location: 'path' },
  UNDEFINED_PATH_PARAM: { field: 'path', location: 'path' },
  DUPLICATE_OPERATION_ID: { field: 'operationId', location: 'operationId' },
  OPERATION_ID_NAMING: { field: 'operationId', location: 'operationId' },
  MISSING_OPERATION_ID: { field: 'operationId', location: 'operationId' },
  NO_RESPONSES: { field: 'responses', location: 'responses' },
  NO_SUCCESS_RESPONSE: { field: 'responses', location: 'responses' },
  NO_ERROR_RESPONSE: { field: 'responses', location: 'responses' },
}

const SCHEMA_FIELD_BY_CODE: Record<string, Located> = {
  DUPLICATE_SCHEMA_NAME: { field: 'name', location: 'name' },
  UNNAMED_SCHEMA: { field: 'name', location: 'name' },
  SCHEMA_NAMING_CONVENTION: { field: 'name', location: 'name' },
  EMPTY_OBJECT: { field: 'fields', location: 'properties' },
  EMPTY_ENUM: { field: 'enum', location: 'enum' },
  DUPLICATE_ENUM_VALUE: { field: 'enum', location: 'enum' },
  MISSING_ARRAY_ITEMS: { field: 'items', location: 'items' },
  EMPTY_COMPOSITION: { field: 'variants', location: 'variants' },
  SINGLE_VARIANT: { field: 'variants', location: 'variants' },
  MISSING_DISCRIMINATOR: { field: 'discriminator', location: 'discriminator' },
  ORPHANED_SCHEMA: { location: '' },
  CIRCULAR_REFERENCE: { location: '' },
}

/** Mirrors the validator's `checkRef` walk: how many broken refs a schema slot reports. */
function brokenRefCount(value: SchemaOrRef | undefined, valid: Map<NodeId, unknown>): number {
  if (!value) return 0
  if (value.kind === 'ref') return valid.has(value.targetId) ? 0 : 1
  return brokenRefsInSchema(value.schema, valid)
}

function brokenRefsInSchema(schema: SchemaNode, valid: Map<NodeId, unknown>): number {
  let count = 0
  if (schema.properties) for (const prop of schema.properties.values()) count += brokenRefCount(prop.schema, valid)
  count += brokenRefCount(schema.items, valid)
  if (schema.variants) for (const variant of schema.variants) count += brokenRefCount(variant, valid)
  count += brokenRefCount(schema.additionalProperties, valid)
  count += brokenRefCount(schema.not, valid)
  forEachMappingTarget(schema, (targetId) => {
    if (!valid.has(targetId)) count += 1
  })
  return count
}

function repeat(into: Located[], located: Located, times: number) {
  for (let i = 0; i < times; i += 1) into.push(located)
}

/** Locations of a route's broken refs, in the order the validator reports them. */
function routeBrokenRefLocations(route: Route, doc: ApiDocument): Located[] {
  const out: Located[] = []
  for (const param of route.parameters) {
    repeat(out, { field: issueField.param(param.id), location: `parameters.${param.name}` }, brokenRefCount(param.schema, doc.schemas))
  }
  if (route.requestBody?.content) {
    for (const media of route.requestBody.content.values()) {
      repeat(out, { field: 'requestBody', location: 'requestBody' }, brokenRefCount(media.schema, doc.schemas))
    }
  }
  for (const [code, response] of route.responses) {
    if (!response.content) continue
    for (const media of response.content.values()) {
      repeat(out, { field: issueField.response(code), location: `responses.${code}` }, brokenRefCount(media.schema, doc.schemas))
    }
  }
  return out
}

/** Locations of a schema's broken refs, in the order the validator reports them. */
function schemaBrokenRefLocations(schema: SchemaNode, doc: ApiDocument): Located[] {
  const out: Located[] = []
  if (schema.properties) {
    for (const [name, prop] of schema.properties) {
      repeat(out, { field: issueField.field(name), location: `properties.${name}` }, brokenRefCount(prop.schema, doc.schemas))
    }
  }
  repeat(out, { field: 'items', location: 'items' }, brokenRefCount(schema.items, doc.schemas))
  if (schema.variants) {
    for (const variant of schema.variants) {
      repeat(out, { field: 'variants', location: 'variants' }, brokenRefCount(variant, doc.schemas))
    }
  }
  repeat(out, { location: 'additionalProperties' }, brokenRefCount(schema.additionalProperties, doc.schemas))
  repeat(out, { location: 'not' }, brokenRefCount(schema.not, doc.schemas))
  forEachMappingTarget(schema, (targetId) => {
    if (!doc.schemas.has(targetId)) out.push({ field: 'discriminator', location: 'discriminator' })
  })
  return out
}

function successResponseCode(route: Route): string | undefined {
  if (route.responses.has('200')) return '200'
  if (route.responses.has('201')) return '201'
  return undefined
}

const SETTINGS_PATHS: Record<string, Located & { section: 'info' | 'servers' }> = {
  'info.title': { section: 'info', field: 'title', location: 'info.title' },
  'info.version': { section: 'info', field: 'version', location: 'info.version' },
  'info.description': { section: 'info', field: 'description', location: 'info.description' },
  info: { section: 'info', location: 'info' },
  servers: { section: 'servers', field: 'servers', location: 'servers' },
}

/**
 * Checks the validator doesn't do yet (see the D report): path parameters that
 * aren't in the path, and servers without a URL.
 */
export function supplementaryChecks(doc: ApiDocument): ValidationError[] {
  const out: ValidationError[] = []
  for (const route of doc.routes.values()) {
    const inPath = new Set<string>()
    for (const match of route.path.matchAll(/\{([^}]+)\}/g)) inPath.add(match[1])
    for (const param of route.parameters) {
      if (param.in === 'path' && !inPath.has(param.name)) {
        out.push({
          code: 'EXTRA_PATH_PARAM',
          message: `Path parameter {${param.name}} is not in the path.`,
          severity: 'error',
          location: { nodeId: route.id, path: ['parameters', param.id] },
        })
      }
    }
  }
  doc.servers.forEach((server, index) => {
    if (!server.url.trim()) {
      out.push({
        code: 'EMPTY_SERVER_URL',
        message: `Server ${index + 1} has no URL.`,
        severity: 'error',
        location: { path: ['servers'] },
      })
    }
  })
  return out
}

const SEVERITY_ORDER: Record<ValidationSeverity, number> = { error: 0, warning: 1, info: 2 }
const METHOD_ORDER: readonly HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

function entityRank(entity: IssueEntity): number {
  switch (entity.kind) {
    case 'settings':
      return entity.section === 'info' ? 0 : 1
    case 'document':
      return 2
    case 'route':
      return 3
    case 'schema':
      return 4
  }
}

function compareEntities(a: IssueEntity, b: IssueEntity): number {
  const rank = entityRank(a) - entityRank(b)
  if (rank !== 0) return rank
  if (a.kind === 'route' && b.kind === 'route') {
    if (a.path !== b.path) return a.path < b.path ? -1 : 1
    const method = METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method)
    if (method !== 0) return method
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  }
  if (a.kind === 'schema' && b.kind === 'schema') {
    return collator.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  }
  return 0
}

/**
 * Turns a validation result into located, sorted issues: grouped by entity
 * (API info, servers, routes by path + method, schemas by name), errors first
 * inside each entity.
 */
export function toIssues(doc: ApiDocument, result: ValidationResult, extra: readonly ValidationError[] = []): Issue[] {
  const raw = [...result.errors, ...result.warnings, ...extra]
  const brokenRoute = new Map<NodeId, Located[]>()
  const brokenSchema = new Map<NodeId, Located[]>()
  const issues: Issue[] = []
  const seen = new Map<string, number>()

  const push = (error: ValidationError, owner: string, entity: IssueEntity, located: Located) => {
    const base = `${error.code}|${owner}|${located.field ?? ''}`
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    issues.push({
      key: n === 0 ? base : `${base}|${n}`,
      code: error.code,
      message: error.message,
      severity: error.severity,
      owner,
      entity,
      field: located.field,
      location: located.location,
    })
  }

  for (const error of raw) {
    const { nodeId, path } = error.location
    const route = nodeId ? doc.routes.get(nodeId) : undefined
    const schema = !route && nodeId ? doc.schemas.get(nodeId) : undefined

    if (route) {
      const entity: IssueEntity = { kind: 'route', id: route.id, method: route.method, path: route.path }
      let located: Located = ROUTE_FIELD_BY_CODE[error.code] ?? { location: '' }
      if (error.code === 'SUCCESS_WITHOUT_BODY') {
        const code = successResponseCode(route)
        located = code ? { field: issueField.response(code), location: `responses.${code}` } : { location: 'responses' }
      } else if (error.code === 'BROKEN_REFERENCE') {
        let queue = brokenRoute.get(route.id)
        if (!queue) {
          queue = routeBrokenRefLocations(route, doc)
          brokenRoute.set(route.id, queue)
        }
        located = queue.shift() ?? { location: '' }
      } else if (path?.[0] === 'parameters' && path[1]) {
        const param = route.parameters.find((p) => p.id === path[1])
        if (param) located = { field: issueField.param(param.id), location: `parameters.${param.name}` }
      }
      push(error, route.id, entity, located)
      continue
    }

    if (schema) {
      const entity: IssueEntity = { kind: 'schema', id: schema.id, name: schema.name || 'Unnamed schema' }
      let located: Located = SCHEMA_FIELD_BY_CODE[error.code] ?? { location: '' }
      if (error.code === 'INVALID_REQUIRED' && error.location.field) {
        located = { field: issueField.field(error.location.field), location: `required.${error.location.field}` }
      } else if (error.code === 'BROKEN_REFERENCE') {
        let queue = brokenSchema.get(schema.id)
        if (!queue) {
          queue = schemaBrokenRefLocations(schema, doc)
          brokenSchema.set(schema.id, queue)
        }
        located = queue.shift() ?? { location: '' }
      } else if (error.location.field && !SCHEMA_FIELD_BY_CODE[error.code]) {
        located = { field: issueField.field(error.location.field), location: `properties.${error.location.field}` }
      }
      push(error, schema.id, entity, located)
      continue
    }

    const settings = path ? (SETTINGS_PATHS[path.join('.')] ?? SETTINGS_PATHS[path[0]]) : undefined
    if (settings) {
      push(error, settings.section === 'info' ? INFO_ISSUES : SERVERS_ISSUES, { kind: 'settings', section: settings.section }, settings)
      continue
    }

    push(error, 'document', { kind: 'document' }, { location: path?.join('.') ?? '' })
  }

  // Stable sort: entity order, then severity; validator order is kept otherwise.
  return issues
    .map((issue, index) => ({ issue, index }))
    .toSorted(
      (a, b) =>
        compareEntities(a.issue.entity, b.issue.entity) ||
        SEVERITY_ORDER[a.issue.severity] - SEVERITY_ORDER[b.issue.severity] ||
        a.index - b.index,
    )
    .map(({ issue }) => issue)
}
