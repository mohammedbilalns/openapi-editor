import * as React from 'react'
import { Ellipsis, Route as RouteIcon, Trash2 } from 'lucide-react'
import {
  FieldRow,
  InlineTitleInput,
  IssueText,
  MethodBadge,
  PageHeader,
  StatusChip,
} from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { showInspector } from '@/components/app/inspector-controls'
import { MissingEntity } from '@/components/app/not-found'
import { METHOD_ORDER, useActions } from '@/lib/openapi/selectors'
import { useEditorStore } from '@/lib/openapi/store'
import type { HttpMethod, NodeId, Route } from '@/lib/openapi/types'
import { ParametersPanel } from './parameters-panel'
import { normalizePath, syncPathParams } from './path-params'
import { AddRequestBodyLink, RequestBodyPanel } from './request-body-panel'
import { ResponsesPanel } from './responses-panel'
import { countIssues, fieldIssues, issueProps, useIssuesFor, type RouteIssue } from './route-issues'
import { TagsCombobox } from './tags-combobox'
import { useDeleteRoute } from './use-delete-route'

/** One field of one route. Primitive fields only re-render when that field changes. */
function useRouteField<K extends keyof Route>(routeId: NodeId, key: K): Route[K] | undefined {
  return useEditorStore((s) => s.document.routes.get(routeId)?.[key])
}

const contentClassName = 'mx-auto flex w-full max-w-[56rem] flex-col gap-6 px-4 py-4 md:px-6 md:py-6'

/** `/routes/$routeId` (BLUEPRINT §3 "Route editor"). */
export function RouteEditor({ routeId }: { routeId: NodeId }) {
  const exists = useEditorStore((s) => s.document.routes.has(routeId))
  if (!exists) return <MissingEntity entity="route" icon={RouteIcon} />
  return (
    <div className={contentClassName}>
      <RouteHeader routeId={routeId} />
      <RouteProperties routeId={routeId} />
      <div className="flex flex-col gap-4">
        <ParametersPanel routeId={routeId} />
        <RequestBodyPanel routeId={routeId} />
        <ResponsesPanel routeId={routeId} />
        <AddRequestBodyLink routeId={routeId} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Header

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

/** "2 errors" / "3 warnings" (BLUEPRINT §2.6); they open the Problems tab. Nothing when clean. */
function IssueChips({ issues }: { issues: readonly RouteIssue[] }) {
  const { errors, warnings } = countIssues(issues)
  if (errors === 0 && warnings === 0) return null
  const chipButton = 'relative cursor-pointer rounded outline-none focus-visible:ring-2 focus-visible:ring-ring'
  return (
    <>
      {errors > 0 && (
        <button type="button" className={chipButton} onClick={() => showInspector('problems')}>
          <StatusChip tone="destructive">{plural(errors, 'error')}</StatusChip>
          <span className="sr-only">, show problems</span>
        </button>
      )}
      {warnings > 0 && (
        <button type="button" className={chipButton} onClick={() => showInspector('problems')}>
          <StatusChip tone="warning">{plural(warnings, 'warning')}</StatusChip>
          <span className="sr-only">, show problems</span>
        </button>
      )}
    </>
  )
}

function RouteHeader({ routeId }: { routeId: NodeId }) {
  const method = useRouteField(routeId, 'method') ?? 'get'
  const operationId = useRouteField(routeId, 'operationId')
  const deprecated = useRouteField(routeId, 'deprecated') === true
  const issues = useIssuesFor(routeId)
  const pathIssues = fieldIssues(issues, 'path')

  return (
    <PageHeader
      meta={
        <>
          <MethodBadge method={method} variant="chip" />
          {operationId && (
            <span className="min-w-0 truncate font-mono text-[11px] text-subtle-foreground">{operationId}</span>
          )}
          <IssueChips issues={issues} />
          {deprecated && <StatusChip tone="warning">Deprecated</StatusChip>}
        </>
      }
      title={<PathTitle routeId={routeId} issues={pathIssues} />}
      description={pathIssues.length > 0 ? <IssueText issues={pathIssues} id={pathIssuesId(routeId)} /> : undefined}
      actions={<RouteMenu routeId={routeId} />}
    />
  )
}

const pathIssuesId = (routeId: NodeId) => `path-${routeId}-issues`

function PathTitle({ routeId, issues }: { routeId: NodeId; issues: readonly RouteIssue[] }) {
  const path = useRouteField(routeId, 'path') ?? ''
  const { updateRoute, sealHistory } = useActions()
  /** The path when editing started, so a changed `{name}` renames its parameter. */
  const startRef = React.useRef<string | null>(null)

  const commit = React.useCallback(() => {
    const start = startRef.current
    startRef.current = null
    const route = useEditorStore.getState().document.routes.get(routeId)
    if (!route) return
    const normalized = normalizePath(route.path) || route.path
    const parameters = syncPathParams(route.parameters, normalized, start ?? undefined)
    const updates: Partial<Route> = {}
    if (normalized !== route.path) updates.path = normalized
    if (parameters !== route.parameters) updates.parameters = parameters
    if (updates.path !== undefined || updates.parameters !== undefined) updateRoute(routeId, updates)
    sealHistory()
  }, [routeId, updateRoute, sealHistory])

  // Leaving the page mid-edit (e.g. a shortcut) still adds the new parameters.
  React.useEffect(
    () => () => {
      if (startRef.current !== null) commit()
    },
    [commit],
  )

  return (
    <InlineTitleInput
        mono
        aria-label="Path"
        placeholder="/path/{id}"
        value={path}
        invalid={issues.length > 0}
        aria-describedby={issues.length > 0 ? pathIssuesId(routeId) : undefined}
        onFocus={() => {
          startRef.current = useEditorStore.getState().document.routes.get(routeId)?.path ?? null
        }}
        onBlur={commit}
        onChange={(value) => updateRoute(routeId, { path: value })}
      />
  )
}

function RouteMenu({ routeId }: { routeId: NodeId }) {
  const deleteRoute = useDeleteRoute()
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Route actions" />} />
          }
        >
          <Ellipsis aria-hidden />
        </TooltipTrigger>
        <TooltipContent>Route actions</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuItem variant="destructive" onClick={() => deleteRoute(routeId)}>
          <Trash2 aria-hidden />
          Delete route
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ---------------------------------------------------------------------------
// Property grid

export const METHOD_OPTIONS: readonly HttpMethod[] = METHOD_ORDER

function RouteProperties({ routeId }: { routeId: NodeId }) {
  const baseId = React.useId()
  const ids = {
    method: `${baseId}-method`,
    tags: `${baseId}-tags`,
    deprecated: `${baseId}-deprecated`,
    operationId: `${baseId}-operation-id`,
    summary: `${baseId}-summary`,
    description: `${baseId}-description`,
  }
  const method = useRouteField(routeId, 'method') ?? 'get'
  const tags = useRouteField(routeId, 'tags') ?? []
  const deprecated = useRouteField(routeId, 'deprecated') === true
  const operationId = useRouteField(routeId, 'operationId') ?? ''
  const summary = useRouteField(routeId, 'summary') ?? ''
  const description = useRouteField(routeId, 'description') ?? ''
  const { updateRoute, sealHistory } = useActions()
  const issues = useIssuesFor(routeId)

  return (
    <section aria-label="Route details" className="flex flex-col gap-3">
      <FieldRow label="Method" htmlFor={ids.method}>
        <Select value={method} onValueChange={(next: HttpMethod) => updateRoute(routeId, { method: next })}>
          <SelectTrigger
            id={ids.method}
            className="w-36 font-mono text-[12.5px] uppercase"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {METHOD_OPTIONS.map((option) => (
              <SelectItem key={option} value={option} className="font-mono text-[12px] uppercase">
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>
      <FieldRow label="Tags" htmlFor={ids.tags}>
        <TagsCombobox id={ids.tags} value={tags} onChange={(next) => updateRoute(routeId, { tags: next })} />
      </FieldRow>
      <FieldRow label="Deprecated" htmlFor={ids.deprecated}>
        <div className="flex min-h-8 items-center gap-2">
          <Checkbox
            id={ids.deprecated}
            aria-label="Deprecated"
            aria-describedby={`${ids.deprecated}-note`}
            checked={deprecated}
            onCheckedChange={(checked) => updateRoute(routeId, { deprecated: checked || undefined })}
          />
          <span id={`${ids.deprecated}-note`} className="text-xs text-muted-foreground">
            Clients should stop using this route.
          </span>
        </div>
      </FieldRow>
      <FieldRow label="Operation ID" htmlFor={ids.operationId} issues={fieldIssues(issues, 'operationId')}>
        <Input
          id={ids.operationId}
          value={operationId}
          placeholder="getPetById"
          spellCheck={false}
          autoComplete="off"
          className="font-mono text-[12.5px]"
          {...issueProps(issues, 'operationId', ids.operationId)}
          onBlur={sealHistory}
          onChange={(event) => updateRoute(routeId, { operationId: event.target.value || undefined })}
        />
      </FieldRow>
      <FieldRow label="Summary" htmlFor={ids.summary}>
        <Input
          id={ids.summary}
          value={summary}
          placeholder="One line on what it does"
          onBlur={sealHistory}
          onChange={(event) => updateRoute(routeId, { summary: event.target.value || undefined })}
        />
      </FieldRow>
      <FieldRow label="Description" htmlFor={ids.description}>
        <Textarea
          id={ids.description}
          rows={3}
          value={description}
          placeholder="Details, edge cases, examples"
          className="min-h-0 resize-y"
          onBlur={sealHistory}
          onChange={(event) => updateRoute(routeId, { description: event.target.value || undefined })}
        />
      </FieldRow>
    </section>
  )
}
