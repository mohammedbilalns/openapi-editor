import * as React from 'react'
import { Link } from '@tanstack/react-router'
import { Boxes, CircleAlert, CircleX, FileText, Import, Info, Lightbulb, Plus, Route as RouteIcon, Tag, TriangleAlert } from 'lucide-react'
import { useLiveIssues } from '@/components/inspector/live-issues'
import { EmptyState, MetaChip, PageHeader, Panel, StatusChip } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { useInfo, useRouteCount, useSchemaCount, useTags } from '@/lib/openapi/selectors'
import { cn } from '@/lib/utils'
import { plainTextSummary } from './plain-text'
import { showInspector } from './inspector-controls'
import { entityLabel, problemLink, type Issue } from '@/lib/openapi/analysis'
import { shell } from './shell-state'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** `/` — what's in the document and what needs attention (BLUEPRINT §3). */
export function Overview() {
  const info = useInfo()
  const routes = useRouteCount()
  const schemas = useSchemaCount()
  const tags = useTags()
  const issues = useLiveIssues()

  if (routes === 0 && schemas === 0) {
    return (
      <div className="mx-auto w-full max-w-[56rem] px-4 py-4 md:px-6 md:py-6">
        <EmptyState
          icon={FileText}
          title="Nothing here yet. Start with a route or import a spec."
          description="Everything stays in this browser. There are no accounts and nothing is uploaded."
          actions={
            <>
              <Button variant="outline" size="sm" onClick={shell.newRoute}>
                <Plus />
                New route
              </Button>
              <Button variant="outline" size="sm" onClick={shell.newSchema}>
                <Plus />
                New schema
              </Button>
              <Button variant="outline" size="sm" onClick={shell.importSpec}>
                <Import />
                Import a spec
              </Button>
            </>
          }
        />
      </div>
    )
  }

  const title = info.title || 'Untitled API'
  const problemCount = issues.problems.length
  const suggestionCount = issues.suggestions.length
  const description = info.description ? plainTextSummary(info.description) : ''

  return (
    <div className="@container mx-auto flex w-full max-w-[56rem] flex-col gap-6 px-4 py-4 md:px-6 md:py-6">
      <PageHeader
        title={`${title.replace(/[.!?]$/, '')}. ${plural(routes, 'route', 'routes')}, ${plural(schemas, 'schema', 'schemas')}.`}
        description={description || undefined}
      />
      <div className="grid grid-cols-2 gap-4 @[40rem]:grid-cols-4">
        <StatTile label="Routes" icon={RouteIcon} value={routes} />
        <StatTile label="Schemas" icon={Boxes} value={schemas} />
        <StatTile label="Tags" icon={Tag} value={tags.length} />
        <StatTile
          label="Problems"
          icon={CircleAlert}
          value={problemCount}
          footer={
            problemCount > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {issues.errors > 0 && (
                  <StatusChip tone="destructive">{plural(issues.errors, 'error', 'errors')}</StatusChip>
                )}
                {issues.warnings > 0 && (
                  <StatusChip tone="warning">{plural(issues.warnings, 'warning', 'warnings')}</StatusChip>
                )}
              </div>
            ) : suggestionCount > 0 ? (
              <MetaChip icon={Lightbulb}>{plural(suggestionCount, 'suggestion', 'suggestions')}</MetaChip>
            ) : undefined
          }
        />
      </div>
      <IssuesPanel
        title="Problems"
        icon={CircleAlert}
        issues={issues.problems}
        empty="No problems. The spec validates cleanly."
      />
      {suggestionCount > 0 && <IssuesPanel title="Suggestions" icon={Lightbulb} issues={issues.suggestions} />}
    </div>
  )
}

function StatTile({
  label,
  icon: Icon,
  value,
  footer,
}: {
  label: string
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  value: number
  footer?: React.ReactNode
}) {
  return (
    <section
      aria-label={label}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xs/5"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs text-muted-foreground">{label}</h2>
        <Icon aria-hidden className="size-3.5 text-muted-foreground" />
      </div>
      <p className="text-[28px] leading-[1.1] font-medium tracking-[-0.02em] tabular-nums">{value}</p>
      {footer}
    </section>
  )
}

const severityIcon = { error: CircleX, warning: TriangleAlert, info: Info } as const
const severityLabel = { error: 'Error', warning: 'Warning', info: 'Suggestion' } as const
const severityClass = {
  error: 'text-destructive-foreground',
  warning: 'text-warning-foreground',
  info: 'text-muted-foreground',
} as const

/** Top five of a list, with "View all" opening the inspector's Problems tab (which lists both). */
function IssuesPanel({
  title,
  icon,
  issues,
  empty,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  issues: readonly Issue[]
  empty?: string
}) {
  const deferred = React.useDeferredValue(issues)
  const top = deferred.slice(0, 5)
  return (
    <Panel
      title={title}
      icon={icon}
      count={deferred.length}
      flush
      actions={
        deferred.length > 0 ? (
          <Button variant="ghost" size="xs" onClick={() => showInspector('problems')}>
            View all
          </Button>
        ) : undefined
      }
    >
      {top.length === 0 ? (
        <p className="px-4 py-3 text-[13px] text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border/70">
          {top.map((issue) => {
            const Icon = severityIcon[issue.severity]
            const location = [issue.entity.kind === 'document' ? '' : entityLabel(issue.entity), issue.location]
              .filter(Boolean)
              .join(' · ')
            return (
              <li key={issue.key}>
                <Link
                  {...problemLink(issue)}
                  className="flex min-h-10 items-start gap-2.5 px-4 py-2.5 text-[13px] outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <Icon aria-hidden className={cn('mt-0.5 size-3.5 shrink-0', severityClass[issue.severity])} />
                  <span className="sr-only">{severityLabel[issue.severity]}:</span>
                  {/* Narrow (phones, a wide inspector): the location goes under the message instead of truncating. */}
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 @[32rem]:flex-row @[32rem]:items-start @[32rem]:gap-2.5">
                    <span className="min-w-0 @[32rem]:flex-1">{issue.message}</span>
                    {location && (
                      <span className="min-w-0 font-mono text-[12px] wrap-break-word text-muted-foreground @[32rem]:max-w-[40%] @[32rem]:shrink-0 @[32rem]:truncate">
                        {location}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
