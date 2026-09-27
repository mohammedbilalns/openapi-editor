import type * as React from 'react'
import { Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/** Row actions show on hover or keyboard focus with a fine pointer, and always on touch (§12). */
export const rowActionClassName = cn(
  'transition-opacity duration-150 ease-standard',
  'pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100 pointer-fine:group-focus-within/row:opacity-100',
)

/** Dense control inside a table row (h-7, §3 density). */
export const cellInputClassName = 'h-7 rounded-md px-2 text-[13px]'

/** Ghost icon button with a tooltip, for row actions. */
export function RowIconButton({
  label,
  icon = 'delete',
  onClick,
  className,
}: {
  label: string
  icon?: 'delete' | 'remove'
  onClick: () => void
  className?: string
}) {
  const Icon = icon === 'delete' ? Trash2 : X
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            onClick={onClick}
            className={cn('hover:text-destructive-foreground', className)}
          />
        }
      >
        <Icon aria-hidden />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** Column header row for a table that stacks below `@[40rem]` (the header is hidden there). */
export function TableHead({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <div
      aria-hidden
      className={cn(
        'hidden h-8 items-center gap-2 border-b border-border px-4 text-xs font-medium text-muted-foreground @[40rem]:grid',
        className,
      )}
    >
      {children}
    </div>
  )
}
