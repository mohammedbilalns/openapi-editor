import * as React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { confirm, toast, toastUndo } from '@/components/shared'
import { exportYaml } from '@/components/inspector/export-yaml'
import { getActions } from '@/lib/openapi/selectors'

/** Downloads the YAML; reports a failure instead of throwing. */
export function exportDocument(): void {
  exportYaml().catch((error: unknown) => {
    console.error('Export failed', error)
    toast('Could not export the YAML.', { description: error instanceof Error ? error.message : undefined })
  })
}

/** Replaces the document with an empty one after confirming. Undoable. */
export function useStartNewDocument(): () => Promise<void> {
  const navigate = useNavigate()
  return React.useCallback(async () => {
    const ok = await confirm({
      title: 'Start a new document?',
      description: 'The current document is replaced with an empty one. You can undo this.',
      confirmLabel: 'Start a new document',
    })
    if (!ok) return
    getActions().resetDocument()
    void navigate({ to: '/' })
    toastUndo('Started a new document.')
  }, [navigate])
}
