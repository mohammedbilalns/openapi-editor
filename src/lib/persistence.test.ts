import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiDocument } from '@/lib/openapi/types'
import type { IProjectRepository, StoredProject } from '@/lib/storage'
import { REALISTIC_SPEC_YAML } from '@/test/fixtures/realistic-spec'
import { parseOk } from '@/test/helpers'

/**
 * persistence.ts keeps module state (hydrate once, one autosave subscription),
 * like a page load. Each "page load" here is a fresh module graph over the same
 * IndexedDB, which is what a browser reload is.
 */
async function loadPage() {
  vi.resetModules()
  const persistence = await import('./persistence')
  const { useEditorStore } = await import('@/lib/openapi/store')
  return { ...persistence, store: useEditorStore }
}

/** Replaces the repository, keeping the rest of '@/lib/storage' (error classes). */
function mockRepository(repository: IProjectRepository) {
  vi.doMock('@/lib/storage', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/storage')>()),
    getRepository: () => repository,
  }))
}

afterEach(() => {
  vi.useRealTimers()
  vi.doUnmock('@/lib/storage')
})

describe('persistence: survives a reload', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory() // empty browser profile
  })

  it('an imported document is there after reload', async () => {
    const first = await loadPage()
    expect(await first.hydrateDocument()).toEqual({ status: 'empty' })

    const imported = parseOk(REALISTIC_SPEC_YAML).doc
    first.store.getState().setDocument(imported)
    await first.saveNow()
    expect(first.getSaveStatus().state).toBe('saved')

    const second = await loadPage()
    expect(await second.hydrateDocument()).toEqual({ status: 'loaded' })
    const loaded = second.store.getState().document
    expect(loaded).toEqual(imported)
    expect(second.store.getState().canUndo()).toBe(false) // hydrating is not an undo step
  })

  it('an edit flushed on pagehide is there after reload', async () => {
    const first = await loadPage()
    await first.hydrateDocument()
    first.store.getState().setDocument(parseOk(REALISTIC_SPEC_YAML).doc)
    await first.saveNow()

    first.store.getState().updateInfo({ title: 'Renamed just before reload' })
    window.dispatchEvent(new Event('pagehide'))
    await vi.waitFor(() => expect(first.getSaveStatus().state).toBe('saved'))

    const second = await loadPage()
    await second.hydrateDocument()
    expect(second.store.getState().document.info.title).toBe('Renamed just before reload')
  })

  it('the _app route loads the document in the browser, never in the prerendered shell', async () => {
    // Regression: with SSR on, the SPA prerender ran this loader without `window`,
    // the client hydrated that "empty" result, and nothing was loaded or saved.
    const { Route } = await import('@/routes/_app')
    expect(Route.options.ssr).toBe(false)
  }, 30_000) // imports the whole shell
})

describe('persistence: autosave timing', () => {
  let saves: ApiDocument[]

  async function loadWithFakeRepository() {
    saves = []
    const repository: IProjectRepository = {
      getProject: async () => null,
      saveProject: async (project: StoredProject) => {
        saves.push(project.document)
      },
      listProjects: async () => [],
      deleteProject: async () => {},
      getActiveProjectId: async () => null,
      setActiveProjectId: async () => {},
    }
    mockRepository(repository)
    const page = await loadPage()
    await page.hydrateDocument()
    vi.useFakeTimers()
    return page
  }

  it('saves 250ms after the last change', async () => {
    const { store, AUTOSAVE_DEBOUNCE_MS, getSaveStatus } = await loadWithFakeRepository()
    expect(AUTOSAVE_DEBOUNCE_MS).toBeLessThanOrEqual(300)
    store.getState().updateInfo({ title: 'a' })
    expect(getSaveStatus().state).toBe('pending')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS - 50)
    store.getState().updateInfo({ title: 'ab' })
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS - 50)
    expect(saves).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(50)
    expect(saves).toHaveLength(1)
    expect(saves[0].info.title).toBe('ab')
    expect(getSaveStatus().state).toBe('saved')
  })

  it('never holds changes back longer than the max wait (2s) while edits continue', async () => {
    const { store, AUTOSAVE_DEBOUNCE_MS, AUTOSAVE_MAX_WAIT_MS } = await loadWithFakeRepository()
    expect(AUTOSAVE_MAX_WAIT_MS).toBeLessThanOrEqual(2000)
    const step = AUTOSAVE_DEBOUNCE_MS - 50 // always inside the debounce
    for (let t = 0; t < AUTOSAVE_MAX_WAIT_MS - step; t += step) {
      store.getState().updateInfo({ title: `t${t}` })
      await vi.advanceTimersByTimeAsync(step)
    }
    expect(saves).toHaveLength(0)
    store.getState().updateInfo({ title: 'last' })
    await vi.advanceTimersByTimeAsync(step)
    expect(saves).toHaveLength(1)
  })

  it('saveNow (Mod+S) writes at once and cancels the pending timer', async () => {
    const { store, saveNow, AUTOSAVE_DEBOUNCE_MS } = await loadWithFakeRepository()
    store.getState().updateInfo({ title: 'now' })
    await saveNow()
    expect(saves).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS * 2)
    expect(saves).toHaveLength(1)
  })

  it('an undo that returns to the saved document is still saved (identity changed)', async () => {
    const { store, AUTOSAVE_DEBOUNCE_MS } = await loadWithFakeRepository()
    store.getState().updateInfo({ title: 'x' })
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS)
    store.getState().undo()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS)
    expect(saves.map((d) => d.info.title)).toEqual(['x', 'New API'])
  })
})

describe('persistence: nothing is lost when the page goes away', () => {
  type Pending = { doc: ApiDocument; resolve: () => void; reject: (error: unknown) => void }
  let pending: Pending[]
  let saveProject: ReturnType<typeof vi.fn<IProjectRepository['saveProject']>>

  /** A repository whose writes finish only when the test says so. */
  async function loadWithSlowRepository() {
    pending = []
    saveProject = vi.fn<IProjectRepository['saveProject']>(
      (project: StoredProject) =>
        new Promise<void>((resolve, reject) => pending.push({ doc: project.document, resolve, reject })),
    )
    const repository: IProjectRepository = {
      getProject: async () => null,
      saveProject,
      listProjects: async () => [],
      deleteProject: async () => {},
      getActiveProjectId: async () => null,
      setActiveProjectId: async () => {},
    }
    mockRepository(repository)
    const page = await loadPage()
    await page.hydrateDocument()
    vi.useFakeTimers()
    return page
  }

  function beforeUnload(): Event {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event
  }

  it('registers the beforeunload guard only while a change is unsaved or being written', async () => {
    const { store, isUnloadGuarded, AUTOSAVE_DEBOUNCE_MS } = await loadWithSlowRepository()
    expect(isUnloadGuarded()).toBe(false)
    expect(beforeUnload().defaultPrevented).toBe(false)

    store.getState().updateInfo({ title: 'dirty' })
    expect(isUnloadGuarded()).toBe(true) // debouncing

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS)
    expect(pending).toHaveLength(1)
    expect(isUnloadGuarded()).toBe(true) // in flight

    pending[0].resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(isUnloadGuarded()).toBe(false) // removed as soon as the write lands
    expect(beforeUnload().defaultPrevented).toBe(false)
  })

  it('beforeunload with an unsaved change asks to confirm and starts the write at once', async () => {
    const { store } = await loadWithSlowRepository()
    store.getState().updateInfo({ title: 'just typed' })
    const event = beforeUnload()
    expect(event.defaultPrevented).toBe(true)
    // issued synchronously inside the handler, not after the debounce
    expect(saveProject).toHaveBeenCalledTimes(1)
    expect(pending[0].doc.info.title).toBe('just typed')
  })

  it('pagehide issues the write synchronously, even while an earlier write is still running', async () => {
    const { store, AUTOSAVE_DEBOUNCE_MS } = await loadWithSlowRepository()
    store.getState().updateInfo({ title: 'first' })
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS)
    expect(pending).toHaveLength(1) // first write still in flight

    store.getState().updateInfo({ title: 'second' })
    window.dispatchEvent(new Event('pagehide'))
    expect(pending).toHaveLength(2) // not queued behind the first write
    expect(pending[1].doc.info.title).toBe('second')
  })

  it('a failed write keeps the guard and the change, and Retry writes it', async () => {
    const { store, saveNow, getSaveStatus, isUnloadGuarded, AUTOSAVE_DEBOUNCE_MS } = await loadWithSlowRepository()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    store.getState().updateInfo({ title: 'x' })
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS)
    pending[0].reject(new Error('quota'))
    await vi.advanceTimersByTimeAsync(0)
    expect(getSaveStatus().state).toBe('error')
    expect(isUnloadGuarded()).toBe(true)

    const retried = saveNow()
    pending[1].resolve()
    await retried
    expect(getSaveStatus().state).toBe('saved')
    expect(isUnloadGuarded()).toBe(false)
  })

  it('client-side navigation keeps pending writes (the store and timer outlive route changes)', async () => {
    const { store, AUTOSAVE_DEBOUNCE_MS } = await loadWithSlowRepository()
    store.getState().updateInfo({ title: 'before navigating' })
    window.history.pushState({}, '', '/settings/info')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS)
    expect(pending.map((p) => p.doc.info.title)).toEqual(['before navigating'])
  })
})

describe('persistence: another tab', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
  })

  it('stops saving and reports a conflict when another tab saved, instead of mixing documents', async () => {
    const tabA = await loadPage()
    await tabA.hydrateDocument()
    tabA.store.getState().setDocument(parseOk(REALISTIC_SPEC_YAML).doc)
    await tabA.saveNow()

    const tabB = await loadPage() // a second tab: its own module state, same database
    await tabB.hydrateDocument()
    tabB.store.getState().updateInfo({ title: 'Saved by B' })
    await tabB.saveNow()
    expect(tabB.getSaveStatus().state).toBe('saved')

    // B's BroadcastChannel message (or, failing that, A's own stale write) puts A in conflict.
    tabA.store.getState().updateInfo({ title: 'Stale A' })
    await tabA.saveNow()
    await vi.waitFor(() => expect(tabA.getSaveStatus().state).toBe('conflict'))
    expect(tabA.isUnloadGuarded()).toBe(false) // nothing it could still save

    const tabC = await loadPage()
    await tabC.hydrateDocument()
    expect(tabC.store.getState().document.info.title).toBe('Saved by B')
  })
})

describe('persistence: the saved document could not be read', () => {
  it('does not autosave over it, and Retry loads it and resumes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let fail = true
    const saveProject = vi.fn<IProjectRepository['saveProject']>(async () => {})
    const stored = parseOk(REALISTIC_SPEC_YAML).doc
    const repository: IProjectRepository = {
      getProject: async () => {
        if (fail) throw new Error('blocked')
        return { metadata: { id: 'default', name: 'x', createdAt: 1, updatedAt: 1 }, document: stored }
      },
      saveProject,
      listProjects: async () => [],
      deleteProject: async () => {},
      getActiveProjectId: async () => null,
      setActiveProjectId: async () => {},
    }
    mockRepository(repository)
    const page = await loadPage()
    expect((await page.hydrateDocument()).status).toBe('failed')
    expect(page.getSaveStatus().state).toBe('load-error')

    page.store.getState().updateInfo({ title: 'typed on an empty document' })
    await page.saveNow()
    await new Promise((resolve) => setTimeout(resolve, page.AUTOSAVE_DEBOUNCE_MS + 50))
    expect(saveProject).not.toHaveBeenCalled()

    fail = false
    expect((await page.retryLoad()).status).toBe('loaded')
    expect(page.getSaveStatus().state).toBe('saved')
    expect(page.store.getState().document.info.title).toBe(stored.info.title)
    page.store.getState().updateInfo({ title: 'now it saves' })
    await page.saveNow()
    expect(saveProject).toHaveBeenCalledTimes(1)
  })
})
