/**
 * Read hooks over the editor store (BLUEPRINT §4 A, §5.1). Every component reads
 * through these (or a narrow `useEditorStore(selector)`), never the bare store.
 *
 * Derived values are memoized on the identity of the Maps/arrays they come from,
 * at module level, so every subscriber shares one computation and the selector
 * returns the same reference until its inputs change.
 */
import { useEditorStore } from './store'
import type {
  HttpMethod,
  InfoObject,
  NodeId,
  Route,
  SchemaNode,
  SchemaOrRef,
  SchemaType,
  SecurityScheme,
  Server,
  Tag,
} from './types'

type EditorState = ReturnType<typeof useEditorStore.getState>

// ---------------------------------------------------------------------------
// Memo helpers

/** Single-entry memo keyed on argument identity. */
function memoByRef<A extends readonly unknown[], R>(compute: (...args: A) => R, reuse?: (prev: R, next: R) => boolean) {
  let lastArgs: A | undefined
  let lastResult: R
  return (...args: A): R => {
    if (lastArgs && args.length === lastArgs.length && args.every((arg, i) => Object.is(arg, lastArgs![i]))) {
      return lastResult
    }
    const next = compute(...args)
    lastResult = lastArgs && reuse?.(lastResult, next) ? lastResult : next
    lastArgs = args
    return lastResult
  }
}

// ---------------------------------------------------------------------------
// Entities

export const useRoute = (id: NodeId): Route | undefined => useEditorStore((s) => s.document.routes.get(id))

export const useSchema = (id: NodeId): SchemaNode | undefined => useEditorStore((s) => s.document.schemas.get(id))

export const useSchemaName = (id: NodeId): string | undefined =>
  useEditorStore((s) => s.document.schemas.get(id)?.name)

export const useInfo = (): InfoObject => useEditorStore((s) => s.document.info)

export const useTags = (): Tag[] => useEditorStore((s) => s.document.tags)

export const useServers = (): Server[] => useEditorStore((s) => s.document.servers)

export const useSecuritySchemes = (): Map<NodeId, SecurityScheme> => useEditorStore((s) => s.document.securitySchemes)

export const useRouteCount = (): number => useEditorStore((s) => s.document.routes.size)

export const useSchemaCount = (): number => useEditorStore((s) => s.document.schemas.size)

// ---------------------------------------------------------------------------
// Route tree (sidebar)

/** Method order within a path (BLUEPRINT §2.2). */
export const METHOD_ORDER: readonly HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head']

export const UNTAGGED_GROUP_KEY = '__untagged__'

export type SidebarGroupRow = {
  kind: 'group'
  /** Stable key, also the key in UI prefs' `collapsedGroups`. The tag name, or `UNTAGGED_GROUP_KEY`. */
  key: string
  /** The tag name; `null` for the "Untagged" group. */
  tag: string | null
  label: string
  count: number
}

export type SidebarRouteRow = {
  kind: 'route'
  /** Unique per row: a route with several tags appears once per group. */
  key: string
  /** Key of the owning group; `null` in a flat list (no route has tags). */
  groupKey: string | null
  id: NodeId
  method: HttpMethod
  path: string
  deprecated: boolean
  route: Route
}

export type SidebarRow = SidebarGroupRow | SidebarRouteRow

function compareRoutes(a: Route, b: Route): number {
  if (a.path !== b.path) return a.path < b.path ? -1 : 1
  return METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method)
}

function routeRow(route: Route, groupKey: string | null): SidebarRouteRow {
  return {
    kind: 'route',
    key: groupKey === null ? route.id : `${groupKey}\u0000${route.id}`,
    groupKey,
    id: route.id,
    method: route.method,
    path: route.path,
    deprecated: route.deprecated === true,
    route,
  }
}

/**
 * Flattened sidebar rows: groups by tag (defined tag order, then unknown tags in
 * order of first use, "Untagged" last; multi-tag routes appear in each group),
 * or a flat list when no route has tags. Rows are sorted by path, then method.
 * Collapsing is applied by the caller.
 */
export const buildRouteTree = memoByRef((routes: Map<NodeId, Route>, tags: Tag[]): SidebarRow[] => {
  const sorted = [...routes.values()].toSorted(compareRoutes)
  if (!sorted.some((route) => route.tags.length > 0)) {
    return sorted.map((route) => routeRow(route, null))
  }

  const byTag = new Map<string, Route[]>()
  const untagged: Route[] = []
  for (const route of sorted) {
    if (route.tags.length === 0) {
      untagged.push(route)
      continue
    }
    for (const tag of new Set(route.tags)) {
      const list = byTag.get(tag)
      if (list) list.push(route)
      else byTag.set(tag, [route])
    }
  }

  const order: string[] = []
  for (const tag of tags) if (byTag.has(tag.name) && !order.includes(tag.name)) order.push(tag.name)
  for (const route of sorted) for (const tag of route.tags) if (!order.includes(tag)) order.push(tag)

  const rows: SidebarRow[] = []
  for (const tag of order) {
    const list = byTag.get(tag)!
    rows.push({ kind: 'group', key: tag, tag, label: tag, count: list.length })
    for (const route of list) rows.push(routeRow(route, tag))
  }
  if (untagged.length > 0) {
    rows.push({ kind: 'group', key: UNTAGGED_GROUP_KEY, tag: null, label: 'Untagged', count: untagged.length })
    for (const route of untagged) rows.push(routeRow(route, UNTAGGED_GROUP_KEY))
  }
  return rows
})

export const useRouteTree = (): SidebarRow[] =>
  useEditorStore((s) => buildRouteTree(s.document.routes, s.document.tags))

// ---------------------------------------------------------------------------
// Schema options (pickers, sidebar)

export type SchemaOption = { id: NodeId; name: string; type: SchemaType }

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

function sameOptions(a: SchemaOption[], b: SchemaOption[]): boolean {
  if (a.length !== b.length) return false
  return a.every((option, i) => option.id === b[i].id && option.name === b[i].name && option.type === b[i].type)
}

/**
 * Named schemas sorted case-insensitively. Keeps its identity when a schema
 * changes in a way that doesn't affect id, name or type (e.g. a description edit).
 */
export const buildSchemaOptions = memoByRef(
  (schemas: Map<NodeId, SchemaNode>): SchemaOption[] =>
    [...schemas.values()]
      .map((schema) => ({ id: schema.id, name: schema.name ?? '', type: schema.type }))
      .toSorted((a, b) => collator.compare(a.name, b.name) || (a.id < b.id ? -1 : 1)),
  sameOptions,
)

export const useSchemaOptions = (): SchemaOption[] => useEditorStore((s) => buildSchemaOptions(s.document.schemas))

// ---------------------------------------------------------------------------
// Schema usage (who references each schema)

export type SchemaReferrer = { kind: 'route' | 'schema'; id: NodeId; label: string }

function collectRefs(value: SchemaOrRef | undefined, into: Set<NodeId>, seen: Set<SchemaNode>) {
  if (!value) return
  if (value.kind === 'ref') {
    into.add(value.targetId)
    return
  }
  collectSchemaRefs(value.schema, into, seen)
}

function collectSchemaRefs(schema: SchemaNode, into: Set<NodeId>, seen: Set<SchemaNode>) {
  if (seen.has(schema)) return
  seen.add(schema)
  if (schema.properties) for (const prop of schema.properties.values()) collectRefs(prop.schema, into, seen)
  collectRefs(schema.items, into, seen)
  if (schema.variants) for (const variant of schema.variants) collectRefs(variant, into, seen)
}

function routeRefs(route: Route): Set<NodeId> {
  const refs = new Set<NodeId>()
  const seen = new Set<SchemaNode>()
  for (const param of route.parameters) collectRefs(param.schema, refs, seen)
  if (route.requestBody) for (const media of route.requestBody.content.values()) collectRefs(media.schema, refs, seen)
  for (const response of route.responses.values()) {
    if (response.content) for (const media of response.content.values()) collectRefs(media.schema, refs, seen)
    if (response.headers) for (const header of response.headers.values()) collectRefs(header.schema, refs, seen)
  }
  return refs
}

/**
 * For each referenced schema id, the routes and schemas that reference it (each
 * referrer once; inline schemas are searched; self-references are ignored).
 * One pass per document change.
 */
export const buildSchemaUsage = memoByRef(
  (routes: Map<NodeId, Route>, schemas: Map<NodeId, SchemaNode>): Map<NodeId, SchemaReferrer[]> => {
    const usage = new Map<NodeId, SchemaReferrer[]>()
    const add = (target: NodeId, referrer: SchemaReferrer) => {
      const list = usage.get(target)
      if (list) list.push(referrer)
      else usage.set(target, [referrer])
    }
    for (const route of routes.values()) {
      const label = `${route.method.toUpperCase()} ${route.path}`
      for (const target of routeRefs(route)) add(target, { kind: 'route', id: route.id, label })
    }
    for (const schema of schemas.values()) {
      const refs = new Set<NodeId>()
      collectSchemaRefs(schema, refs, new Set())
      refs.delete(schema.id)
      const label = schema.name || 'Unnamed schema'
      for (const target of refs) add(target, { kind: 'schema', id: schema.id, label })
    }
    return usage
  },
)

export const useSchemaUsage = (): Map<NodeId, SchemaReferrer[]> =>
  useEditorStore((s) => buildSchemaUsage(s.document.routes, s.document.schemas))

/** Non-React read of the current usage map (e.g. before a delete confirm). */
export function getSchemaUsage(): Map<NodeId, SchemaReferrer[]> {
  const { document } = useEditorStore.getState()
  return buildSchemaUsage(document.routes, document.schemas)
}

// ---------------------------------------------------------------------------
// History

export const useCanUndo = (): boolean => useEditorStore((s) => s.canUndo())

export const useCanRedo = (): boolean => useEditorStore((s) => s.canRedo())

// ---------------------------------------------------------------------------
// Actions

type FunctionKeys<T> = { [K in keyof T]: T[K] extends (...args: never[]) => unknown ? K : never }[keyof T]

/** Every store action (functions only), with stable identities. */
export type EditorActions = Pick<EditorState, FunctionKeys<EditorState>>

let actionsCache: EditorActions | undefined

/** The store's actions for non-React code. Same object as `useActions()`. */
export function getActions(): EditorActions {
  if (!actionsCache) {
    const state = useEditorStore.getState()
    const entries = Object.entries(state).filter(([, value]) => typeof value === 'function')
    // Zustand action functions are created once with the store, so this object never goes stale.
    actionsCache = Object.freeze(Object.fromEntries(entries)) as EditorActions
  }
  return actionsCache
}

/** Store actions. Doesn't subscribe, so it never causes a re-render. */
export const useActions = (): EditorActions => getActions()
