import * as React from 'react'
import { getActions } from '@/lib/openapi/selectors'
import type { Parsed } from './schema-model'

export type DraftOptions<T> = {
  /** The stored value. */
  value: T
  format: (value: T | undefined) => string
  parse: (text: string) => Parsed<T>
  onCommit: (value: T | undefined) => void
  /** Commit on every valid keystroke (default) or only on blur / Enter. */
  live?: boolean
}

export type Draft = {
  text: string
  /** Why the current text can't be stored; shown under the control. Cleared on blur (the text reverts). */
  error: string | null
  inputProps: {
    value: string
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
    onBlur: () => void
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
  }
  /** Replaces the draft text programmatically (e.g. clearing an add input). */
  setText: (text: string) => void
}

/**
 * Local text for a control whose stored value is parsed or validated. Invalid
 * text stays in the field with an error instead of being stored, and reverts on
 * blur or Escape. Intermediate text that parses to the stored value ("1." for 1)
 * isn't overwritten when the store echoes the value back; outside changes
 * (undo, another view) replace the text.
 */
export function useDraft<T>({ value, format, parse, onCommit, live = true }: DraftOptions<T>): Draft {
  const [text, setText] = React.useState(() => format(value))
  const [error, setError] = React.useState<string | null>(null)
  const [seen, setSeen] = React.useState(value)

  if (!Object.is(seen, value)) {
    setSeen(value)
    const parsed = parse(text)
    if (!(parsed.ok && Object.is(parsed.value, value))) {
      setText(format(value))
      setError(null)
    }
  }

  const commit = (next: string) => {
    const parsed = parse(next)
    if (!parsed.ok) return false
    if (!Object.is(parsed.value, value)) onCommit(parsed.value)
    return true
  }

  const settle = () => {
    const parsed = parse(text)
    if (parsed.ok) {
      if (!live && !Object.is(parsed.value, value)) onCommit(parsed.value)
      setText(format(parsed.value))
    } else {
      setText(format(value))
    }
    setError(null)
    // Leaving the control ends its undo step (typing coalesces while focused).
    getActions().sealHistory()
  }

  return {
    text,
    error,
    setText,
    inputProps: {
      value: text,
      onChange: (event) => {
        const next = event.target.value
        setText(next)
        const parsed = parse(next)
        setError(parsed.ok ? null : parsed.message)
        if (live) commit(next)
      },
      onBlur: settle,
      onKeyDown: (event) => {
        if (event.key === 'Escape') {
          if (text !== format(value)) {
            event.preventDefault()
            event.stopPropagation()
          }
          setText(format(value))
          setError(null)
        } else if (event.key === 'Enter' && !live) {
          event.preventDefault()
          settle()
        }
      },
    },
  }
}
