import { Inspector } from '@/components/inspector/inspector'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { useBreakpoint } from '@/hooks/use-media-query'
import { cn } from '@/lib/utils'
import { useShellState } from './shell-state'

/**
 * The inspector below 1024px: a right sheet (tablet) or a full-screen sheet
 * (phone). At 1024px and up AppShell docks it in a resizable panel instead.
 * The close button sits at the top right, over the right end of the
 * inspector's own header.
 */
export function InspectorSheet() {
  const breakpoint = useBreakpoint()
  const open = useShellState((s) => s.inspectorSheetOpen)
  const docked = breakpoint === 'laptop' || breakpoint === 'desktop'
  const phone = breakpoint === 'phone'
  return (
    <Sheet open={open && !docked} onOpenChange={(next) => useShellState.setState({ inspectorSheetOpen: next })}>
      <SheetContent
        side="right"
        className={cn(
          'gap-0 bg-background p-0 [&>[data-slot=sheet-close]]:top-2 [&>[data-slot=sheet-close]]:right-2',
          phone
            ? 'data-[side=right]:w-full data-[side=right]:border-l-0 data-[side=right]:sm:max-w-none'
            : 'data-[side=right]:w-[min(520px,90vw)] data-[side=right]:sm:max-w-none',
        )}
      >
        <SheetTitle className="sr-only">Inspector</SheetTitle>
        <SheetDescription className="sr-only">Generated YAML and validation problems.</SheetDescription>
        <div className="flex min-h-0 flex-1 flex-col">
          <Inspector variant="sheet" />
        </div>
      </SheetContent>
    </Sheet>
  )
}

/** The docked inspector panel's content (≥1024px). */
export function InspectorPanel() {
  return (
    <aside aria-label="Inspector" className="flex h-full min-h-0 flex-col bg-background">
      <Inspector variant="panel" />
    </aside>
  )
}
