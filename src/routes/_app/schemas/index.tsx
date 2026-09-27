import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/schemas/')({
  beforeLoad: () => {
    throw redirect({ to: '/', replace: true })
  },
})
