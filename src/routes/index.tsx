import { createFileRoute } from '@tanstack/react-router'
import { OpenApiEditor } from '@/components/openapi/editor'

export const Route = createFileRoute('/')({
  component: OpenApiEditor,
})
