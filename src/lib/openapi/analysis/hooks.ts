/**
 * React access to analysis results (BLUEPRINT §2.6, §5.4).
 *
 * Validation runs whenever anything is subscribed (sidebar count, entity
 * chips, inline issues, Problems tab): 500ms after the last document change,
 * in an idle callback. Results keep their identity per owner between runs, so
 * `useIssuesFor(id)` only re-renders when that entity's issues change.
 *
 * YAML is serialized only while `useSerializedYaml(true)` is mounted (the YAML
 * tab is visible) or on export, 300ms after the last change, in an idle
 * callback. Both run against the live document so the serializer's per-node
 * cache (keyed on object identity) stays warm.
 */
import * as React from 'react'
import { useEditorStore } from '../store'
import type { ApiDocument, NodeId } from '../types'
import { getAnalysisClient } from './client'
import { countIssues, entityLabel, type Issue, type IssueCounts } from './issues'
import type { SerializeResult } from './handler'

export const VALIDATION_DEBOUNCE_MS = 500
export const YAML_DEBOUNCE_MS = 300

const EMPTY_ISSUES: readonly Issue[] = Object.freeze([])

// ---------------------------------------------------------------------------
// Validation

export type ValidationSnapshot = {
  /** Sorted: API info, servers, routes (path, method), schemas (name); errors first per entity. */
  issues: readonly Issue[]
  /** Issues per owner (route/schema id, `INFO_ISSUES`, `SERVERS_ISSUES`). */
  byOwner: ReadonlyMap<string, readonly Issue[]>
  counts: IssueCounts
  /** True from a document change until its validation lands. */
  pending: boolean
  /** Set when the last run failed. */
  error: string | null
}

let snapshot: ValidationSnapshot = {
  issues: EMPTY_ISSUES,
  byOwner: new Map(),
  counts: { errors: 0, warnings: 0, infos: 0 },
  pending: true,
  error: null,
}
const listeners = new Set<() => void>()
let stopDriver: (() => void) | null = null
let validatedDoc: ApiDocument | null = null

function publish(next: ValidationSnapshot) {
  snapshot = next
  for (const listener of listeners) listener()
}

function sameIssue(a: Issue, b: Issue): boolean {
  return (
    a.key === b.key &&
    a.message === b.message &&
    a.severity === b.severity &&
    a.location === b.location &&
    entityLabel(a.entity) === entityLabel(b.entity)
  )
}

function sameList(a: readonly Issue[], b: readonly Issue[]): boolean {
  return a.length === b.length && a.every((issue, i) => sameIssue(issue, b[i]))
}

function commit(doc: ApiDocument, issues: Issue[]) {
  validatedDoc = doc
  const prev = snapshot
  const grouped = new Map<string, Issue[]>()
  for (const issue of issues) {
    const list = grouped.get(issue.owner)
    if (list) list.push(issue)
    else grouped.set(issue.owner, [issue])
  }
  const byOwner = new Map<string, readonly Issue[]>()
  for (const [owner, list] of grouped) {
    const before = prev.byOwner.get(owner)
    byOwner.set(owner, before && sameList(before, list) ? before : list)
  }
  const nextIssues = sameList(prev.issues, issues) ? prev.issues : issues
  const counts = countIssues(nextIssues)
  const sameCounts =
    counts.errors === prev.counts.errors && counts.warnings === prev.counts.warnings && counts.infos === prev.counts.infos
  publish({
    issues: nextIssues,
    byOwner,
    counts: sameCounts ? prev.counts : counts,
    pending: useEditorStore.getState().document !== doc,
    error: null,
  })
}

async function validateNow(doc: ApiDocument) {
  try {
    const settled = await getAnalysisClient().validate(doc)
    if (settled.stale) return
    commit(doc, settled.value)
  } catch (error) {
    publish({ ...snapshot, pending: false, error: error instanceof Error ? error.message : String(error) })
  }
}

function startDriver(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = (doc: ApiDocument, delay: number) => {
    if (!snapshot.pending) publish({ ...snapshot, pending: true })
    clearTimeout(timer)
    timer = setTimeout(() => void validateNow(doc), delay)
  }
  const unsubscribe = useEditorStore.subscribe((state, prev) => {
    if (state.document !== prev.document) schedule(state.document, VALIDATION_DEBOUNCE_MS)
  })
  const current = useEditorStore.getState().document
  if (current !== validatedDoc) schedule(current, 0)
  return () => {
    unsubscribe()
    clearTimeout(timer)
  }
}

function subscribeValidation(listener: () => void) {
  listeners.add(listener)
  stopDriver ??= startDriver()
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && stopDriver) {
      stopDriver()
      stopDriver = null
    }
  }
}

const getSnapshot = () => snapshot

/** All issues, counts and whether a run is pending. */
export function useValidationIssues(): ValidationSnapshot {
  return React.useSyncExternalStore(subscribeValidation, getSnapshot, getSnapshot)
}

/** Error/warning/info counts; keeps its identity while the counts don't change. */
export function useProblemCounts(): IssueCounts {
  return React.useSyncExternalStore(subscribeValidation, () => snapshot.counts, () => snapshot.counts)
}

/**
 * Issues owned by a route or schema id (or `INFO_ISSUES` / `SERVERS_ISSUES`).
 * Stable identity while they don't change; an empty frozen array when clean.
 */
export function useIssuesFor(owner: NodeId | string): readonly Issue[] {
  const get = () => snapshot.byOwner.get(owner) ?? EMPTY_ISSUES
  return React.useSyncExternalStore(subscribeValidation, get, get)
}

/** Non-React read of the latest validation result. */
export function getValidationSnapshot(): ValidationSnapshot {
  return snapshot
}

/** Tests: forget results and stop the driver. */
export function resetValidationForTests(): void {
  stopDriver?.()
  stopDriver = null
  listeners.clear()
  validatedDoc = null
  snapshot = { issues: EMPTY_ISSUES, byOwner: new Map(), counts: { errors: 0, warnings: 0, infos: 0 }, pending: true, error: null }
}

// ---------------------------------------------------------------------------
// YAML

let lastYaml: { doc: ApiDocument; result: SerializeResult } | null = null

/** The serialization of `doc` if it is the last one produced. */
export function getCachedYaml(doc: ApiDocument): SerializeResult | null {
  return lastYaml && lastYaml.doc === doc ? lastYaml.result : null
}

export function rememberYaml(doc: ApiDocument, result: SerializeResult): void {
  lastYaml = { doc, result }
}

export type SerializedYaml = {
  /** Latest serialization (possibly of an older document while `pending`). */
  result: SerializeResult | null
  pending: boolean
  error: string | null
}

/**
 * The current document as YAML plus its line index, serialized while
 * `enabled`. Keeps showing the previous output while an update is pending.
 */
export function useSerializedYaml(enabled: boolean): SerializedYaml {
  const doc = useEditorStore((s) => s.document)
  const [state, setState] = React.useState<{ doc: ApiDocument | null; result: SerializeResult | null; error: string | null }>(
    () => ({ doc: lastYaml?.doc ?? null, result: lastYaml?.result ?? null, error: null }),
  )

  React.useEffect(() => {
    if (!enabled || state.doc === doc) return
    let active = true
    const cached = getCachedYaml(doc)
    const delay = cached || state.result === null ? 0 : YAML_DEBOUNCE_MS
    const timer = setTimeout(async () => {
      if (cached) {
        setState({ doc, result: cached, error: null })
        return
      }
      try {
        const settled = await getAnalysisClient().serialize(doc)
        if (settled.stale) return
        rememberYaml(doc, settled.value)
        // Even when this effect was superseded, a newer result than what's shown is worth showing.
        setState((prev) => (prev.doc === doc ? prev : { doc, result: settled.value, error: null }))
      } catch (error) {
        if (active) setState((prev) => ({ ...prev, doc, error: error instanceof Error ? error.message : String(error) }))
      }
    }, delay)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [enabled, doc, state.doc, state.result])

  return { result: state.result, pending: enabled && state.doc !== doc, error: state.error }
}
