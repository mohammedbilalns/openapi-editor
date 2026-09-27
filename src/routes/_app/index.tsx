import { createFileRoute } from '@tanstack/react-router'
import { Overview } from '@/components/app/overview'

export const Route = createFileRoute('/_app/')({
  component: Overview,
})
