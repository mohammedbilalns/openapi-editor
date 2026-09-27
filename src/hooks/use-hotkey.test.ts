import { describe, expect, it } from 'vitest'
import { matchesHotkey } from './use-hotkey'

// jsdom reports a non-Apple platform, so `mod` is Ctrl here.
function key(init: KeyboardEventInit) {
  return new KeyboardEvent('keydown', init)
}

describe('matchesHotkey', () => {
  it('maps mod to Ctrl and requires exact modifiers', () => {
    expect(matchesHotkey(key({ key: 'k', code: 'KeyK', ctrlKey: true }), 'mod+k')).toBe(true)
    expect(matchesHotkey(key({ key: 'k', code: 'KeyK', ctrlKey: true, shiftKey: true }), 'mod+k')).toBe(false)
    expect(matchesHotkey(key({ key: 'k', code: 'KeyK' }), 'mod+k')).toBe(false)
  })

  it('handles shifted letters, backslash and physical codes', () => {
    expect(matchesHotkey(key({ key: 'Z', code: 'KeyZ', ctrlKey: true, shiftKey: true }), 'mod+shift+z')).toBe(true)
    expect(matchesHotkey(key({ key: '\\', code: 'Backslash', ctrlKey: true }), 'mod+\\')).toBe(true)
    expect(matchesHotkey(key({ key: 'я', code: 'KeyZ', ctrlKey: true }), 'mod+z')).toBe(true)
    expect(matchesHotkey(key({ key: 'Escape', code: 'Escape' }), 'esc')).toBe(true)
  })
})
