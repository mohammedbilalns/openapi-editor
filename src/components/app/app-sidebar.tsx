import * as React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ChevronsUpDown, Download, FilePlus2, Import, PencilLine, Search, X } from 'lucide-react'
import { Kbd } from '@/components/shared'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useInfo } from '@/lib/openapi/selectors'
import { cn } from '@/lib/utils'
import { exportDocument, useStartNewDocument } from './document-actions'
import { OfflineBadge } from './offline-badge'
import { SaveStatus } from './save-status'
import { shell } from './shell-state'
import { PALETTE_KEYS } from './shortcuts'
import { SidebarTree } from './sidebar-tree'
import { WordmarkGlyph } from './wordmark-glyph'

export type AppSidebarProps = {
  /** Drawer variant (<768px) adds a close button to the wordmark row. */
  onClose?: () => void
  className?: string
}

/** App sidebar, DESIGN.md §9.22 / BLUEPRINT §2.2. Fills its container; width comes from the shell. */
export function AppSidebar({ onClose, className }: AppSidebarProps) {
  // State, not a ref: the tree needs a re-render once the element exists (a child's layout
  // effects run before the parent's ref is attached, so a virtualized first render saw null).
  const [scrollElement, setScrollElement] = React.useState<HTMLElement | null>(null)
  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground', className)}>
      <div className="flex flex-col gap-2 p-2 pb-0">
        <div className="flex h-11 items-center gap-2 px-2">
          <WordmarkGlyph className="size-4 shrink-0 text-foreground" />
          <span className="text-sm font-medium text-foreground">OpenAPI Editor</span>
          {onClose && (
            <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label="Close navigation" onClick={onClose}>
              <X />
            </Button>
          )}
        </div>
        <DocumentSwitcher />
        <SearchTrigger />
      </div>
      <nav aria-label="Document" ref={setScrollElement} className="min-h-0 flex-1 overflow-y-auto p-2 pt-3">
        <SidebarTree scrollElement={scrollElement} />
      </nav>
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-t border-sidebar-border px-4">
        <SaveStatus />
        <OfflineBadge />
      </div>
    </div>
  )
}

function DocumentSwitcher() {
  const info = useInfo()
  const navigate = useNavigate()
  const startNewDocument = useStartNewDocument()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex w-full cursor-pointer items-center gap-2 rounded-lg border border-sidebar-border bg-background/40 p-2 text-left outline-none',
          'transition-colors duration-150 hover:bg-sidebar-accent data-popup-open:bg-sidebar-accent',
          'focus-visible:ring-2 focus-visible:ring-sidebar-ring',
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] font-medium text-foreground">{info.title || 'Untitled API'}</span>
          <span className="truncate text-[11px] text-subtle-foreground">
            {info.version ? `v${info.version.replace(/^v/i, '')}` : 'No version'} · OpenAPI 3.0
          </span>
        </span>
        <ChevronsUpDown aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-(--anchor-width) min-w-52">
        <DropdownMenuItem onClick={() => void navigate({ to: '/settings/$section', params: { section: 'info' } })}>
          <PencilLine />
          Edit API info
        </DropdownMenuItem>
        <DropdownMenuItem onClick={shell.importSpec}>
          <Import />
          Import…
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportDocument}>
          <Download />
          Export YAML
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void startNewDocument()}>
          <FilePlus2 />
          Start a new document
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SearchTrigger() {
  return (
    <button
      type="button"
      onClick={shell.openPalette}
      className={cn(
        'flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-2.5 text-left text-sm text-muted-foreground shadow-xs/5 outline-none dark:shadow-edge-inset',
        'transition-colors duration-150 hover:bg-accent/50',
        'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/24 dark:focus-visible:ring-ring/48',
      )}
    >
      <Search aria-hidden className="size-3.5 shrink-0" />
      <span className="flex-1">Jump to…</span>
      <Kbd keys={PALETTE_KEYS} className="pointer-coarse:hidden" />
    </button>
  )
}
