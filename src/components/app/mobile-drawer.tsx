import * as React from 'react'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { useShellState } from './shell-state'

/**
 * Mobile navigation drawer, DESIGN.md §9.20: slides in from the left over a
 * scrim. Base UI's dialog gives it aria-modal, the focus trap, Escape, scroll
 * lock and focus return to the trigger.
 */
export function MobileDrawer({ children }: { children: React.ReactNode }) {
  const open = useShellState((s) => s.drawerOpen)
  return (
    <Sheet open={open} onOpenChange={(next) => useShellState.setState({ drawerOpen: next })}>
      <SheetContent
        side="left"
        showCloseButton={false}
        className={cn(
          'w-[min(288px,85vw)] gap-0 border-sidebar-border bg-sidebar p-0 data-[side=left]:w-[min(288px,85vw)] data-[side=left]:sm:max-w-none',
        )}
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SheetDescription className="sr-only">Routes, schemas and settings of this document.</SheetDescription>
        {children}
      </SheetContent>
    </Sheet>
  )
}
