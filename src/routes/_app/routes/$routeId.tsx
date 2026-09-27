import { createFileRoute } from '@tanstack/react-router'
import { RouteEditor } from '@/components/route-editor/route-editor'

export const Route = createFileRoute('/_app/routes/$routeId')({
  component: RouteEditorPage,
})

function RouteEditorPage() {
  const { routeId } = Route.useParams()
  // Keyed so per-route local state resets when switching routes.
  return <RouteEditor key={routeId} routeId={routeId} />
}
