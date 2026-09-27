import type * as React from 'react'
import { cn } from '@/lib/utils'
import { renderIcon, type IconProp } from './icon'

export type EmptyStateProps = {
  icon?: IconProp
  /** `page`: a two-beat sentence ("Nothing here yet. Start with a route or import a spec."). */
  title: React.ReactNode
  description?: React.ReactNode
  /** Outline buttons or links. */
  actions?: React.ReactNode
  /** `page` (default) fills the content column and its title is the page `h1`; `panel` sits inside a panel body. */
  size?: 'page' | 'panel'
  className?: string
}

export function EmptyState({ icon, title, description, actions, size = 'page', className }: EmptyStateProps) {
  const page = size === 'page'
  const Title = page ? 'h1' : 'p'
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex flex-col items-center text-center',
        page ? 'gap-2 px-4 py-16 md:py-24' : 'gap-1 px-4 py-8',
        className,
      )}
    >
      {icon && (
        <div
          className={cn(
            'flex items-center justify-center rounded-lg border border-border/70 bg-muted/40 text-muted-foreground',
            page ? 'mb-2 size-10' : 'mb-1.5 size-8',
          )}
        >
          {renderIcon(icon, page ? 'size-4' : 'size-3.5')}
        </div>
      )}
      <Title
        className={cn(
          'max-w-[34rem] text-balance',
          page ? 'text-2xl leading-[1.25] font-medium tracking-[-0.025em]' : 'text-sm font-medium',
        )}
      >
        {title}
      </Title>
      {description && (
        <p className={cn('max-w-[34rem] text-muted-foreground', page ? 'text-sm' : 'text-xs')}>{description}</p>
      )}
      {actions && (
        <div className={cn('flex flex-wrap items-center justify-center gap-2', page ? 'mt-4' : 'mt-2')}>{actions}</div>
      )}
    </div>
  )
}
