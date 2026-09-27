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
    vi.doMock('@/lib/storage', () => ({ getRepository: () => repository }))
    const page = await loadPage()
    await page.hydrateDocument()
    vi.useFakeTimers()
    return page
  }

  it('saves 1s after the last change', async () => {
    const { store, AUTOSAVE_DEBOUNCE_MS, getSaveStatus } = await loadWithFakeRepository()
    store.getState().updateInfo({ title: 'a' })
    expect(getSaveStatus().state).toBe('pending')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS - 100)
    store.getState().updateInfo({ title: 'ab' })
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS - 100)
    expect(saves).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(100)
    expect(saves).toHaveLength(1)
    expect(saves[0].info.title).toBe('ab')
    expect(getSaveStatus().state).toBe('saved')
  })

  it('never holds changes back longer than the max wait while typing continues', async () => {
    const { store, AUTOSAVE_MAX_WAIT_MS } = await loadWithFakeRepository()
    for (let t = 0; t < AUTOSAVE_MAX_WAIT_MS + 1000; t += 400) {
      store.getState().updateInfo({ title: `t${t}` })
      await vi.advanceTimersByTimeAsync(400)
    }
    expect(saves.length).toBeGreaterThanOrEqual(1)
    expect(saves.length).toBeLessThanOrEqual(2)
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
