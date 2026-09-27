import { Outlet, createFileRoute } from '@tanstack/react-router'
import { AppShell } from '@/components/app/app-shell'
import { ShellSkeleton } from '@/components/app/shell-skeleton'
import { hydrateDocument } from '@/lib/persistence'

export const Route = createFileRoute('/_app')({
  // The document lives in IndexedDB, so this route only ever loads in the browser. Without
  // `ssr: false` the SPA shell prerender runs the loader on the server (no window, so it
  // reports 'empty') and the client hydrates that result instead of loading: the saved
  // document never loads and autosave never starts.
  ssr: false,
  // Loads the saved document once per page load and starts autosave; later runs reuse the result.
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
