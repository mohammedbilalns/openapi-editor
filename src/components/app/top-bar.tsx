import { Download, Ellipsis, FileCode2, Import, Menu, Monitor, Moon, PanelRight, Redo2, Sun, CircleAlert, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatKeys } from '@/components/shared'
import { useBreakpoint } from '@/hooks/use-media-query'
import { useTheme } from '@/hooks/use-theme'
import { getActions, useCanRedo, useCanUndo } from '@/lib/openapi/selectors'
import { isTheme } from '@/lib/theme'
import { Breadcrumbs, CurrentCrumb, usePageCrumbs } from './breadcrumbs'
import { exportDocument } from './document-actions'
import { IconButton } from './icon-button'
import { showInspector, toggleInspector, useInspectorOpen } from './inspector-controls'
import { shell, useShellState } from './shell-state'
import { INSPECTOR_KEYS, REDO_KEYS, UNDO_KEYS } from './shortcuts'

/**
 * App top bar, DESIGN.md §9.21 / BLUEPRINT §2.3. It sits above the scrolling
 * main (content never passes under it), so it is opaque rather than glass:
 * backdrop-filter bought nothing here and could paint blank in captures.
 */
export function TopBar() {
  const breakpoint = useBreakpoint()
  if (breakpoint === 'phone') return <PhoneTopBar />
  const full = breakpoint !== 'tablet'
  return (
    <header className="z-20 flex h-11 shrink-0 items-center gap-2 border-b border-border bg-background px-3">
      <Breadcrumbs />
      <div className="flex shrink-0 items-center gap-1">
        <HistoryButtons />
        <InspectorToggle />
        <ThemeMenu />
        {full ? (
          <Button variant="outline" size="sm" onClick={shell.importSpec} className="ml-1">
            <Import />
            Import
          </Button>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger render={<IconButton label="More actions" />}>
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={shell.importSpec}>
                <Import />
                Import…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button size="sm" onClick={exportDocument} className="ml-1">
          <Download />
          Export YAML
        </Button>
      </div>
    </header>
  )
}

function HistoryButtons() {
  const canUndo = useCanUndo()
  const canRedo = useCanRedo()
  return (
    <>
      <IconButton label="Undo" keys={UNDO_KEYS} disabled={!canUndo} onClick={() => getActions().undo()}>
        <Undo2 />
      </IconButton>
      <IconButton label="Redo" keys={REDO_KEYS} disabled={!canRedo} onClick={() => getActions().redo()}>
        <Redo2 />
      </IconButton>
    </>
  )
}

function InspectorToggle() {
  const open = useInspectorOpen()
  return (
    <IconButton label="Inspector" keys={INSPECTOR_KEYS} aria-pressed={open} onClick={toggleInspector}>
      <PanelRight />
    </IconButton>
  )
}

function ThemeRadioItems() {
  const { theme, setTheme } = useTheme()
  return (
    <DropdownMenuRadioGroup
      value={theme}
      onValueChange={(value) => {
        if (isTheme(value)) setTheme(value)
      }}
    >
      <DropdownMenuRadioItem value="light">
        <Sun />
        Light
      </DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="dark">
        <Moon />
        Dark
      </DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="system">
        <Monitor />
        System
      </DropdownMenuRadioItem>
    </DropdownMenuRadioGroup>
  )
}

function ThemeMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<IconButton label="Theme" />}>
        <Sun className="dark:hidden" />
        <Moon className="hidden dark:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <ThemeRadioItems />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** <768px: menu, current page, Export icon, More icon (§9.20). */
function PhoneTopBar() {
  const { current } = usePageCrumbs()
  const drawerOpen = useShellState((s) => s.drawerOpen)
  const canUndo = useCanUndo()
  const canRedo = useCanRedo()
  return (
    <header className="z-20 flex h-11 shrink-0 items-center gap-1 border-b border-border bg-background px-2">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Open navigation"
        aria-expanded={drawerOpen}
        onClick={() => useShellState.setState({ drawerOpen: true })}
      >
        <Menu />
      </Button>
      <div className="min-w-0 flex-1 px-1">
        <CurrentCrumb current={current} />
      </div>
      <Button size="icon-sm" aria-label="Export YAML" onClick={exportDocument}>
        <Download />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="More actions" />}>
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem disabled={!canUndo} onClick={() => getActions().undo()}>
            <Undo2 />
            Undo
            <DropdownMenuShortcut>{formatKeys(UNDO_KEYS)}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canRedo} onClick={() => getActions().redo()}>
            <Redo2 />
            Redo
            <DropdownMenuShortcut>{formatKeys(REDO_KEYS)}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => showInspector('yaml')}>
            <FileCode2 />
            YAML
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => showInspector('problems')}>
            <CircleAlert />
            Problems
          </DropdownMenuItem>
          <DropdownMenuItem onClick={shell.importSpec}>
            <Import />
            Import…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Theme</DropdownMenuLabel>
            <ThemeRadioItems />
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
