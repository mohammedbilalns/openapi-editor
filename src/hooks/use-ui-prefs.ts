import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type InspectorTab = 'yaml' | 'problems'

/** Inspector panel size as a percentage of the main + inspector area (BLUEPRINT §2.1). */
export const INSPECTOR_DEFAULT_SIZE = 38
export const INSPECTOR_MIN_SIZE = 25
export const INSPECTOR_MAX_SIZE = 60

type UiPrefsState = {
  inspectorOpen: boolean
  inspectorTab: InspectorTab
  inspectorSize: number
  /** Sidebar route-group keys (tag names, or the untagged key) that are collapsed. */
  collapsedGroups: string[]
}

type UiPrefsActions = {
  setInspectorOpen: (open: boolean) => void
  toggleInspector: () => void
  /** Opens the inspector, optionally on a tab. */
  openInspector: (tab?: InspectorTab) => void
  setInspectorTab: (tab: InspectorTab) => void
  setInspectorSize: (size: number) => void
  toggleGroup: (key: string) => void
  setGroupCollapsed: (key: string, collapsed: boolean) => void
}

export type UiPrefs = UiPrefsState & UiPrefsActions

const DEFAULTS: UiPrefsState = {
  inspectorOpen: false,
  inspectorTab: 'yaml',
  inspectorSize: INSPECTOR_DEFAULT_SIZE,
  collapsedGroups: [],
}

function clampSize(size: number): number {
  if (!Number.isFinite(size)) return INSPECTOR_DEFAULT_SIZE
  return Math.min(INSPECTOR_MAX_SIZE, Math.max(INSPECTOR_MIN_SIZE, size))
}

/**
 * Per-browser UI preferences, persisted to localStorage. Document state lives in
 * the editor store; selection lives in the URL. Read with a selector
 * (`useUiPrefs((s) => s.inspectorTab)`) where re-render cost matters.
 */
export const useUiPrefs = create<UiPrefs>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
      toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
      openInspector: (tab) => set((s) => ({ inspectorOpen: true, inspectorTab: tab ?? s.inspectorTab })),
      setInspectorTab: (inspectorTab) => set({ inspectorTab }),
      setInspectorSize: (size) => set({ inspectorSize: clampSize(size) }),
      toggleGroup: (key) =>
        set((s) => ({
          collapsedGroups: s.collapsedGroups.includes(key)
            ? s.collapsedGroups.filter((k) => k !== key)
            : [...s.collapsedGroups, key],
        })),
      setGroupCollapsed: (key, collapsed) =>
        set((s) => {
          const has = s.collapsedGroups.includes(key)
          if (has === collapsed) return s
          return {
            collapsedGroups: collapsed ? [...s.collapsedGroups, key] : s.collapsedGroups.filter((k) => k !== key),
          }
        }),
    }),
    {
      name: 'openapi-editor:ui-prefs',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ inspectorOpen, inspectorTab, inspectorSize, collapsedGroups }): UiPrefsState => ({
        inspectorOpen,
        inspectorTab,
        inspectorSize,
        collapsedGroups,
      }),
      // Stored values come from an older build or another tab; keep only well-formed ones.
      merge: (persisted, current) => {
        if (typeof persisted !== 'object' || persisted === null) return current
        const p = persisted as Partial<Record<keyof UiPrefsState, unknown>>
        return {
          ...current,
          inspectorOpen: typeof p.inspectorOpen === 'boolean' ? p.inspectorOpen : current.inspectorOpen,
          inspectorTab: p.inspectorTab === 'yaml' || p.inspectorTab === 'problems' ? p.inspectorTab : current.inspectorTab,
          inspectorSize: typeof p.inspectorSize === 'number' ? clampSize(p.inspectorSize) : current.inspectorSize,
          collapsedGroups: Array.isArray(p.collapsedGroups)
            ? p.collapsedGroups.filter((k): k is string => typeof k === 'string')
            : current.collapsedGroups,
        }
      },
    },
  ),
)
