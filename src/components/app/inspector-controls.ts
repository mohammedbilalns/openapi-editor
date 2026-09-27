import { BREAKPOINTS, useBreakpoint } from '@/hooks/use-media-query'
import { useUiPrefs, type InspectorTab } from '@/hooks/use-ui-prefs'
import { useShellState } from './shell-state'

/** ≥1024px the inspector is a docked, persisted panel; below it is a transient sheet. */
function isDocked(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(`(min-width: ${BREAKPOINTS.laptop}px)`).matches
}

export function setInspectorOpen(open: boolean): void {
  if (isDocked()) useUiPrefs.getState().setInspectorOpen(open)
  else useShellState.setState({ inspectorSheetOpen: open, drawerOpen: false })
}

export function toggleInspector(): void {
  setInspectorOpen(!(isDocked() ? useUiPrefs.getState().inspectorOpen : useShellState.getState().inspectorSheetOpen))
}

/** Opens the inspector on a tab (e.g. Problems from the sidebar). */
export function showInspector(tab: InspectorTab): void {
  useUiPrefs.getState().setInspectorTab(tab)
  setInspectorOpen(true)
}

/** Whether the inspector is open in the current layout band. */
export function useInspectorOpen(): boolean {
  const breakpoint = useBreakpoint()
  const docked = breakpoint === 'laptop' || breakpoint === 'desktop'
  const prefsOpen = useUiPrefs((s) => s.inspectorOpen)
  const sheetOpen = useShellState((s) => s.inspectorSheetOpen)
  return docked ? prefsOpen : sheetOpen
}
