import { createFileRoute } from '@tanstack/react-router'
import { SchemaEditor } from '@/components/schema-editor/schema-editor'

export const Route = createFileRoute('/_app/schemas/$schemaId')({
  component: SchemaEditorPage,
})

function SchemaEditorPage() {
  const { schemaId } = Route.useParams()
  // Keyed so per-schema local state resets when switching schemas.
  return <SchemaEditor key={schemaId} schemaId={schemaId} />
}
