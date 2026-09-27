import type * as React from 'react'
import { cn } from '@/lib/utils'

export type InlineTitleInputProps = Omit<
  React.ComponentProps<'input'>,
  'value' | 'onChange' | 'placeholder' | 'aria-label' | 'aria-invalid'
> & {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Mono for identifiers (paths, schema names). */
  mono?: boolean
  'aria-label': string
  invalid?: boolean
}

/**
 * Page title that is also the entity's name (BLUEPRINT §3): 24px/500, borderless
 * until hover or focus. Enter or Escape leaves the field. Place it as PageHeader's `title`.
 */
export function InlineTitleInput({
  value,
  onChange,
  placeholder,
  mono,
  invalid,
  className,
  onKeyDown,
  ...props
}: InlineTitleInputProps) {
  return (
    <input
      type="text"
      spellCheck={mono ? false : undefined}
      autoComplete="off"
      {...props}
      value={value}
      placeholder={placeholder}
      aria-invalid={invalid || undefined}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (event.defaultPrevented) return
        if (event.key === 'Enter' || event.key === 'Escape') {
          event.preventDefault()
          event.currentTarget.blur()
        }
      }}
      className={cn(
        '-mx-2 h-10 w-[calc(100%+1rem)] min-w-0 rounded-lg border border-transparent bg-transparent px-2 text-2xl leading-[1.25] font-medium text-foreground outline-none',
        mono ? 'font-mono tracking-[-0.02em]' : 'tracking-[-0.025em]',
        'transition-[border-color,box-shadow,background-color] duration-150 ease-standard',
        'placeholder:text-muted-foreground hover:border-input',
        'focus-visible:border-ring focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring/24 dark:focus-visible:ring-ring/48',
        'aria-invalid:border-destructive/36 aria-invalid:ring-2 aria-invalid:ring-destructive/16 dark:aria-invalid:ring-destructive/24',
        className,
      )}
    />
  )
}
