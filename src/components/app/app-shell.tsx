// Step 0 placeholder shell: plain navigation so B, C and D can reach their screens.
// Replaced by the real AppShell (sidebar, top bar, inspector host) in the next step.
import type * as React from 'react'
import { Link } from '@tanstack/react-router'
import { MethodBadge, SchemaTypeIcon } from '@/components/shared'
import { useRouteTree, useSchemaOptions } from '@/lib/openapi/selectors'

const rowClassName =
  'flex h-7 items-center gap-2 rounded-md px-2 text-[12.5px] text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-sidebar-accent-foreground'

export function AppShell({ children }: { children: React.ReactNode }) {
  const rows = useRouteTree()
  const schemas = useSchemaOptions()
  return (
    <div className="flex min-h-svh">
      <nav aria-label="Document" className="w-60 shrink-0 overflow-y-auto border-r border-sidebar-border bg-sidebar p-2">
        <Link to="/" className={rowClassName} activeOptions={{ exact: true }}>
          Overview
        </Link>
        <Link to="/settings/$section" params={{ section: 'info' }} className={rowClassName}>
          Settings
        </Link>
        <p className="mt-4 mb-1 px-2 text-xs text-muted-foreground">Routes</p>
        {rows.map((row) =>
          row.kind === 'group' ? (
            <p key={row.key} className="mt-2 px-2 text-xs text-muted-foreground">
              {row.label}
            </p>
          ) : (
            <Link key={row.key} to="/routes/$routeId" params={{ routeId: row.id }} className={rowClassName}>
              <MethodBadge method={row.method} />
              <span className="truncate font-mono">{row.path}</span>
            </Link>
          ),
        )}
        <p className="mt-4 mb-1 px-2 text-xs text-muted-foreground">Schemas</p>
        {schemas.map((schema) => (
          <Link key={schema.id} to="/schemas/$schemaId" params={{ schemaId: schema.id }} className={rowClassName}>
            <SchemaTypeIcon type={schema.type} />
            <span className="truncate font-mono">{schema.name}</span>
          </Link>
        ))}
      </nav>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  )
}
