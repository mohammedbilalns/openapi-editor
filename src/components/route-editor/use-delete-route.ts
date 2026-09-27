// STUB (Step 0) — owned by agent B. Replace this file's contents.
import { useCallback } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { toastUndo } from '@/components/shared'
import { useActions } from '@/lib/openapi/selectors'
import type { NodeId } from '@/lib/openapi/types'

/** Deletes a route, offers undo, and leaves its page if it's being viewed. */
export function useDeleteRoute(): (id: NodeId) => void {
  const { deleteRoute } = useActions()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  return useCallback(
    (id: NodeId) => {
      deleteRoute(id)
      toastUndo('Route deleted.')
      if (pathname === `/routes/${id}`) void navigate({ to: '/' })
    },
    [deleteRoute, navigate, pathname],
  )
}
