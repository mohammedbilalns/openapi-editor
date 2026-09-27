import { useHotkey } from '@/hooks/use-hotkey'
import { getActions } from '@/lib/openapi/selectors'
import { saveNow } from '@/lib/persistence'
import { toggleInspector } from './inspector-controls'
import { shell } from './shell-state'

/** True while a modal dialog (palette, confirm, import, sheet) is open. */
function modalOpen(): boolean {
  return document.querySelector('[role="dialog"][data-open], [role="alertdialog"][data-open]') !== null
}

/** Store undo/redo, except in fields that keep their own history. */
function historyAllowed(event: KeyboardEvent): boolean {
  const target = event.target instanceof Element ? event.target : null
  if (target?.closest('[data-native-undo]')) return false
  return !modalOpen()
}

/**
 * Global shortcuts (BLUEPRINT §3 Shortcuts). Mod is ⌘ on Apple platforms and
 * Ctrl elsewhere. Escape is handled by each drawer, sheet and dialog.
 */
export function AppHotkeys() {
  useHotkey('mod+k', shell.togglePalette, { allowInInputs: true })
  useHotkey('mod+z', () => getActions().undo(), { allowInInputs: true, when: historyAllowed })
  useHotkey(['mod+shift+z', 'ctrl+y'], () => getActions().redo(), { allowInInputs: true, when: historyAllowed })
  useHotkey('mod+\\', toggleInspector, { allowInInputs: true, when: () => !modalOpen() })
  useHotkey('mod+s', () => void saveNow(), { allowInInputs: true })
  return null
}
