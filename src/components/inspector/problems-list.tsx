import * as React from 'react'
import { Link } from '@tanstack/react-router'
import { useVirtualizer } from '@tanstack/react-virtual'
import { CircleCheck, CircleX, Info, TriangleAlert } from 'lucide-react'
import { EmptyState, MethodBadge } from '@/components/shared'
import {
  entityKey,
  entityLabel,
  problemLink,
  useValidationIssues,
  type Issue,
  type IssueEntity,
} from '@/lib/openapi/analysis'
import type { ValidationSeverity } from '@/lib/openapi/types'
import { cn } from '@/lib/utils'

const SEVERITY: Record<ValidationSeverity, { icon: typeof CircleX; className: string; label: string }> = {
  error: { icon: CircleX, className: 'text-destructive-foreground', label: 'Error' },
  warning: { icon: TriangleAlert, className: 'text-warning-foreground', label: 'Warning' },
  info: { icon: Info, className: 'text-muted-foreground', label: 'Note' },
}

type Row =
  | { kind: 'group'; key: string; entity: IssueEntity; count: number }
  | { kind: 'issue'; key: string; issue: Issue }

function buildRows(issues: readonly Issue[]): Row[] {
  const rows: Row[] = []
  let group: Extract<Row, { kind: 'group' }> | null = null
  for (const issue of issues) {
    const key = entityKey(issue.entity)
    if (!group || group.key !== key) {
      group = { kind: 'group', key, entity: issue.entity, count: 0 }
      rows.push(group)
    }
    group.count += 1
    rows.push({ kind: 'issue', key: issue.key, issue })
  }
  return rows
}

function GroupLabel({ entity }: { entity: IssueEntity }) {
  if (entity.kind === 'route') {
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <MethodBadge method={entity.method} />
        <span className="truncate font-mono text-[12px] text-foreground">{entity.path}</span>
      </span>
    )
  }
  if (entity.kind === 'schema') {
    return <span className="truncate font-mono text-[12px] text-foreground">{entity.name}</span>
  }
  return <span className="truncate text-foreground">{entityLabel(entity)}</span>
}

const ProblemRow = React.memo(function ProblemRow({ issue, onNavigate }: { issue: Issue; onNavigate?: () => void }) {
  const severity = SEVERITY[issue.severity]
  const Icon = severity.icon
  return (
    <Link
      {...problemLink(issue)}
      onClick={onNavigate}
      className={cn(
        'flex w-full items-start gap-2 px-3 py-2 text-left outline-none transition-colors duration-150',
        'hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
      )}
    >
      <Icon aria-hidden className={cn('mt-0.5 size-3.5 shrink-0', severity.className)} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] leading-5 text-foreground">
          <span className="sr-only">{severity.label}: </span>
          {issue.message}
        </span>
        {issue.location && (
          <span className="truncate font-mono text-[11px] leading-4 text-subtle-foreground">{issue.location}</span>
        )}
      </span>
    </Link>
  )
})

/**
 * Problems tab: every issue, grouped by entity, each row linking to the entity
 * page and anchor. Virtualized with measured rows (messages can wrap).
 */
export function ProblemsList({ onNavigate }: { onNavigate?: () => void }) {
  const { issues, counts, pending, error } = useValidationIssues()
  const deferred = React.useDeferredValue(issues)
  const rows = React.useMemo(() => buildRows(deferred), [deferred])
  const scrollRef = React.useRef<HTMLDivElement>(null)

  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (rows[index].kind === 'group' ? 32 : 52),
    getItemKey: (index) => `${rows[index].kind}:${rows[index].key}`,
    overscan: 12,
    initialRect: { width: 0, height: 600 },
  })

  if (error && deferred.length === 0) {
    return (
      <EmptyState
        size="panel"
        icon={TriangleAlert}
        title="Validation didn't run."
        description={error}
      />
    )
  }

  if (deferred.length === 0) {
    return pending ? (
      <p className="px-3 py-3 text-xs text-muted-foreground">Checking the spec…</p>
    ) : (
      <EmptyState size="panel" icon={CircleCheck} title="No problems. The spec validates cleanly." />
    )
  }

  const onlyNotes = counts.errors === 0 && counts.warnings === 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      {onlyNotes && (
        <p className="shrink-0 border-b border-border px-3 py-2 text-xs text-muted-foreground">
          No errors or warnings. {counts.infos === 1 ? 'One suggestion' : `${counts.infos} suggestions`} below.
        </p>
      )}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <ul aria-label="Problems" className="relative" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index]
            return (
              <li
                key={item.key}
                data-index={item.index}
                ref={virtualizer.measureElement}
                className={cn(
                  'absolute left-0 w-full',
                  row.kind === 'group' ? 'border-b border-border bg-muted/40' : 'border-b border-border/70',
                )}
                style={{ transform: `translateY(${item.start}px)` }}
              >
                {row.kind === 'group' ? (
                  <div className="flex h-8 items-center gap-2 px-3 text-xs">
                    <GroupLabel entity={row.entity} />
                    <span className="ml-auto font-mono text-[11px] text-subtle-foreground tabular-nums">{row.count}</span>
                  </div>
                ) : (
                  <ProblemRow issue={row.issue} onNavigate={onNavigate} />
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
