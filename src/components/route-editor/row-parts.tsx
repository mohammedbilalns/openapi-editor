import * as React from 'react'
import { Lock, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * Editable rows inside a panel (DESIGN §9.17, dense). Each table defines its
 * columns with grid-template-areas: stacked below the panel's `@[40rem]`
 * container width, one line above it.
 */
export const rowClassName = cn(
  'group/row grid scroll-mt-20 items-center gap-x-2 gap-y-1.5 border-b border-border/70 px-4 py-2 last:border-b-0',
  'transition-colors duration-150 ease-standard hover:bg-muted/40 focus-within:bg-muted/40',
  '@[40rem]:min-h-10 @[40rem]:py-1.5',
  'target:bg-accent',
)

/** Column headers; hidden while rows are stacked. */
export function RowHeader({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <div role="row" className={cn('hidden h-9 items-center gap-x-2 border-b border-border px-4 @[40rem]:grid', className)}>
      {children}
    </div>
  )
}

export function ColumnHeader({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div role="columnheader" className={cn('min-w-0 truncate text-xs font-medium text-muted-foreground', className)}>
      {children}
    </div>
  )
}

/** Visible label for a cell while rows are stacked; screen readers get the control's own label. */
export function StackedLabel({ children }: { children: React.ReactNode }) {
  return (
    <span aria-hidden className="text-xs text-muted-foreground @[40rem]:hidden">
      {children}
    </span>
  )
}

/** Hover/focus-revealed on fine pointers, always shown on touch (BLUEPRINT §2.2, §12). */
export const revealClassName =
  'opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 data-popup-open:opacity-100'

/** Ghost icon button with a tooltip that repeats its label. */
export function IconButton({
  label,
  icon: Icon,
  onClick,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Button>, 'children' | 'aria-label'> & {
  label: string
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="ghost" size="icon-xs" aria-label={label} onClick={onClick} className={className} {...props} />
        }
      >
        <Icon aria-hidden />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function RowDeleteButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <IconButton
      label={label}
      icon={Trash2}
      onClick={onClick}
      className={cn(revealClassName, 'hover:text-destructive-foreground')}
    />
  )
}

/** Stand-in for the delete button on rows that can't be removed, explaining why. */
export function RowLock({ reason }: { reason: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span role="img" aria-label={reason} className="inline-flex size-6 items-center justify-center text-muted-foreground" />
        }
      >
        <Lock aria-hidden className="size-3" />
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  )
}

/** Focuses the element once `active` turns true (a row that was just added). */
export function useFocusWhen<T extends HTMLElement>(active: boolean) {
  const ref = React.useRef<T>(null)
  React.useEffect(() => {
    if (!active) return
    ref.current?.focus()
    ref.current?.scrollIntoView({ block: 'nearest' })
  }, [active])
  return ref
}

/** h-7 control sizing inside rows (BLUEPRINT §3 density). */
export const cellInputClassName = 'h-7 rounded-md px-2 text-[13px]'
