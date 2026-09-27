// STUB (Step 0) — owned by agent B. Replace this file's contents.
import { MethodBadge, PageHeader } from '@/components/shared'
import { useRoute } from '@/lib/openapi/selectors'
import type { NodeId } from '@/lib/openapi/types'

export function RouteEditor({ routeId }: { routeId: NodeId }) {
  const route = useRoute(routeId)
  return (
    <div className="mx-auto w-full max-w-[56rem] px-4 py-4 md:px-6 md:py-6">
      <PageHeader
        meta={route ? <MethodBadge method={route.method} variant="chip" /> : undefined}
        title={<span className="font-mono">{route?.path ?? 'Missing route'}</span>}
        description="Route editor placeholder."
      />
    </div>
  )
}
