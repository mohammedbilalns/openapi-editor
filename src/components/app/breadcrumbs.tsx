import * as React from 'react'
import { Link, useParams, useRouterState } from '@tanstack/react-router'
import { MethodBadge } from '@/components/shared'
import { useEditorStore } from '@/lib/openapi/store'
import { useInfo } from '@/lib/openapi/selectors'
import { SETTINGS_SECTION_LABELS } from '@/lib/settings-sections'
import type { HttpMethod } from '@/lib/openapi/types'
import { cn } from '@/lib/utils'

type Current =
  | { kind: 'text'; text: string }
  | { kind: 'route'; method: HttpMethod; path: string }
  | { kind: 'schema'; name: string }
  | { kind: 'missing'; text: string }

type Crumbs = { section?: { label: string; to?: '/settings' }; current: Current; title: string }

/** Where the user is, derived from the URL and the document. Shared by breadcrumbs and the phone top bar. */
export function usePageCrumbs(): Crumbs {
  const leaf = useRouterState({
    select: (s) => {
      const last = s.matches.at(-1)
      const notFound = s.matches.some((m) => m.status === 'notFound')
      return notFound ? 'not-found' : (last?.routeId ?? '')
    },
  })
  const params = useParams({ strict: false })
  const route = useEditorStore((s) => (params.routeId ? s.document.routes.get(params.routeId) : undefined))
  const schemaName = useEditorStore((s) =>
    params.schemaId ? (s.document.schemas.get(params.schemaId)?.name ?? '') : undefined,
  )

  if (leaf === 'not-found') return { current: { kind: 'text', text: 'Not found' }, title: 'Not found' }
  if (leaf === '/_app/routes/$routeId') {
    const current: Current = route
      ? { kind: 'route', method: route.method, path: route.path }
      : { kind: 'missing', text: 'Missing route' }
    const title = route ? `${route.method.toUpperCase()} ${route.path}` : 'Missing route'
    return { section: { label: 'Routes' }, current, title }
  }
  if (leaf === '/_app/schemas/$schemaId') {
    const current: Current =
      schemaName === undefined ? { kind: 'missing', text: 'Missing schema' } : { kind: 'schema', name: schemaName || 'Unnamed schema' }
    return { section: { label: 'Schemas' }, current, title: schemaName || 'Missing schema' }
  }
  if (leaf === '/_app/settings/$section' && params.section) {
    const label = SETTINGS_SECTION_LABELS[params.section]
    return { section: { label: 'Settings', to: '/settings' }, current: { kind: 'text', text: label }, title: `${label} settings` }
  }
  return { current: { kind: 'text', text: 'Overview' }, title: 'Overview' }
}

export function CurrentCrumb({ current, className }: { current: Current; className?: string }) {
  const base = cn('flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-foreground', className)
  switch (current.kind) {
    case 'route':
      return (
        <span aria-current="page" className={base}>
          <MethodBadge method={current.method} className="w-auto" />
          <span className="truncate font-mono text-[12.5px]">{current.path || '/'}</span>
        </span>
      )
    case 'schema':
      return (
        <span aria-current="page" className={cn(base, 'truncate font-mono text-[12.5px]')}>
          {current.name}
        </span>
      )
    case 'missing':
      return (
        <span aria-current="page" className={cn(base, 'text-muted-foreground')}>
          {current.text}
        </span>
      )
    case 'text':
      return (
        <span aria-current="page" className={cn(base, 'truncate')}>
          {current.text}
        </span>
      )
  }
}

const separator = (
  <li aria-hidden className="text-[13px] text-muted-foreground">
    /
  </li>
)

/** Keeps the tab title in step with the page ("GET /pets · Petstore"). Mount once. */
export function useDocumentTitleSync() {
  const info = useInfo()
  const { title } = usePageCrumbs()
  const appTitle = info.title || 'Untitled API'
  React.useEffect(() => {
    document.title = `${title} · ${appTitle}`
  }, [title, appTitle])
}

/** Top bar breadcrumb (§9.21): `Petstore / Routes / GET /pets/{petId}`. */
export function Breadcrumbs() {
  const info = useInfo()
  const { section, current } = usePageCrumbs()
  const appTitle = info.title || 'Untitled API'

  return (
    <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
      <ol className="flex min-w-0 items-center gap-1.5">
        <li className="min-w-0 shrink-[2]">
          <Link
            to="/"
            className="block truncate rounded-sm text-[13px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {appTitle}
          </Link>
        </li>
        {section && (
          <>
            {separator}
            <li className="shrink-0 text-[13px] text-muted-foreground">
              {section.to ? (
                <Link
                  to={section.to}
                  className="rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {section.label}
                </Link>
              ) : (
                section.label
              )}
            </li>
          </>
        )}
        {separator}
        <li className="flex min-w-0 shrink items-center">
          <CurrentCrumb current={current} />
        </li>
      </ol>
    </nav>
  )
}
