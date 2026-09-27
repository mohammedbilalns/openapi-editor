// STUB (Step 0) — owned by agent C. Replace this file's contents.
import { useCallback } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { confirm, toastUndo } from '@/components/shared'
import { getSchemaUsage, useActions } from '@/lib/openapi/selectors'
import { useEditorStore } from '@/lib/openapi/store'
import type { NodeId } from '@/lib/openapi/types'

/** Deletes a schema (confirming first when it is referenced) and leaves its page if it's being viewed. */
export function useDeleteSchema(): (id: NodeId) => Promise<void> {
  const { deleteSchema } = useActions()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  return useCallback(
    async (id: NodeId) => {
      const referrers = getSchemaUsage().get(id) ?? []
      if (referrers.length > 0) {
        const name = useEditorStore.getState().document.schemas.get(id)?.name ?? 'this schema'
        const ok = await confirm({
          title: `Delete ${name}?`,
          description: `${referrers.length} ${referrers.length === 1 ? 'place references' : 'places reference'} this schema. Their references will break.`,
          confirmLabel: 'Delete schema',
          destructive: true,
        })
        if (!ok) return
        deleteSchema(id)
      } else {
        deleteSchema(id)
        toastUndo('Schema deleted.')
      }
      if (pathname === `/schemas/${id}`) void navigate({ to: '/' })
    },
    [deleteSchema, navigate, pathname],
  )
}
