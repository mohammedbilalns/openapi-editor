import { useCallback } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { confirm, toastUndo } from '@/components/shared'
import { getSchemaUsage, useActions } from '@/lib/openapi/selectors'
import { useEditorStore } from '@/lib/openapi/store'
import type { NodeId } from '@/lib/openapi/types'

/**
 * Deletes a schema (BLUEPRINT §3 "Deletes"): confirms first when something
 * references it, otherwise deletes right away with an Undo toast. Leaves the
 * schema's page if it's being viewed.
 */
export function useDeleteSchema(): (id: NodeId) => Promise<void> {
  const { deleteSchema } = useActions()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  return useCallback(
    async (id: NodeId) => {
      const referrers = getSchemaUsage().get(id) ?? []
      if (referrers.length > 0) {
        const name = useEditorStore.getState().document.schemas.get(id)?.name || 'this schema'
        const ok = await confirm({
          title: `Delete ${name}?`,
          description: `${referrers.length === 1 ? '1 place references' : `${referrers.length} places reference`} this schema. Their references will break.`,
          confirmLabel: 'Delete schema',
          destructive: true,
        })
        if (!ok) return
      }
      if (!useEditorStore.getState().document.schemas.has(id)) return
      deleteSchema(id)
      toastUndo('Schema deleted.')
      if (pathname === `/schemas/${id}`) void navigate({ to: '/' })
    },
    [deleteSchema, navigate, pathname],
  )
}
