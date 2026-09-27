import { create } from 'zustand'

/**
 * Transient shell UI state (not persisted): which overlay is open. The inspector's
 * persisted open state (≥1024px) lives in `useUiPrefs`; below 1024px the inspector
 * is a sheet whose open state lives here so it never pops open on reload.
 */
type ShellState = {
  paletteOpen: boolean
  drawerOpen: boolean
  inspectorSheetOpen: boolean
  newRouteOpen: boolean
  newSchemaOpen: boolean
  importOpen: boolean
  set: (partial: Partial<Omit<ShellState, 'set'>>) => void
}

export const useShellState = create<ShellState>()((set) => ({
  paletteOpen: false,
  drawerOpen: false,
  inspectorSheetOpen: false,
  newRouteOpen: false,
  newSchemaOpen: false,
  importOpen: false,
  set: (partial) => set(partial),
}))

export const shell = {
  openPalette: () => useShellState.setState({ paletteOpen: true, drawerOpen: false }),
  togglePalette: () => useShellState.setState((s) => ({ paletteOpen: !s.paletteOpen, drawerOpen: false })),
  newRoute: () => useShellState.setState({ newRouteOpen: true, paletteOpen: false, drawerOpen: false }),
  newSchema: () => useShellState.setState({ newSchemaOpen: true, paletteOpen: false, drawerOpen: false }),
  importSpec: () => useShellState.setState({ importOpen: true, paletteOpen: false, drawerOpen: false }),
  closeDrawer: () => useShellState.setState({ drawerOpen: false }),
}
