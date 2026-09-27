import type * as React from 'react'
import { cn } from '@/lib/utils'

export type PageHeaderProps = {
  /** Meta row above the title: method/type chip, ids, status chips. */
  meta?: React.ReactNode
  /** A string renders in the page-title role (24px/500); a node (e.g. InlineTitleInput) is placed as-is. */
  title: React.ReactNode
  description?: React.ReactNode
  /** Right of the title: ghost icon buttons, a `…` menu. */
  actions?: React.ReactNode
  /** Row under the title (§9.21 below 1024px): segmented controls, secondary actions. */
  toolbar?: React.ReactNode
  className?: string
}

/** The top of an app screen. One per screen; the title is the page's `h1`. */
export function PageHeader({ meta, title, description, actions, toolbar, className }: PageHeaderProps) {
  return (
    <header data-slot="page-header" className={cn('flex flex-col', className)}>
      {meta && <div className="mb-2 flex min-h-5.5 flex-wrap items-center gap-1.5">{meta}</div>}
      <div className="flex items-start gap-3">
        <h1 className="min-w-0 flex-1 text-2xl leading-[1.25] font-medium tracking-[-0.025em] text-balance">
          {title}
        </h1>
        {actions && <div className="flex shrink-0 items-center gap-1 pt-1">{actions}</div>}
      </div>
      {description && <div className="mt-1.5 max-w-[42rem] text-sm text-muted-foreground">{description}</div>}
      {toolbar && <div className="mt-3 flex flex-wrap items-center gap-2">{toolbar}</div>}
    </header>
  )
}
