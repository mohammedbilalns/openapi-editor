import type * as React from 'react'
import { CircleCheck, CircleX, Info, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { renderIcon, type IconProp } from './icon'

/** Meta chip, DESIGN.md §9.3. Exported so buttons and links can take the same look. */
export const metaChipClassName =
  'inline-flex h-5.5 w-fit shrink-0 items-center gap-1 rounded border border-border/70 bg-muted/55 px-2 text-[11px] whitespace-nowrap text-subtle-foreground'

export type MetaChipProps = React.ComponentProps<'span'> & { icon?: IconProp }

/** Neutral chip for metadata ("Used in 3 places", "path", "Offline"). */
export function MetaChip({ icon, className, children, ...props }: MetaChipProps) {
  return (
    <span data-slot="meta-chip" className={cn(metaChipClassName, className)} {...props}>
      {renderIcon(icon, 'size-3 shrink-0')}
      {children}
    </span>
  )
}

export type StatusTone = 'destructive' | 'warning' | 'info' | 'success'

const statusToneClassName: Record<StatusTone, string> = {
  destructive: 'bg-destructive/10 text-destructive-foreground',
  warning: 'bg-warning/10 text-warning-foreground',
  info: 'bg-info/10 text-info-foreground',
  success: 'bg-success/10 text-success-foreground',
}

const statusToneIcon: Record<StatusTone, IconProp> = {
  destructive: CircleX,
  warning: TriangleAlert,
  info: Info,
  success: CircleCheck,
}

export type StatusChipProps = React.ComponentProps<'span'> & {
  tone: StatusTone
  /** Defaults to the tone's icon; pass `null` only when the text already names the status. */
  icon?: IconProp | null
}

/**
 * Status chip, DESIGN.md §9.3: a low-alpha tint with status-coloured text and an
 * icon. Only for deviations (§2.3 "Normal is neutral").
 */
export function StatusChip({ tone, icon, className, children, ...props }: StatusChipProps) {
  return (
    <span
      data-slot="status-chip"
      data-tone={tone}
      className={cn(
        'inline-flex h-5.5 w-fit shrink-0 items-center gap-1 rounded px-2 text-[11px] font-medium whitespace-nowrap',
        statusToneClassName[tone],
        className,
      )}
      {...props}
    >
      {icon === null ? null : renderIcon(icon ?? statusToneIcon[tone], 'size-3 shrink-0')}
      {children}
    </span>
  )
}

/** Count badge, DESIGN.md §9.3. */
export function CountBadge({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="count-badge"
      className={cn(
        'inline-flex w-fit shrink-0 items-center rounded-md bg-muted px-1.5 py-0.5 text-xs leading-4 font-medium text-subtle-foreground tabular-nums',
        className,
      )}
      {...props}
    />
  )
}
