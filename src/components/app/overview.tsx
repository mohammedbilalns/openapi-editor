// Step 0 placeholder; the real overview lands with the shell.
import { PageHeader } from '@/components/shared'
import { useInfo, useRouteCount, useSchemaCount } from '@/lib/openapi/selectors'

export function Overview() {
  const info = useInfo()
  const routes = useRouteCount()
  const schemas = useSchemaCount()
  return (
    <div className="mx-auto w-full max-w-[56rem] px-4 py-4 md:px-6 md:py-6">
      <PageHeader
        title={`${info.title}. ${routes} ${routes === 1 ? 'route' : 'routes'}, ${schemas} ${schemas === 1 ? 'schema' : 'schemas'}.`}
        description={info.description || undefined}
      />
    </div>
  )
}
