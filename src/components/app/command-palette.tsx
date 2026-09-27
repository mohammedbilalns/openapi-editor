import * as React from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  CircleAlert,
  Download,
  FilePlus2,
  Import,
  Monitor,
  Moon,
  PanelRight,
  Plus,
  Settings2,
  Sun,
} from 'lucide-react'
import { Kbd, MethodBadge, SchemaTypeIcon } from '@/components/shared'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { useTheme } from '@/hooks/use-theme'
import { METHOD_ORDER, useSchemaOptions } from '@/lib/openapi/selectors'
import { useEditorStore } from '@/lib/openapi/store'
import type { Route } from '@/lib/openapi/types'
import { SETTINGS_SECTIONS, SETTINGS_SECTION_LABELS } from '@/lib/settings-sections'
import { exportDocument, useStartNewDocument } from './document-actions'
import { showInspector, toggleInspector } from './inspector-controls'
import { shell, useShellState } from './shell-state'
import { INSPECTOR_KEYS } from './shortcuts'

/** Results per group; typing narrows further (BLUEPRINT §5.3). */
const GROUP_CAP = 50

function matches(haystack: string, terms: string[]): boolean {
  const text = haystack.toLowerCase()
  return terms.every((term) => text.includes(term))
}

export function CommandPalette() {
  const open = useShellState((s) => s.paletteOpen)
  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => useShellState.setState({ paletteOpen: next })}
      title="Command palette"
      description="Jump to a route, schema or setting, or run an action."
      className="sm:max-w-xl"
    >
      <PaletteContent />
    </CommandDialog>
  )
}

const closePalette = () => useShellState.setState({ paletteOpen: false })

const run = (action: () => void) => () => {
  closePalette()
  action()
}

function PaletteContent() {
  const [search, setSearch] = React.useState('')
  const [selected, setSelected] = React.useState('')
  const deferred = React.useDeferredValue(search)
  const terms = React.useMemo(() => deferred.trim().toLowerCase().split(/\s+/).filter(Boolean), [deferred])
  const navigate = useNavigate()
  const { setTheme } = useTheme()
  const startNewDocument = useStartNewDocument()
  const routes = useEditorStore((s) => s.document.routes)
  const schemas = useSchemaOptions()


  const sortedRoutes = React.useMemo(
    () =>
      [...routes.values()].toSorted(
        (a, b) => a.path.localeCompare(b.path) || METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method),
      ),
    [routes],
  )
  const routeResults = React.useMemo(() => {
    const out: Route[] = []
    for (const route of sortedRoutes) {
      const haystack = `${route.method} ${route.path} ${route.summary ?? ''} ${route.operationId ?? ''} ${route.tags.join(' ')}`
      if (terms.length === 0 || matches(haystack, terms)) out.push(route)
      if (out.length >= GROUP_CAP) break
    }
    return out
  }, [sortedRoutes, terms])
  const schemaResults = React.useMemo(
    () => schemas.filter((s) => terms.length === 0 || matches(`${s.name} ${s.type}`, terms)).slice(0, GROUP_CAP),
    [schemas, terms],
  )

  const actions = [
    { id: 'new-route', label: 'New route', icon: Plus, perform: shell.newRoute },
    { id: 'new-schema', label: 'New schema', icon: Plus, perform: shell.newSchema },
    { id: 'import', label: 'Import a spec…', icon: Import, perform: shell.importSpec },
    { id: 'export', label: 'Export YAML', icon: Download, perform: exportDocument },
    { id: 'inspector', label: 'Toggle inspector', icon: PanelRight, perform: toggleInspector, keys: INSPECTOR_KEYS },
    { id: 'problems', label: 'Show problems', icon: CircleAlert, perform: () => showInspector('problems') },
    { id: 'theme-light', label: 'Theme: light', icon: Sun, perform: () => setTheme('light') },
    { id: 'theme-dark', label: 'Theme: dark', icon: Moon, perform: () => setTheme('dark') },
    { id: 'theme-system', label: 'Theme: system', icon: Monitor, perform: () => setTheme('system') },
    { id: 'new-document', label: 'Start a new document…', icon: FilePlus2, perform: () => void startNewDocument() },
  ].filter((action) => terms.length === 0 || matches(action.label, terms))

  const settings = SETTINGS_SECTIONS.filter(
    (section) => terms.length === 0 || matches(`settings ${SETTINGS_SECTION_LABELS[section]}`, terms),
  )

  // cmdk only re-selects the first item when it filters; we filter ourselves, so keep the
  // highlight on a visible item (the first one after the results change).
  const values = [
    ...routeResults.map((r) => `route:${r.id}`),
    ...schemaResults.map((s) => `schema:${s.id}`),
    ...settings.map((s) => `settings:${s}`),
    ...actions.map((a) => `action:${a.id}`),
  ]
  const highlighted = values.includes(selected) ? selected : (values[0] ?? '')

  return (
    <Command shouldFilter={false} loop value={highlighted} onValueChange={setSelected}>
      <CommandInput
        value={search}
        onValueChange={(next) => {
          setSearch(next)
          setSelected('')
        }} placeholder="Jump to a route, schema or action…" />
      <CommandList className="max-h-[min(24rem,60svh)]">
        <CommandEmpty>No matches.</CommandEmpty>
        {routeResults.length > 0 && (
          <CommandGroup heading="Routes">
            {routeResults.map((route) => (
              <CommandItem
                key={route.id}
                value={`route:${route.id}`}
                onSelect={run(() => void navigate({ to: '/routes/$routeId', params: { routeId: route.id } }))}
              >
                <MethodBadge method={route.method} />
                <span className="truncate font-mono text-[12.5px] text-foreground">{route.path || '/'}</span>
                {route.summary && <span className="truncate text-muted-foreground">{route.summary}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {schemaResults.length > 0 && (
          <CommandGroup heading="Schemas">
            {schemaResults.map((schema) => (
              <CommandItem
                key={schema.id}
                value={`schema:${schema.id}`}
                onSelect={run(() => void navigate({ to: '/schemas/$schemaId', params: { schemaId: schema.id } }))}
              >
                <SchemaTypeIcon type={schema.type} />
                <span className="truncate font-mono text-[12.5px] text-foreground">{schema.name || 'Unnamed schema'}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {settings.length > 0 && (
          <CommandGroup heading="Settings">
            {settings.map((section) => (
              <CommandItem
                key={section}
                value={`settings:${section}`}
                onSelect={run(() => void navigate({ to: '/settings/$section', params: { section } }))}
              >
                <Settings2 />
                {SETTINGS_SECTION_LABELS[section]}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {actions.length > 0 && (
          <CommandGroup heading="Actions">
            {actions.map((action) => (
              <CommandItem key={action.id} value={`action:${action.id}`} onSelect={run(action.perform)}>
                <action.icon />
                {action.label}
                {action.keys && <Kbd keys={action.keys} className="ml-auto" />}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  )
}
