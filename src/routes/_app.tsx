import { Outlet, createFileRoute } from '@tanstack/react-router'
import { AppShell } from '@/components/app/app-shell'
import { ShellSkeleton } from '@/components/app/shell-skeleton'
import { hydrateDocument } from '@/lib/persistence'

export const Route = createFileRoute('/_app')({
  // Loads the saved document once per page load; later runs reuse the result.
  loader: () => hydrateDocument(),
  staleTime: Infinity,
  pendingComponent: ShellSkeleton,
  pendingMs: 150,
  component: AppLayout,
})

function AppLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
