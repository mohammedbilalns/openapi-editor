import type { HttpMethod } from '@/lib/openapi/types'
import { cn } from '@/lib/utils'
import { metaChipClassName } from './chips'

export type MethodBadgeProps = {
  method: HttpMethod
  /** `plain` (default): bare token in a fixed 52px box so paths align. `chip`: meta chip for page headers. */
  variant?: 'plain' | 'chip'
  className?: string
}

/**
 * HTTP method as data, not decoration (BLUEPRINT §2.5): uppercase mono 11px/500.
 * Only DELETE takes colour, and only as text.
 */
export function MethodBadge({ method, variant = 'plain', className }: MethodBadgeProps) {
  const destructive = method === 'delete'
  if (variant === 'chip') {
    return (
      <span
        data-slot="method-badge"
        className={cn(
          metaChipClassName,
          'font-mono font-medium uppercase',
          destructive && 'text-destructive-foreground',
          className,
        )}
      >
        {method}
      </span>
    )
  }
  return (
    <span
      data-slot="method-badge"
      className={cn(
        'inline-block w-[52px] shrink-0 font-mono text-[11px] leading-4 font-medium uppercase',
        destructive ? 'text-destructive-foreground' : 'text-subtle-foreground',
        className,
      )}
    >
      {method}
    </span>
  )
}
