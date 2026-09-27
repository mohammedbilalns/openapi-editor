import type * as React from 'react'
import { Kbd as KbdPrimitive } from '@/components/ui/kbd'

let macCache: boolean | undefined

/** True on Apple platforms, where `mod` means ⌘ instead of Ctrl. */
export function isMacPlatform(): boolean {
  if (macCache !== undefined) return macCache
  if (typeof navigator === 'undefined') return false
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  const platform = nav.userAgentData?.platform ?? navigator.platform ?? ''
  macCache = /mac|iphone|ipad|ipod/i.test(platform)
  return macCache
}

const MAC_LABELS: Record<string, string> = {
  mod: '⌘',
  meta: '⌘',
  cmd: '⌘',
  ctrl: '⌃',
  alt: '⌥',
  option: '⌥',
  shift: '⇧',
  enter: '↵',
  return: '↵',
  escape: 'Esc',
  esc: 'Esc',
  backspace: '⌫',
  delete: '⌦',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
}

const OTHER_LABELS: Record<string, string> = {
  mod: 'Ctrl',
  meta: 'Win',
  cmd: 'Ctrl',
  ctrl: 'Ctrl',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift',
  enter: 'Enter',
  return: 'Enter',
  escape: 'Esc',
  esc: 'Esc',
  backspace: 'Backspace',
  delete: 'Del',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
}

function keyLabel(key: string, mac: boolean): string {
  const lower = key.toLowerCase()
  const label = (mac ? MAC_LABELS : OTHER_LABELS)[lower]
  if (label) return label
  return key.length === 1 ? key.toUpperCase() : key
}

/** Formats `['mod', 'shift', 'z']` as `⌘⇧Z` on Apple platforms and `Ctrl+Shift+Z` elsewhere. */
export function formatKeys(keys: readonly string[]): string {
  const mac = isMacPlatform()
  const labels = keys.map((key) => keyLabel(key, mac))
  return labels.join(mac ? '' : '+')
}

export type KbdProps = Omit<React.ComponentProps<'kbd'>, 'children'> & {
  /** Key names; `mod` renders as ⌘ on Apple platforms and Ctrl elsewhere. */
  keys: readonly string[]
}

/** Keyboard hint, DESIGN.md §9.3. */
export function Kbd({ keys, ...props }: KbdProps) {
  return <KbdPrimitive {...props}>{formatKeys(keys)}</KbdPrimitive>
}
