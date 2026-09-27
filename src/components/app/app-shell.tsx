import * as React from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { ImportDialog } from '@/components/import/import-dialog'
import { NewRouteDialog } from '@/components/route-editor/new-route-dialog'
import { NewSchemaDialog } from '@/components/schema-editor/new-schema-dialog'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { useBreakpoint } from '@/hooks/use-media-query'
import { INSPECTOR_MAX_SIZE, useUiPrefs } from '@/hooks/use-ui-prefs'
import { AppSidebar } from './app-sidebar'
import { useDocumentTitleSync } from './breadcrumbs'
import { CommandPalette } from './command-palette'
import { AppHotkeys } from './hotkeys'
import { InspectorPanel, InspectorSheet } from './inspector-host'
import { MobileDrawer } from './mobile-drawer'
import { useSaveErrorToast } from './save-status'
import { shell, useShellState } from './shell-state'
import { TopBar } from './top-bar'

/**
 * The one responsive shell (BLUEPRINT §2.1): fixed sidebar (drawer below 768px),
 * top bar, main content, and the inspector docked in a resizable panel at 1024px
 * and up (a sheet below).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const breakpoint = useBreakpoint()
  const phone = breakpoint === 'phone'
  const docked = breakpoint === 'laptop' || breakpoint === 'desktop'
  const inspectorOpen = useUiPrefs((s) => s.inspectorOpen)

  useDocumentTitleSync()
  useSaveErrorToast()
  useCloseOverlaysOnNavigate()

  const main = (
    <main
      id="main"
      data-scroll-restoration-id="main"
      className="h-full min-h-0 overflow-y-auto overscroll-contain bg-background"
    >
      {children}
    </main>
  )

  return (
    <div className="flex h-svh overflow-hidden bg-background text-foreground">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      {phone ? (
        <MobileDrawer>
          <AppSidebar onClose={shell.closeDrawer} />
        </MobileDrawer>
      ) : (
        <div className="w-60 shrink-0 border-r border-sidebar-border xl:w-64">
          <AppSidebar />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <div className="min-h-0 flex-1">
          {docked && inspectorOpen ? <DockedLayout main={main} /> : main}
        </div>
      </div>
      <InspectorSheet />
      <CommandPalette />
      <ShellDialogs />
      <AppHotkeys />
    </div>
  )
}

/** Panel ids double as DOM ids, so they must not clash with #main (the skip-link target). */
const MAIN_PANEL = 'shell-main-panel'
const INSPECTOR_PANEL = 'shell-inspector-panel'

function DockedLayout({ main }: { main: React.ReactNode }) {
  const inspectorSize = useUiPrefs((s) => s.inspectorSize)
  const setInspectorSize = useUiPrefs((s) => s.setInspectorSize)
  // Read once: the group owns the layout after mount; we only persist user drags.
  const [defaultLayout] = React.useState(() => ({ [MAIN_PANEL]: 100 - inspectorSize, [INSPECTOR_PANEL]: inspectorSize }))
  return (
    <ResizablePanelGroup
      orientation="horizontal"
      defaultLayout={defaultLayout}
      onLayoutChanged={(layout, meta) => {
        const size = layout[INSPECTOR_PANEL]
        if (meta.isUserInteraction && typeof size === 'number') setInspectorSize(size)
      }}
    >
      <ResizablePanel id={MAIN_PANEL} minSize={360}>
        {main}
      </ResizablePanel>
      <ResizableHandle aria-label="Resize inspector" />
      <ResizablePanel id={INSPECTOR_PANEL} minSize={320} maxSize={`${INSPECTOR_MAX_SIZE}`}>
        <InspectorPanel />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

/** New route / new schema / import dialogs, owned by B, C and D, opened from anywhere in the shell. */
function ShellDialogs() {
  const navigate = useNavigate()
  const newRouteOpen = useShellState((s) => s.newRouteOpen)
  const newSchemaOpen = useShellState((s) => s.newSchemaOpen)
  const importOpen = useShellState((s) => s.importOpen)
  return (
    <>
      <NewRouteDialog
        open={newRouteOpen}
        onOpenChange={(open) => useShellState.setState({ newRouteOpen: open })}
        onCreated={(id) => void navigate({ to: '/routes/$routeId', params: { routeId: id } })}
      />
      <NewSchemaDialog
        open={newSchemaOpen}
        onOpenChange={(open) => useShellState.setState({ newSchemaOpen: open })}
        onCreated={(id) => void navigate({ to: '/schemas/$schemaId', params: { schemaId: id } })}
      />
      <ImportDialog open={importOpen} onOpenChange={(open) => useShellState.setState({ importOpen: open })} />
    </>
  )
}

/** Closes the drawer and the phone/tablet inspector sheet when the page changes. */
function useCloseOverlaysOnNavigate() {
  const router = useRouter()
  React.useEffect(
    () =>
      router.subscribe('onResolved', (event) => {
        if (event.pathChanged) useShellState.setState({ drawerOpen: false, inspectorSheetOpen: false })
      }),
    [router],
  )
}
