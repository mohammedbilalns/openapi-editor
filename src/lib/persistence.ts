/**
 * Document persistence outside React (BLUEPRINT §5.5).
 *
 * - `hydrateDocument()` loads the saved document once per page load (the `_app` loader).
 * - `startAutosave()` subscribes to the store and writes to IndexedDB 250ms after the
 *   last change (at most 2s after the first of a burst), and flushes on `pagehide` /
 *   `visibilitychange` hidden. Flushes issue the IndexedDB write synchronously.
 * - While a change is unsaved or still being written, a `beforeunload` handler
 *   asks the browser to confirm leaving (and flushes); it is removed once the write lands.
 * - Another tab saving the same document puts this one in `conflict`: it stops
 *   saving (the repository refuses stale writes) and offers a reload. Tabs tell
 *   each other about saves over a BroadcastChannel so this shows up promptly.
 * - `saveNow()` flushes immediately (Mod+S, Retry). `retryLoad()` retries a failed load.
 * - `useSaveStatus()` exposes the state for the sidebar footer.
 */
import { create } from 'zustand'
import { useEditorStore } from '@/lib/openapi/store'
import type { ApiDocument } from '@/lib/openapi/types'
import { getRepository, SaveConflictError, type ProjectMetadata } from '@/lib/storage'

export const DEFAULT_PROJECT_ID = 'default'
const DEFAULT_PROJECT_NAME = 'Untitled API'
/** Per-record diff saves cost a few ms, so save soon: less is left to flush when the page goes away. */
export const AUTOSAVE_DEBOUNCE_MS = 250
export const AUTOSAVE_MAX_WAIT_MS = 2000
const CHANNEL_NAME = 'openapi-editor:saves'

/**
 * - `pending`: a change is waiting for the debounce; `saving`: a write is in flight.
 * - `error`: the last write failed (Retry saves again).
 * - `conflict`: another tab saved this document; this tab no longer saves (Reload).
 * - `load-error`: the saved document couldn't be read; nothing is saved until Retry loads it.
 */
export type SaveState = 'saved' | 'pending' | 'saving' | 'error' | 'conflict' | 'load-error'

type SaveStatus = {
  state: SaveState
  lastSavedAt: number | null
  error: unknown
}

const useSaveStatusStore = create<SaveStatus>()(() => ({ state: 'saved', lastSavedAt: null, error: null }))

/** Save state for the sidebar footer. */
export function useSaveStatus(): SaveStatus {
  return useSaveStatusStore()
}

type ErrorListener = (error: unknown, state: SaveState) => void
const errorListeners = new Set<ErrorListener>()

/** Non-React read of the save state. */
export function getSaveStatus(): SaveStatus {
  return useSaveStatusStore.getState()
}

/** Called once per failure streak (the first failure after a success), a conflict, or a failed load. */
export function onSaveError(listener: ErrorListener): () => void {
  errorListeners.add(listener)
  return () => errorListeners.delete(listener)
}

function notifyError(error: unknown, state: SaveState) {
  for (const listener of errorListeners) listener(error, state)
}

// ---------------------------------------------------------------------------
// Hydration

export type HydrationResult = { status: 'loaded' | 'empty' | 'failed'; error?: unknown }

let hydration: Promise<HydrationResult> | undefined
let metadata: ProjectMetadata | null = null
/** Set while loading a document into the store, so autosave doesn't write it straight back. */
let loading = false

async function loadStoredDocument(): Promise<HydrationResult> {
  try {
    const repository = getRepository()
    const projectId = (await repository.getActiveProjectId()) ?? DEFAULT_PROJECT_ID
    const project = await repository.getProject(projectId)
    if (!project) return { status: 'empty' }
    metadata = project.metadata
    loading = true
    try {
      useEditorStore.getState().initializeDocument(project.document)
    } finally {
      loading = false
    }
    return { status: 'loaded' }
  } catch (error) {
    console.error('Could not load the saved document', error)
    useSaveStatusStore.setState({ state: 'load-error', error })
    notifyError(error, 'load-error')
    return { status: 'failed', error }
  }
}

/**
 * Loads the saved document into the store once per page load (not undoable),
 * then starts autosave. Safe to call from every `_app` loader run; later calls
 * reuse the first result. Never rejects: a storage failure keeps an empty
 * document and reports `failed`; autosave then stays off until `retryLoad()`
 * succeeds, so it can't overwrite a document it couldn't read.
 */
export function hydrateDocument(): Promise<HydrationResult> {
  if (typeof window === 'undefined') return Promise.resolve({ status: 'empty' })
  hydration ??= loadStoredDocument().then((result) => {
    startAutosave({ paused: result.status === 'failed' })
    return result
  })
  return hydration
}

/**
 * Tries to load the saved document again after a failed load (e.g. another tab
 * was blocking the database). On success the stored document replaces the
 * current one and autosave resumes.
 */
export async function retryLoad(): Promise<HydrationResult> {
  const result = await loadStoredDocument()
  if (result.status !== 'failed') {
    paused = false
    dirty = false
    failing = false
    useSaveStatusStore.setState({ state: 'saved', error: null })
    updateUnloadGuard()
  }
  return result
}

// ---------------------------------------------------------------------------
// Autosave

let started = false
let paused = false
let timer: ReturnType<typeof setTimeout> | undefined
let burstStartedAt: number | undefined
/** Changes not yet handed to IndexedDB. */
let dirty = false
/** Writes handed to IndexedDB that haven't committed yet. */
let inFlight = 0
/** Settles when every write issued so far has settled. */
let allWritten: Promise<void> = Promise.resolve()
let failing = false
let conflicted = false
let guarded = false
let channel: BroadcastChannel | null = null

/**
 * Hands the document to IndexedDB. The repository opens its transaction
 * synchronously (the database is already open after hydration), so a call
 * from `pagehide` / `beforeunload` queues the write before the page goes away.
 */
function write(doc: ApiDocument): Promise<void> {
  const now = Date.now()
  const first = !metadata
  const next: ProjectMetadata = metadata
    ? { ...metadata, name: doc.info.title || DEFAULT_PROJECT_NAME, updatedAt: now }
    : { id: DEFAULT_PROJECT_ID, name: doc.info.title || DEFAULT_PROJECT_NAME, createdAt: now, updatedAt: now }
  metadata = next
  const repository = getRepository()
  const saved = repository.saveProject({ metadata: next, document: doc }).then(() => {
    channel?.postMessage({ type: 'saved', projectId: next.id, revision: repository.getRevision?.(next.id) })
  })
  // Hydration falls back to the default id, so this can land after the page is gone.
  return first ? saved.then(() => repository.setActiveProjectId(next.id)) : saved
}

function hasUnsavedWork(): boolean {
  return !conflicted && (dirty || inFlight > 0)
}

/**
 * The browser's own "Leave site?" prompt, registered only while a change is
 * unsaved or still being written, so a reload or close can't drop it. Leaving
 * also flushes, which usually finishes before the user answers.
 */
function onBeforeUnload(event: BeforeUnloadEvent) {
  flushIfDirty()
  if (!hasUnsavedWork()) return
  event.preventDefault()
  // Older browsers need returnValue set to show the prompt.
  event.returnValue = ''
}

function updateUnloadGuard() {
  if (typeof window === 'undefined') return
  const shouldGuard = hasUnsavedWork()
  if (shouldGuard === guarded) return
  guarded = shouldGuard
  if (shouldGuard) window.addEventListener('beforeunload', onBeforeUnload)
  else window.removeEventListener('beforeunload', onBeforeUnload)
}

/** Whether the `beforeunload` guard is registered (tests). */
export function isUnloadGuarded(): boolean {
  return guarded
}

function enterConflict(error: unknown) {
  if (conflicted) return
  conflicted = true
  paused = true
  if (timer) {
    clearTimeout(timer)
    timer = undefined
  }
  useSaveStatusStore.setState({ state: 'conflict', error })
  updateUnloadGuard()
  notifyError(error, 'conflict')
}

/**
 * Writes the current document now. Issues the IndexedDB write synchronously,
 * without waiting for an earlier write: IndexedDB runs overlapping readwrite
 * transactions in the order they were created.
 */
function runSave(): Promise<void> {
  if (timer) {
    clearTimeout(timer)
    timer = undefined
  }
  burstStartedAt = undefined
  if (conflicted) return Promise.resolve()
  dirty = false
  const doc = useEditorStore.getState().document
  inFlight += 1
  useSaveStatusStore.setState({ state: 'saving' })
  updateUnloadGuard()

  let pending: Promise<void>
  try {
    pending = write(doc)
  } catch (error) {
    pending = Promise.reject(error)
  }
  const settled = pending.then(
    () => {
      inFlight -= 1
      failing = false
      if (inFlight === 0 && !conflicted) {
        useSaveStatusStore.setState({
          state: dirty ? 'pending' : 'saved',
          lastSavedAt: Date.now(),
          error: null,
        })
        // A change left over from a failed write, with nothing scheduled to pick it up.
        if (dirty && !timer) schedule()
      }
      updateUnloadGuard()
    },
    (error: unknown) => {
      inFlight -= 1
      if (error instanceof SaveConflictError) {
        enterConflict(error)
        return
      }
      dirty = true
      console.error('Could not save the document', error)
      if (!conflicted) {
        useSaveStatusStore.setState({ state: 'error', error })
        if (!failing) notifyError(error, 'error')
      }
      failing = true
      updateUnloadGuard()
    },
  )
  allWritten = Promise.all([allWritten, settled]).then(() => undefined)
  return settled
}

/** Debounce, but never hold a change back longer than AUTOSAVE_MAX_WAIT_MS while edits continue. */
function schedule() {
  if (paused) return
  if (timer) clearTimeout(timer)
  const now = Date.now()
  burstStartedAt ??= now
  if (useSaveStatusStore.getState().state !== 'error') useSaveStatusStore.setState({ state: 'pending' })
  const delay = Math.max(0, Math.min(AUTOSAVE_DEBOUNCE_MS, burstStartedAt + AUTOSAVE_MAX_WAIT_MS - now))
  timer = setTimeout(() => {
    timer = undefined
    if (dirty) void runSave()
  }, delay)
}

/**
 * Writes the document now (Mod+S, Retry). Resolves when every write so far has
 * finished (or failed). Does nothing after a failed load or a conflict, where
 * writing would overwrite a document this tab hasn't seen.
 */
export function saveNow(): Promise<void> {
  if (typeof window === 'undefined' || conflicted) return Promise.resolve()
  if (useSaveStatusStore.getState().state === 'load-error') return Promise.resolve()
  paused = false
  void runSave()
  return allWritten
}

function flushIfDirty() {
  if (dirty && !paused) void runSave()
}

function onChannelMessage(event: MessageEvent) {
  const data = event.data as { type?: string; projectId?: string; revision?: number } | null
  if (data?.type !== 'saved' || !data.projectId) return
  const repository = getRepository()
  const mine = repository.getRevision?.(data.projectId)
  // Our own save echoed by another instance can't happen (a channel doesn't hear
  // itself); any other tab's save of this project makes this tab's copy stale.
  if (metadata && data.projectId !== metadata.id) return
  if (data.revision !== undefined && mine !== undefined && data.revision <= mine) return
  repository.markConflicted?.(data.projectId)
  enterConflict(new SaveConflictError(data.projectId))
}

/** Starts autosave. Idempotent; `hydrateDocument()` calls it. */
export function startAutosave({ paused: startPaused = false }: { paused?: boolean } = {}): void {
  if (started || typeof window === 'undefined') return
  started = true
  paused = startPaused
  useEditorStore.subscribe((state, prev) => {
    if (state.document === prev.document || loading) return
    dirty = true
    updateUnloadGuard()
    schedule()
  })
  window.addEventListener('pagehide', flushIfDirty)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushIfDirty()
  })
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(CHANNEL_NAME)
    channel.addEventListener('message', onChannelMessage)
  }
}
