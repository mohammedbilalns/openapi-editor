import * as React from 'react'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CountBadge } from './chips'
import { renderIcon, type IconProp } from './icon'

export type PanelProps = {
  /** DOM id on the section, e.g. for hash anchors (`#request-body`). */
  id?: string
  title: React.ReactNode
  icon?: IconProp
  count?: number
  /** Muted 12px note on the right of the header ("Sorted by path"). */
  note?: React.ReactNode
  /** Ghost `xs` actions on the right of the header. */
  actions?: React.ReactNode
  /**
   * One-line explanation under the body (§9.15 footer). A `<PanelAddRow/>` passed
   * here renders as the §9.6 add row instead.
   */
  footer?: React.ReactNode
  /** Edge-to-edge body for lists and tables; their rows carry the 16px inset. */
  flush?: boolean
  className?: string
  children?: React.ReactNode
}

/**
 * Dashboard panel, DESIGN.md §9.15. The section is an `@container`, so tables
 * inside can switch to stacked rows below `@[40rem]` (BLUEPRINT §3).
 */
export function Panel({ id, title, icon, count, note, actions, footer, flush, className, children }: PanelProps) {
  const titleId = React.useId()
  const isAddRow = React.isValidElement(footer) && footer.type === PanelAddRow
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      data-slot="panel"
      className={cn(
        '@container scroll-mt-16 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xs/5',
        className,
      )}
    >
      <header className="flex min-h-11 items-center gap-2 border-b border-border px-4 py-1.5">
        {renderIcon(icon, 'size-3.5 shrink-0 text-muted-foreground')}
        <h2 id={titleId} className="min-w-0 truncate text-sm leading-5 font-medium">
          {title}
        </h2>
        {count !== undefined && <CountBadge>{count}</CountBadge>}
        {(note || actions) && (
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {note && <span className="mr-1 text-xs text-muted-foreground">{note}</span>}
            {actions}
          </div>
        )}
      </header>
      {children !== undefined && children !== null && children !== false && (
        <div className={cn(!flush && 'p-4')}>{children}</div>
      )}
      {footer &&
        (isAddRow ? (
          footer
        ) : (
          <footer className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">{footer}</footer>
        ))}
    </section>
  )
}

export type PanelAddRowProps = {
  /** Full label, e.g. "Add field". A leading plus icon is added. */
  label: string
  onClick: () => void
  disabled?: boolean
}

/** Panel footer add row, DESIGN.md §9.6: a ghost row button "+ Add …". Pass it as `Panel`'s `footer`. */
export function PanelAddRow({ label, onClick, disabled }: PanelAddRowProps) {
  return (
    <div data-slot="panel-add-row" className="border-t border-border/60 p-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          'relative flex h-7 w-full cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground outline-none',
          'transition-colors duration-150 ease-standard hover:bg-accent/60 hover:text-foreground',
          'focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:pointer-events-none disabled:opacity-64',
          'pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:top-1/2 pointer-coarse:after:min-h-11 pointer-coarse:after:-translate-y-1/2',
        )}
      >
        <Plus aria-hidden className="size-3.5 shrink-0" />
        {label}
      </button>
    </div>
  )
}
