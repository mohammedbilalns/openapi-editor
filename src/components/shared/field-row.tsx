import * as React from 'react'
import { cn } from '@/lib/utils'
import { IssueText, type IssueLike } from './issue-text'

export type FieldRowProps = {
  label: React.ReactNode
  /** Id of the control. Without it the children are grouped and labelled by the label instead. */
  htmlFor?: string
  /** 12px muted help under the control, id `${htmlFor}-hint`. */
  hint?: React.ReactNode
  /** Inline issues under the control, id `${htmlFor}-issues` (point the control's `aria-describedby` at it). */
  issues?: readonly IssueLike[]
  /** `inline` (default): label column beside the control, stacking in narrow containers. `stacked`: label above. */
  layout?: 'inline' | 'stacked'
  className?: string
  children: React.ReactNode
}

/** Returns the ids FieldRow gives its hint and issue text, for a control's `aria-describedby`. */
export function fieldRowDescriptionIds(htmlFor: string) {
  return { hint: `${htmlFor}-hint`, issues: `${htmlFor}-issues` }
}

/** A labelled property row (BLUEPRINT §3 property grid). */
export function FieldRow({ label, htmlFor, hint, issues, layout = 'inline', className, children }: FieldRowProps) {
  const fallbackId = React.useId()
  const baseId = htmlFor ?? fallbackId
  const labelId = `${baseId}-label`
  const ids = fieldRowDescriptionIds(baseId)
  const inline = layout === 'inline'

  const labelClassName = cn('text-[13px] leading-5 text-muted-foreground', inline && '@[28rem]:py-1.5')
  const labelNode = htmlFor ? (
    <label id={labelId} htmlFor={htmlFor} className={labelClassName}>
      {label}
    </label>
  ) : (
    <span id={labelId} className={labelClassName}>
      {label}
    </span>
  )

  return (
    <div data-slot="field-row" className={cn(inline && '@container', className)}>
      <div
        className={cn(
          'grid gap-1.5',
          inline && '@[28rem]:grid-cols-[8.5rem_minmax(0,1fr)] @[28rem]:gap-x-4 @[28rem]:gap-y-0',
        )}
      >
        {labelNode}
        <div className="min-w-0">
          {htmlFor ? (
            children
          ) : (
            <fieldset aria-labelledby={labelId} className="min-w-0">
              {children}
            </fieldset>
          )}
          {hint && (
            <p id={ids.hint} className="mt-1.5 text-xs text-muted-foreground">
              {hint}
            </p>
          )}
          <IssueText issues={issues} id={ids.issues} />
        </div>
      </div>
    </div>
  )
}
