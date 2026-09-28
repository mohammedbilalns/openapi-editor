import * as React from 'react'
import { Link } from '@tanstack/react-router'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChevronRight, CircleAlert, Ellipsis, LayoutGrid, Plus, Settings2, TriangleAlert } from 'lucide-react'
import { MethodBadge, SchemaTypeIcon } from '@/components/shared'
import { useDeleteRoute } from '@/components/route-editor/use-delete-route'
import { useDeleteSchema } from '@/components/schema-editor/use-delete-schema'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useUiPrefs } from '@/hooks/use-ui-prefs'
import { useIssuesFor } from '@/lib/openapi/analysis'
import { useLiveProblemCount } from '@/components/inspector/live-issues'
import {
  useRouteCount,
  useRouteTree,
  useSchemaOptions,
  useSchemaUsage,
  type SchemaOption,
  type SidebarGroupRow,
  type SidebarRouteRow,
} from '@/lib/openapi/selectors'
import type { NodeId } from '@/lib/openapi/types'
import { cn } from '@/lib/utils'
import { showInspector } from './inspector-controls'
import { shell } from './shell-state'

/** Above this many rows the list is virtualized (BLUEPRINT §5.3). */
const VIRTUALIZE_ABOVE = 200

type TreeRow =
  | { kind: 'nav'; key: string; item: 'overview' | 'settings' | 'problems' }
  | { kind: 'section'; key: string; section: 'routes' | 'schemas'; count: number }
  | { kind: 'hint'; key: string; text: string }
  | (SidebarGroupRow & { collapsed: boolean })
  | (SidebarRouteRow & { indent: boolean })
  | { kind: 'schema'; key: string; option: SchemaOption; usage: number }

/** Fixed heights so the virtualizer never measures. */
const ROW_HEIGHT: Record<TreeRow['kind'], number> = {
  nav: 32,
  section: 44,
  hint: 28,
  group: 28,
  route: 28,
  schema: 28,
}

type Deleters = { route: (id: NodeId) => void; schema: (id: NodeId) => void }
const DeleteContext = React.createContext<Deleters | null>(null)

/** Stable delete callbacks for every row, so rows don't re-render on navigation. */
function useStableDeleters(): Deleters {
  const deleteRoute = useDeleteRoute()
  const deleteSchema = useDeleteSchema()
  const ref = React.useRef({ deleteRoute, deleteSchema })
  React.useLayoutEffect(() => {
    ref.current = { deleteRoute, deleteSchema }
  })
  return React.useMemo(
    () => ({
      route: (id) => ref.current.deleteRoute(id),
      schema: (id) => void ref.current.deleteSchema(id),
    }),
    [],
  )
}

function useTreeRows(): TreeRow[] {
  const routeRows = useRouteTree()
  const routeCount = useRouteCount()
  const schemas = useSchemaOptions()
  const usage = useSchemaUsage()
  const collapsedGroups = useUiPrefs((s) => s.collapsedGroups)

  return React.useMemo(() => {
    const rows: TreeRow[] = [
      { kind: 'nav', key: 'nav:overview', item: 'overview' },
      { kind: 'nav', key: 'nav:settings', item: 'settings' },
      { kind: 'nav', key: 'nav:problems', item: 'problems' },
      { kind: 'section', key: 'section:routes', section: 'routes', count: routeCount },
    ]
    if (routeRows.length === 0) rows.push({ kind: 'hint', key: 'hint:routes', text: 'No routes yet' })
    const collapsed = new Set(collapsedGroups)
    for (const row of routeRows) {
      if (row.kind === 'group') rows.push({ ...row, collapsed: collapsed.has(row.key) })
      else if (row.groupKey === null || !collapsed.has(row.groupKey)) rows.push({ ...row, indent: row.groupKey !== null })
    }
    rows.push({ kind: 'section', key: 'section:schemas', section: 'schemas', count: schemas.length })
    if (schemas.length === 0) rows.push({ kind: 'hint', key: 'hint:schemas', text: 'No schemas yet' })
    for (const option of schemas) {
      rows.push({ kind: 'schema', key: `schema:${option.id}`, option, usage: usage.get(option.id)?.length ?? 0 })
    }
    return rows
  }, [routeRows, routeCount, schemas, usage, collapsedGroups])
}

/**
 * The sidebar's scrolling content as one flattened list of fixed-height rows:
 * nav items, the route tree and the schema list. Virtualized above 200 rows.
 */
export function SidebarTree({ scrollElement }: { scrollElement: HTMLElement | null }) {
  const rows = useTreeRows()
  const deleters = useStableDeleters()
  const virtual = rows.length > VIRTUALIZE_ABOVE

  return (
    <DeleteContext.Provider value={deleters}>
      {virtual ? (
        <VirtualRows rows={rows} scrollElement={scrollElement} />
      ) : (
        <div>
          {rows.map((row) => (
            <Row key={row.key} row={row} />
          ))}
        </div>
      )}
    </DeleteContext.Provider>
  )
}

function VirtualRows({ rows, scrollElement }: { rows: TreeRow[]; scrollElement: HTMLElement | null }) {
  // Fixed row heights and no compiler memoization here, so the returned functions never go stale.
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElement,
    estimateSize: (index) => ROW_HEIGHT[rows[index].kind],
    getItemKey: (index) => rows[index].key,
    overscan: 16,
  })
  return (
    <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((item) => (
        <div
          key={item.key}
          className="absolute inset-x-0 top-0"
          style={{ height: item.size, transform: `translateY(${item.start}px)` }}
        >
          <Row row={rows[item.index]} />
        </div>
      ))}
    </div>
  )
}

function Row({ row }: { row: TreeRow }) {
  switch (row.kind) {
    case 'nav':
      return <NavRow item={row.item} />
    case 'section':
      return <SectionRow section={row.section} count={row.count} />
    case 'hint':
      return <p className="flex h-7 items-center px-2 text-xs text-muted-foreground">{row.text}</p>
    case 'group':
      return <GroupRow groupKey={row.key} label={row.label} count={row.count} collapsed={row.collapsed} />
    case 'route':
      return (
        <RouteRow id={row.id} method={row.method} path={row.path} deprecated={row.deprecated} indent={row.indent} />
      )
    case 'schema':
      return <SchemaRow id={row.option.id} name={row.option.name} type={row.option.type} usage={row.usage} />
  }
}

// ---------------------------------------------------------------------------
// Rows

const navItemClassName = cn(
  'flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] font-medium text-sidebar-foreground outline-none',
  'transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
  'focus-visible:ring-2 focus-visible:ring-sidebar-ring',
  'aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-sidebar-accent-foreground',
  '[&_svg]:size-4 [&_svg]:shrink-0',
)

const NavRow = React.memo(function NavRow({ item }: { item: 'overview' | 'settings' | 'problems' }) {
  if (item === 'overview') {
    return (
      <Link to="/" activeOptions={{ exact: true }} className={navItemClassName}>
        <LayoutGrid aria-hidden />
        Overview
      </Link>
    )
  }
  if (item === 'settings') {
    return (
      <Link to="/settings" className={navItemClassName}>
        <Settings2 aria-hidden />
        Settings
      </Link>
    )
  }
  return <ProblemsNavRow />
})

function ProblemsNavRow() {
  const count = useLiveProblemCount()
  return (
    <button type="button" className={cn(navItemClassName, 'cursor-pointer')} onClick={() => showInspector('problems')}>
      <CircleAlert aria-hidden />
      Problems
      {count > 0 && (
        <span className="ml-auto font-mono text-[11px] font-normal text-subtle-foreground tabular-nums">{count}</span>
      )}
    </button>
  )
}

const SectionRow = React.memo(function SectionRow({ section, count }: { section: 'routes' | 'schemas'; count: number }) {
  const label = section === 'routes' ? 'Routes' : 'Schemas'
  return (
    <div className="flex h-11 items-end pb-1">
      <div className="flex h-6 w-full items-center gap-2 pr-0.5 pl-2">
        <h2 className="text-xs text-muted-foreground">{label}</h2>
        <span className="ml-auto font-mono text-[11px] text-subtle-foreground tabular-nums">{count}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={section === 'routes' ? 'New route' : 'New schema'}
          onClick={section === 'routes' ? shell.newRoute : shell.newSchema}
        >
          <Plus />
        </Button>
      </div>
    </div>
  )
})

const GroupRow = React.memo(function GroupRow({
  groupKey,
  label,
  count,
  collapsed,
}: {
  groupKey: string
  label: string
  count: number
  collapsed: boolean
}) {
  const toggleGroup = useUiPrefs((s) => s.toggleGroup)
  return (
    <button
      type="button"
      aria-expanded={!collapsed}
      onClick={() => toggleGroup(groupKey)}
      className={cn(
        'flex h-7 w-full cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12.5px] text-sidebar-foreground outline-none',
        'transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        'focus-visible:ring-2 focus-visible:ring-sidebar-ring',
      )}
    >
      <ChevronRight
        aria-hidden
        className={cn(
          'size-3 shrink-0 text-muted-foreground transition-transform duration-150',
          !collapsed && 'rotate-90',
        )}
      />
      <span className="truncate">{label}</span>
      <span className="ml-auto font-mono text-[11px] text-subtle-foreground tabular-nums">{count}</span>
    </button>
  )
})

const rowLinkClassName = cn(
  'flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 text-[12.5px] text-sidebar-foreground outline-none',
  'transition-colors duration-150 group-hover/row:bg-sidebar-accent group-hover/row:text-sidebar-accent-foreground',
  'focus-visible:ring-2 focus-visible:ring-sidebar-ring',
  'aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-sidebar-accent-foreground',
  // Touch: the row menu is always visible, so leave room for it.
  'pointer-coarse:pr-8',
)

function IssueMarker({ id }: { id: NodeId }) {
  const issues = useIssuesFor(id)
  const severity = issues.some((i) => i.severity === 'error')
    ? 'error'
    : issues.some((i) => i.severity === 'warning')
      ? 'warning'
      : undefined
  if (!severity) return null
  const Icon = severity === 'error' ? CircleAlert : TriangleAlert
  return (
    <>
      <Icon
        aria-hidden
        className={cn(
          'size-3 shrink-0',
          severity === 'error' ? 'text-destructive-foreground' : 'text-warning-foreground',
        )}
      />
      <span className="sr-only">{severity === 'error' ? ', has errors' : ', has warnings'}</span>
    </>
  )
}

function RowMenu({ label, onDelete, deleteLabel }: { label: string; onDelete: () => void; deleteLabel: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Actions for ${label}`}
            className={cn(
              'absolute top-0.5 right-0.5 opacity-0 transition-opacity',
              'group-hover/row:opacity-100 group-focus-within/row:opacity-100 pointer-coarse:opacity-100 data-popup-open:opacity-100',
              'hover:bg-sidebar-accent',
            )}
          />
        }
      >
        <Ellipsis />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          {deleteLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Trailing slot: hidden while the row's `…` menu is visible. */
const trailingClassName =
  'ml-auto flex shrink-0 items-center gap-1.5 pl-1 transition-opacity pointer-fine:group-hover/row:opacity-0 pointer-fine:group-focus-within/row:opacity-0'

const RouteRow = React.memo(function RouteRow({
  id,
  method,
  path,
  deprecated,
  indent,
}: {
  id: NodeId
  method: SidebarRouteRow['method']
  path: string
  deprecated: boolean
  indent: boolean
}) {
  const deleters = React.useContext(DeleteContext)
  const label = `${method.toUpperCase()} ${path}`
  return (
    <div className="group/row relative">
      <Link to="/routes/$routeId" params={{ routeId: id }} className={cn(rowLinkClassName, indent && 'pl-6')}>
        <MethodBadge method={method} />
        <span
          className={cn(
            'min-w-0 truncate font-mono text-[12px]',
            deprecated && 'text-muted-foreground line-through',
          )}
        >
          {path || '/'}
        </span>
        {deprecated && <span className="sr-only">, deprecated</span>}
        <span className={trailingClassName}>
          <IssueMarker id={id} />
        </span>
      </Link>
      <RowMenu label={label} deleteLabel="Delete route" onDelete={() => deleters?.route(id)} />
    </div>
  )
})

const SchemaRow = React.memo(function SchemaRow({
  id,
  name,
  type,
  usage,
}: {
  id: NodeId
  name: string
  type: SchemaOption['type']
  usage: number
}) {
  const deleters = React.useContext(DeleteContext)
  return (
    <div className="group/row relative">
      <Link to="/schemas/$schemaId" params={{ schemaId: id }} className={rowLinkClassName}>
        <SchemaTypeIcon type={type} />
        <span className="min-w-0 truncate font-mono text-[12px]">{name || 'Unnamed schema'}</span>
        <span className={trailingClassName}>
          <IssueMarker id={id} />
          {usage > 0 && (
            <span className="font-mono text-[11px] text-subtle-foreground tabular-nums">
              {usage}
              <span className="sr-only"> {usage === 1 ? 'reference' : 'references'}</span>
            </span>
          )}
        </span>
      </Link>
      <RowMenu label={name || 'Unnamed schema'} deleteLabel="Delete schema" onDelete={() => deleters?.schema(id)} />
    </div>
  )
})
