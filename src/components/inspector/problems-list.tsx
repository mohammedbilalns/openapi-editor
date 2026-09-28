import * as React from 'react'
import { Link } from '@tanstack/react-router'
import { useVirtualizer } from '@tanstack/react-virtual'
import { CircleCheck, CircleX, Info, TriangleAlert } from 'lucide-react'
import { EmptyState, MethodBadge } from '@/components/shared'
import { entityKey, entityLabel, problemLink, type Issue, type IssueEntity } from '@/lib/openapi/analysis'
import type { ValidationSeverity } from '@/lib/openapi/types'
import { cn } from '@/lib/utils'
import { useLiveIssues } from './live-issues'

const SEVERITY: Record<ValidationSeverity, { icon: typeof CircleX; className: string; label: string }> = {
  error: { icon: CircleX, className: 'text-destructive-foreground', label: 'Error' },
  warning: { icon: TriangleAlert, className: 'text-warning-foreground', label: 'Warning' },
  info: { icon: Info, className: 'text-muted-foreground', label: 'Suggestion' },
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

const SECTION_HEIGHT = 32
const EMPTY_ROW_HEIGHT = 40

function useIssueVirtualizer(rows: Row[], scrollRef: React.RefObject<HTMLDivElement | null>, scrollMargin: number) {
  // oxlint-disable-next-line react/incompatible-library
  return useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (rows[index].kind === 'group' ? 32 : 52),
    getItemKey: (index) => `${rows[index].kind}:${rows[index].key}`,
    overscan: 12,
    initialRect: { width: 0, height: 600 },
    scrollMargin,
  })
}

function SectionHeading({ id, label, count }: { id: string; label: string; count: number }) {
  return (
    <h3
      id={id}
      className="flex h-8 items-center gap-2 border-b border-border px-3 text-xs font-medium text-foreground"
    >
      {label}
      <span className="font-mono text-[11px] font-normal text-subtle-foreground tabular-nums">{count}</span>
    </h3>
  )
}

function IssueList({
  label,
  rows,
  virtualizer,
  onNavigate,
}: {
  label: string
  rows: Row[]
  virtualizer: ReturnType<typeof useIssueVirtualizer>
  onNavigate?: () => void
}) {
  const margin = virtualizer.options.scrollMargin
  return (
    <ul aria-label={label} className="relative" style={{ height: virtualizer.getTotalSize() }}>
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
            style={{ transform: `translateY(${item.start - margin}px)` }}
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
  )
}

/**
 * Problems tab: errors and warnings ("Problems"), then info-level notes
 * ("Suggestions"), each grouped by entity, each row linking to the entity page
 * and anchor. Both lists are virtualized in one scroll area with measured rows
 * (messages can wrap).
 */
export function ProblemsList({ onNavigate }: { onNavigate?: () => void }) {
  const live = useLiveIssues()
  const problems = React.useDeferredValue(live.problems)
  const suggestions = React.useDeferredValue(live.suggestions)
  const problemRows = React.useMemo(() => buildRows(problems), [problems])
  const suggestionRows = React.useMemo(() => buildRows(suggestions), [suggestions])
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const headingId = React.useId()

  const problemsVirtualizer = useIssueVirtualizer(problemRows, scrollRef, SECTION_HEIGHT)
  const problemsHeight = problemRows.length > 0 ? problemsVirtualizer.getTotalSize() : EMPTY_ROW_HEIGHT
  const suggestionsVirtualizer = useIssueVirtualizer(
    suggestionRows,
    scrollRef,
    SECTION_HEIGHT + problemsHeight + SECTION_HEIGHT,
  )

  const total = problems.length + suggestions.length

  if (live.error && total === 0) {
    return (
      <EmptyState
        size="panel"
        icon={TriangleAlert}
        title="Validation didn't run."
        description={live.error}
      />
    )
  }

  if (total === 0) {
    return live.pending ? (
      <p className="px-3 py-3 text-xs text-muted-foreground">Checking the spec…</p>
    ) : (
      <EmptyState size="panel" icon={CircleCheck} title="No problems. The spec validates cleanly." />
    )
  }

  return (
    <div ref={scrollRef} className="h-full min-h-0 overflow-y-auto">
      <section aria-labelledby={`${headingId}-problems`}>
        <SectionHeading id={`${headingId}-problems`} label="Problems" count={problems.length} />
        {problemRows.length > 0 ? (
          <IssueList label="Problems" rows={problemRows} virtualizer={problemsVirtualizer} onNavigate={onNavigate} />
        ) : (
          <p className="flex h-10 items-center border-b border-border/70 px-3 text-xs text-muted-foreground">
            No errors or warnings.
          </p>
        )}
      </section>
      {suggestionRows.length > 0 && (
        <section aria-labelledby={`${headingId}-suggestions`}>
          <SectionHeading id={`${headingId}-suggestions`} label="Suggestions" count={suggestions.length} />
          <IssueList
            label="Suggestions"
            rows={suggestionRows}
            virtualizer={suggestionsVirtualizer}
            onNavigate={onNavigate}
          />
        </section>
      )}
    </div>
  )
}
