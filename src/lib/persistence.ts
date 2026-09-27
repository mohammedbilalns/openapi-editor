/**
 * Document persistence outside React (BLUEPRINT §5.5).
 *
 * - `hydrateDocument()` loads the saved document once per page load (the `_app` loader).
 * - `startAutosave()` subscribes to the store and writes to IndexedDB 1s after the
 *   last change (at most 5s after the first of a burst), and flushes on `pagehide` / `visibilitychange` hidden.
 * - `saveNow()` flushes immediately (Mod+S, Retry).
 * - `useSaveStatus()` exposes the state for the sidebar footer.
 */
import { create } from 'zustand'
import { useEditorStore } from '@/lib/openapi/store'
import type { ApiDocument } from '@/lib/openapi/types'
import { getRepository, type ProjectMetadata } from '@/lib/storage'

export const DEFAULT_PROJECT_ID = 'default'
const DEFAULT_PROJECT_NAME = 'Untitled API'
export const AUTOSAVE_DEBOUNCE_MS = 1000
export const AUTOSAVE_MAX_WAIT_MS = 5000

export type SaveState = 'saved' | 'pending' | 'saving' | 'error'

type SaveStatus = {
  state: SaveState
  lastSavedAt: number | null
  error: unknown
}

const useSaveStatusStore = create<SaveStatus>()(() => ({ state: 'saved', lastSavedAt: null, error: null }))

/** Save state for the UI: `saved`, `pending` (debouncing), `saving`, or `error`. */
export function useSaveStatus(): SaveStatus {
  return useSaveStatusStore()
}

type ErrorListener = (error: unknown) => void
const errorListeners = new Set<ErrorListener>()

/** Non-React read of the save state. */
export function getSaveStatus(): SaveStatus {
  return useSaveStatusStore.getState()
}

/** Called once per failure streak (the first failed save after a success). */
export function onSaveError(listener: ErrorListener): () => void {
  errorListeners.add(listener)
  return () => errorListeners.delete(listener)
}

// ---------------------------------------------------------------------------
// Hydration

export type HydrationResult = { status: 'loaded' | 'empty' | 'failed'; error?: unknown }

let hydration: Promise<HydrationResult> | undefined
let metadata: ProjectMetadata | null = null

async function loadStoredDocument(): Promise<HydrationResult> {
  try {
    const repository = getRepository()
    const projectId = (await repository.getActiveProjectId()) ?? DEFAULT_PROJECT_ID
    const project = await repository.getProject(projectId)
    if (!project) return { status: 'empty' }
    metadata = project.metadata
    useEditorStore.getState().initializeDocument(project.document)
    return { status: 'loaded' }
  } catch (error) {
    console.error('Could not load the saved document', error)
    useSaveStatusStore.setState({ state: 'error', error })
    return { status: 'failed', error }
  }
}

/**
 * Loads the saved document into the store once per page load (not undoable),
 * then starts autosave. Safe to call from every `_app` loader run; later calls
 * reuse the first result. Never rejects: a storage failure keeps an empty
 * document and reports `failed` (autosave then waits for an explicit `saveNow()`
 * so it can't overwrite a document it couldn't read).
 */
export function hydrateDocument(): Promise<HydrationResult> {
  if (typeof window === 'undefined') return Promise.resolve({ status: 'empty' })
  hydration ??= loadStoredDocument().then((result) => {
    startAutosave({ paused: result.status === 'failed' })
    return result
  })
  return hydration
}

// ---------------------------------------------------------------------------
// Autosave

let started = false
let paused = false
let timer: ReturnType<typeof setTimeout> | undefined
let burstStartedAt: number | undefined
let dirty = false
let inFlight: Promise<void> | undefined
let failing = false

async function write(doc: ApiDocument): Promise<void> {
  const repository = getRepository()
  const now = Date.now()
  const next: ProjectMetadata = metadata
    ? { ...metadata, name: doc.info.title || DEFAULT_PROJECT_NAME, updatedAt: now }
    : { id: DEFAULT_PROJECT_ID, name: doc.info.title || DEFAULT_PROJECT_NAME, createdAt: now, updatedAt: now }
  await repository.saveProject({ metadata: next, document: doc })
  if (!metadata) await repository.setActiveProjectId(next.id)
  metadata = next
}

async function runSave(): Promise<void> {
  if (inFlight) {
    // A change arrived mid-save; save again once the current write finishes.
    await inFlight
    if (!dirty) return
  }
  dirty = false
  const doc = useEditorStore.getState().document
  useSaveStatusStore.setState({ state: 'saving' })
  inFlight = write(doc)
  try {
    await inFlight
    failing = false
    useSaveStatusStore.setState({
      state: dirty ? 'pending' : 'saved',
      lastSavedAt: Date.now(),
      error: null,
    })
  } catch (error) {
    dirty = true
    console.error('Could not save the document', error)
    useSaveStatusStore.setState({ state: 'error', error })
    if (!failing) for (const listener of errorListeners) listener(error)
    failing = true
  } finally {
    inFlight = undefined
  }
  if (dirty && !failing) schedule()
}

/** Debounce, but never hold a change back longer than AUTOSAVE_MAX_WAIT_MS while typing continues. */
function schedule() {
  if (paused) return
  if (timer) clearTimeout(timer)
  const now = Date.now()
  burstStartedAt ??= now
  if (useSaveStatusStore.getState().state !== 'error') useSaveStatusStore.setState({ state: 'pending' })
  const delay = Math.max(0, Math.min(AUTOSAVE_DEBOUNCE_MS, burstStartedAt + AUTOSAVE_MAX_WAIT_MS - now))
  timer = setTimeout(() => {
    timer = undefined
    burstStartedAt = undefined
    void runSave()
  }, delay)
}

/** Writes any pending change now. Resolves when the write finishes (or fails). */
export async function saveNow(): Promise<void> {
  if (typeof window === 'undefined') return
  if (timer) {
    clearTimeout(timer)
    timer = undefined
  }
  burstStartedAt = undefined
  paused = false
  dirty = true
  await runSave()
}

function flushIfDirty() {
  if (dirty && !paused) void saveNow()
}

/** Starts autosave. Idempotent; `hydrateDocument()` calls it. */
export function startAutosave({ paused: startPaused = false }: { paused?: boolean } = {}): void {
  if (started || typeof window === 'undefined') return
  started = true
  paused = startPaused
  useEditorStore.subscribe((state, prev) => {
    if (state.document === prev.document) return
    dirty = true
    schedule()
  })
  window.addEventListener('pagehide', flushIfDirty)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushIfDirty()
  })
}
