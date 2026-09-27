// STUB (Step 0) — owned by agent C. Replace this file's contents.
import { PageHeader, SchemaTypeIcon } from '@/components/shared'
import { useSchema } from '@/lib/openapi/selectors'
import type { NodeId } from '@/lib/openapi/types'

export function SchemaEditor({ schemaId }: { schemaId: NodeId }) {
  const schema = useSchema(schemaId)
  return (
    <div className="mx-auto w-full max-w-[56rem] px-4 py-4 md:px-6 md:py-6">
      <PageHeader
        meta={schema ? <SchemaTypeIcon type={schema.type} /> : undefined}
        title={<span className="font-mono">{schema?.name ?? 'Missing schema'}</span>}
        description="Schema editor placeholder."
      />
    </div>
  )
}
