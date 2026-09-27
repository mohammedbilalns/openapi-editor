/**
 * Document persistence outside React (BLUEPRINT §5.5).
 *
 * Step 0 ships hydration only; autosave, flush and save status land with the shell.
 */
import { useEditorStore } from '@/lib/openapi/store'
import { getRepository } from '@/lib/storage'

export const DEFAULT_PROJECT_ID = 'default'

export type HydrationResult = { status: 'loaded' | 'empty' | 'failed'; error?: unknown }

let hydration: Promise<HydrationResult> | undefined

async function loadStoredDocument(): Promise<HydrationResult> {
  try {
    const repository = getRepository()
    const projectId = (await repository.getActiveProjectId()) ?? DEFAULT_PROJECT_ID
    const project = await repository.getProject(projectId)
    if (!project) return { status: 'empty' }
    useEditorStore.getState().initializeDocument(project.document)
    return { status: 'loaded' }
  } catch (error) {
    console.error('Could not load the saved document', error)
    return { status: 'failed', error }
  }
}

/**
 * Loads the saved document into the store once per page load (not undoable).
 * Safe to call from every `_app` loader run; later calls reuse the first result.
 * Never rejects: a storage failure starts an empty document and reports `failed`.
 */
export function hydrateDocument(): Promise<HydrationResult> {
  if (typeof window === 'undefined') return Promise.resolve({ status: 'empty' })
  hydration ??= loadStoredDocument()
  return hydration
}
