import { useCallback } from 'react'
import { useRouter } from '@tanstack/react-router'
import { toastUndo } from '@/components/shared'
import { useActions } from '@/lib/openapi/selectors'
import type { NodeId } from '@/lib/openapi/types'

/**
 * Deletes a route right away with an Undo toast (BLUEPRINT §3 "Deletes") and
 * leaves its page first if it's being viewed. The callback is stable: the
 * current location is read when it runs.
 */
export function useDeleteRoute(): (id: NodeId) => void {
  const { deleteRoute } = useActions()
  const router = useRouter()
  return useCallback(
    (id: NodeId) => {
      const remove = () => {
        deleteRoute(id)
        toastUndo('Route deleted.')
      }
      // Leave first, so the page doesn't flash its "route is gone" state.
      if (router.state.location.pathname === `/routes/${id}`) void router.navigate({ to: '/' }).then(remove)
      else remove()
    },
    [deleteRoute, router],
  )
}
