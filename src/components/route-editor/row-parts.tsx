import * as React from 'react'
import { Lock, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * Editable rows inside a panel (DESIGN §9.17, dense). Each table defines its
 * columns with grid-template-areas: stacked below the panel's container
 * breakpoint, one line above it. `md` is `@[40rem]`; `lg` (`@[48rem]`) is for
 * tables with more columns than fit at 40rem (Parameters).
 */
export type RowBreakpoint = 'md' | 'lg'

const rowBase = cn(
  'group/row grid scroll-mt-20 items-center gap-x-2 gap-y-1.5 border-b border-border/70 px-4 py-2 last:border-b-0',
  'transition-colors duration-150 ease-standard hover:bg-muted/40 focus-within:bg-muted/40',
  'target:bg-accent',
)

export function rowClass(breakpoint: RowBreakpoint = 'md'): string {
  return cn(rowBase, breakpoint === 'lg' ? '@[48rem]:min-h-10 @[48rem]:py-1.5' : '@[40rem]:min-h-10 @[40rem]:py-1.5')
}

export const rowClassName = rowClass('md')

/**
 * Column headers; hidden while rows are stacked. `relative` keeps the sr-only
 * "Actions" label inside the row; unpositioned, it lands against the page and
 * stretches the document.
 */
export function RowHeader({
  className,
  breakpoint = 'md',
  children,
}: {
  className: string
  breakpoint?: RowBreakpoint
  children: React.ReactNode
}) {
  return (
    <div
      role="row"
      className={cn(
        'relative hidden h-9 items-center gap-x-2 border-b border-border px-4',
        breakpoint === 'lg' ? '@[48rem]:grid' : '@[40rem]:grid',
        className,
      )}
    >
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
export function StackedLabel({ breakpoint = 'md', children }: { breakpoint?: RowBreakpoint; children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className={cn('text-xs text-muted-foreground', breakpoint === 'lg' ? '@[48rem]:hidden' : '@[40rem]:hidden')}
    >
      {children}
    </span>
  )
}

/**
 * For a placeholder that names the cell ("Description"): it labels the stacked
 * layout, but in table layout the column header already does, so it only
 * shows while the input has focus.
 */
export function headerPlaceholderClass(breakpoint: RowBreakpoint = 'md'): string {
  return breakpoint === 'lg'
    ? '@[48rem]:placeholder:text-transparent @[48rem]:focus:placeholder:text-muted-foreground'
    : '@[40rem]:placeholder:text-transparent @[40rem]:focus:placeholder:text-muted-foreground'
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
