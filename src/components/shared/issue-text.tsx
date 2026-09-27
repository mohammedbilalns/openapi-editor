import { CircleX, Info, TriangleAlert } from 'lucide-react'
import type { ValidationSeverity } from '@/lib/openapi/types'
import { cn } from '@/lib/utils'

/** The minimum an issue needs to be shown inline. Validation issue types satisfy it structurally. */
export type IssueLike = { message: string; severity: ValidationSeverity }

const severityClassName: Record<ValidationSeverity, string> = {
  error: 'text-destructive-foreground',
  warning: 'text-warning-foreground',
  info: 'text-muted-foreground',
}

const severityIcon = { error: CircleX, warning: TriangleAlert, info: Info } as const

const severityLabel: Record<ValidationSeverity, string> = {
  error: 'Error',
  warning: 'Warning',
  info: 'Note',
}

export type IssueTextProps = {
  issues: readonly IssueLike[] | undefined
  /** Referenced by the control's `aria-describedby`. */
  id: string
  className?: string
}

/**
 * Inline validation text under a control (BLUEPRINT §2.6). 12px, status-coloured,
 * always with an icon and an sr-only severity word so status is never colour-only.
 * Renders nothing when there are no issues.
 */
export function IssueText({ issues, id, className }: IssueTextProps) {
  if (!issues || issues.length === 0) return null
  return (
    <div id={id} data-slot="issue-text" className={cn('mt-1.5 flex flex-col gap-0.5', className)}>
      {issues.map((issue, index) => {
        const Icon = severityIcon[issue.severity]
        return (
          <p
            // Messages can repeat; position is the only stable identity here.
            // oxlint-disable-next-line react/no-array-index-key
            key={index}
            className={cn('flex items-start gap-1.5 text-xs leading-4', severityClassName[issue.severity])}
          >
            <Icon aria-hidden className="mt-0.5 size-3 shrink-0" />
            <span>
              <span className="sr-only">{severityLabel[issue.severity]}:</span> {issue.message}
            </span>
          </p>
        )
      })}
    </div>
  )
}
