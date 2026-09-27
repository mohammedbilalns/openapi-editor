import * as React from 'react'
import { isMacPlatform } from '@/components/shared/kbd'

/**
 * A key combination such as `mod+k`, `mod+shift+z`, `ctrl+y`, `mod+\\` or
 * `escape`. `mod` is ⌘ on Apple platforms and Ctrl elsewhere. Modifiers must
 * match exactly.
 */
export type Hotkey = string

type ParsedHotkey = { key: string; mod: boolean; ctrl: boolean; meta: boolean; alt: boolean; shift: boolean }

const KEY_ALIASES: Record<string, string> = {
  esc: 'escape',
  return: 'enter',
  space: ' ',
  plus: '+',
  slash: '/',
  backslash: '\\',
}

function parseHotkey(hotkey: Hotkey): ParsedHotkey {
  const parts = hotkey.toLowerCase().split('+')
  // `mod++` would split into ['mod', '', '']; the trailing empty parts mean the plus key.
  const rawKey = parts.at(-1) === '' ? '+' : (parts.at(-1) ?? '')
  const mods = new Set(parts.slice(0, -1).filter(Boolean))
  return {
    key: KEY_ALIASES[rawKey] ?? rawKey,
    mod: mods.has('mod'),
    ctrl: mods.has('ctrl'),
    meta: mods.has('meta') || mods.has('cmd'),
    alt: mods.has('alt') || mods.has('option'),
    shift: mods.has('shift'),
  }
}

/** Letter/digit keys by physical code, so combos work on non-Latin layouts too. */
function keyFromCode(code: string): string | undefined {
  if (code.startsWith('Key')) return code.slice(3).toLowerCase()
  if (code.startsWith('Digit')) return code.slice(5)
  if (code === 'Backslash') return '\\'
  return undefined
}

export function matchesHotkey(event: KeyboardEvent, hotkey: Hotkey): boolean {
  const parsed = parseHotkey(hotkey)
  const mac = isMacPlatform()
  const wantCtrl = parsed.ctrl || (parsed.mod && !mac)
  const wantMeta = parsed.meta || (parsed.mod && mac)
  if (event.ctrlKey !== wantCtrl || event.metaKey !== wantMeta) return false
  if (event.altKey !== parsed.alt || event.shiftKey !== parsed.shift) return false
  const key = event.key.toLowerCase()
  return key === parsed.key || keyFromCode(event.code) === parsed.key
}

/** True when the event comes from a text field, select or contenteditable element. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  if (target instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(target.type)
  }
  return false
}

export type UseHotkeyOptions = {
  /** Default true. */
  enabled?: boolean
  /** Fire while focus is in a text field. Default false. */
  allowInInputs?: boolean
  /** Call `preventDefault()` on match. Default true. */
  preventDefault?: boolean
  /** Return false to skip this event (e.g. inside `[data-native-undo]`). */
  when?: (event: KeyboardEvent) => boolean
}

/**
 * Binds one or more key combinations on `window` for the lifetime of the
 * component. The handler can change every render without re-binding.
 */
export function useHotkey(
  hotkeys: Hotkey | readonly Hotkey[],
  handler: (event: KeyboardEvent) => void,
  options: UseHotkeyOptions = {},
): void {
  const { enabled = true, allowInInputs = false, preventDefault = true, when } = options
  const handlerRef = React.useRef(handler)
  const whenRef = React.useRef(when)
  React.useLayoutEffect(() => {
    handlerRef.current = handler
    whenRef.current = when
  })

  const list = typeof hotkeys === 'string' ? hotkeys : hotkeys.join('\u0000')

  React.useEffect(() => {
    if (!enabled) return
    const combos = list.split('\u0000')
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.defaultPrevented) return
      if (!combos.some((combo) => matchesHotkey(event, combo))) return
      if (!allowInInputs && isEditableTarget(event.target)) return
      if (whenRef.current && !whenRef.current(event)) return
      if (preventDefault) event.preventDefault()
      handlerRef.current(event)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [list, enabled, allowInInputs, preventDefault])
}
