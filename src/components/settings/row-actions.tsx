import type * as React from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * Row delete button: revealed on row hover or focus-within (§7), always shown
 * on touch. The row needs the `group/row` class.
 */
export function RowDeleteButton({ label, onClick, className }: { label: string; onClick: () => void; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            onClick={onClick}
            className={cn(
              'opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100',
              className,
            )}
          />
        }
      >
        <Trash2 aria-hidden />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** The inline "add" row that replaces a panel's "+ Add …" button while drafting. */
export function DraftRow({
  onSubmit,
  onCancel,
  submitLabel,
  canSubmit,
  children,
  error,
}: {
  onSubmit: () => void
  onCancel: () => void
  submitLabel: string
  canSubmit: boolean
  children: React.ReactNode
  error?: React.ReactNode
}) {
  return (
    // Escape from any of the row's inputs cancels the draft (delegated from the form).
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <form
      className="flex flex-col gap-2 border-t border-border/60 px-4 py-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSubmit) onSubmit()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          onCancel()
        }
      }}
    >
      <div className="flex flex-col gap-2 @[40rem]:flex-row @[40rem]:items-center">{children}</div>
      {error}
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}

/** 12px muted line with an issue for a draft row. */
export function DraftError({ id, children }: { id: string; children: React.ReactNode }) {
  if (!children) return null
  return (
    <p id={id} className="text-xs text-destructive-foreground">
      {children}
    </p>
  )
}
