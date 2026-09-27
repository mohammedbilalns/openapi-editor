import * as React from 'react'
import { KeyRound } from 'lucide-react'
import { EmptyState, FieldRow, MetaChip, Panel, PanelAddRow } from '@/components/shared'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useActions, useSecuritySchemes } from '@/lib/openapi/selectors'
import { generateId, type SecurityScheme } from '@/lib/openapi/types'
import { DraftError, DraftRow, RowDeleteButton } from './row-actions'

type SchemeType = SecurityScheme['type']

const TYPE_LABELS: Record<SchemeType, string> = {
  http: 'HTTP',
  apiKey: 'API key',
  oauth2: 'OAuth 2.0',
  openIdConnect: 'OpenID Connect',
}

const TYPES = Object.keys(TYPE_LABELS) as SchemeType[]

/** A new scheme of `type` with sensible defaults (bearer, `X-API-Key` header). */
export function newScheme(name: string, type: SchemeType): SecurityScheme {
  const scheme: SecurityScheme = { id: generateId(), name, type }
  if (type === 'http') scheme.scheme = 'bearer'
  if (type === 'apiKey') {
    scheme.in = 'header'
    scheme.paramName = 'X-API-Key'
  }
  if (type === 'openIdConnect') scheme.openIdConnectUrl = ''
  if (type === 'oauth2') scheme.flows = {}
  return scheme
}

function HttpFields({ scheme }: { scheme: SecurityScheme }) {
  const { updateSecurityScheme } = useActions()
  const value = scheme.scheme || 'bearer'
  const known = value === 'bearer' || value === 'basic'
  const schemeId = `scheme-${scheme.id}-http`
  return (
    <>
      <FieldRow label="Scheme" htmlFor={schemeId}>
        <Select value={value} onValueChange={(next) => updateSecurityScheme(scheme.id, { scheme: next })}>
          <SelectTrigger id={schemeId} size="sm" className="min-w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bearer">Bearer</SelectItem>
            <SelectItem value="basic">Basic</SelectItem>
            {!known && <SelectItem value={value}>{value}</SelectItem>}
          </SelectContent>
        </Select>
      </FieldRow>
      {value === 'bearer' && (
        <FieldRow label="Bearer format" htmlFor={`scheme-${scheme.id}-format`}>
          <Input
            id={`scheme-${scheme.id}-format`}
            placeholder="JWT"
            value={scheme.bearerFormat ?? ''}
            onChange={(event) =>
              updateSecurityScheme(scheme.id, { bearerFormat: event.target.value === '' ? undefined : event.target.value })
            }
            className="h-7 text-[13px]"
          />
        </FieldRow>
      )}
    </>
  )
}

function ApiKeyFields({ scheme }: { scheme: SecurityScheme }) {
  const { updateSecurityScheme } = useActions()
  const inId = `scheme-${scheme.id}-in`
  const nameId = `scheme-${scheme.id}-param`
  return (
    <>
      <FieldRow label="In" htmlFor={inId}>
        <Select
          value={scheme.in ?? 'header'}
          onValueChange={(next) => updateSecurityScheme(scheme.id, { in: next as SecurityScheme['in'] })}
        >
          <SelectTrigger id={inId} size="sm" className="min-w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="header">Header</SelectItem>
            <SelectItem value="query">Query</SelectItem>
            <SelectItem value="cookie">Cookie</SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>
      <FieldRow label="Parameter name" htmlFor={nameId}>
        <Input
          id={nameId}
          placeholder="X-API-Key"
          value={scheme.paramName ?? ''}
          onChange={(event) => updateSecurityScheme(scheme.id, { paramName: event.target.value })}
          aria-invalid={!scheme.paramName?.trim() || undefined}
          className="h-7 font-mono text-[12.5px]"
        />
      </FieldRow>
    </>
  )
}

const SchemeRow = React.memo(function SchemeRow({ scheme }: { scheme: SecurityScheme }) {
  const { updateSecurityScheme, deleteSecurityScheme } = useActions()
  const urlId = `scheme-${scheme.id}-oidc`
  return (
    <li className="group/row flex flex-col gap-3 px-4 py-3">
      <div className="flex items-center gap-2">
        <Input
          aria-label="Scheme name"
          value={scheme.name}
          onChange={(event) => updateSecurityScheme(scheme.id, { name: event.target.value })}
          aria-invalid={!scheme.name.trim() || undefined}
          className="h-7 min-w-0 flex-1 font-mono text-[12.5px] @[40rem]:max-w-64"
        />
        {/* A fixed slot wide enough for the longest type ("OpenID Connect"), so every name input has the same width. */}
        <div className="flex w-28 shrink-0">
          <MetaChip>{TYPE_LABELS[scheme.type]}</MetaChip>
        </div>
        <RowDeleteButton
          label={`Delete ${scheme.name || 'security scheme'}`}
          onClick={() => deleteSecurityScheme(scheme.id)}
          className="ml-auto"
        />
      </div>
      {scheme.type === 'http' && <HttpFields scheme={scheme} />}
      {scheme.type === 'apiKey' && <ApiKeyFields scheme={scheme} />}
      {scheme.type === 'openIdConnect' && (
        <FieldRow label="Discovery URL" htmlFor={urlId}>
          <Input
            id={urlId}
            type="url"
            inputMode="url"
            placeholder="https://example.com/.well-known/openid-configuration"
            value={scheme.openIdConnectUrl ?? ''}
            onChange={(event) => updateSecurityScheme(scheme.id, { openIdConnectUrl: event.target.value })}
            className="h-7 font-mono text-[12.5px]"
          />
        </FieldRow>
      )}
      {scheme.type === 'oauth2' && (
        <p className="text-xs text-muted-foreground">Flows are kept from imports but not editable yet.</p>
      )}
    </li>
  )
})

function AddSchemeRow({ onClose, existing }: { onClose: () => void; existing: Set<string> }) {
  const { addSecurityScheme } = useActions()
  const [name, setName] = React.useState('')
  const [type, setType] = React.useState<SchemeType>('http')
  const trimmed = name.trim()
  const duplicate = existing.has(trimmed)
  return (
    <DraftRow
      submitLabel="Add scheme"
      canSubmit={trimmed !== '' && !duplicate}
      onCancel={onClose}
      onSubmit={() => {
        addSecurityScheme(newScheme(trimmed, type))
        onClose()
      }}
      error={<DraftError id="new-scheme-error">{duplicate ? `A scheme named ${trimmed} already exists.` : null}</DraftError>}
    >
      <Input
        // The row appears because the user asked to add a scheme.
        // oxlint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        aria-label="New scheme name"
        placeholder="bearerAuth"
        value={name}
        onChange={(event) => setName(event.target.value)}
        aria-invalid={duplicate || undefined}
        aria-describedby={duplicate ? 'new-scheme-error' : undefined}
        className="h-7 font-mono text-[12.5px] @[40rem]:flex-1"
      />
      <Select value={type} onValueChange={(next) => setType(next as SchemeType)}>
        <SelectTrigger aria-label="New scheme type" size="sm" className="min-w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TYPES.map((value) => (
            <SelectItem key={value} value={value}>
              {TYPE_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </DraftRow>
  )
}

/** `/settings/security`: security schemes (`components.securitySchemes`). */
export function SecuritySection() {
  const schemes = useSecuritySchemes()
  const [adding, setAdding] = React.useState(false)
  const list = React.useMemo(() => [...schemes.values()], [schemes])
  const names = React.useMemo(() => new Set(list.map((scheme) => scheme.name)), [list])
  return (
    <Panel title="Security schemes" icon={KeyRound} count={list.length} flush>
      {list.length === 0 && !adding ? (
        <EmptyState
          size="panel"
          title="No security schemes yet."
          description="Describe how clients authenticate: a bearer token, an API key or OpenID Connect."
        />
      ) : (
        <ul aria-label="Security schemes" className="divide-y divide-border/70">
          {list.map((scheme) => (
            <SchemeRow key={scheme.id} scheme={scheme} />
          ))}
        </ul>
      )}
      {adding ? (
        <AddSchemeRow existing={names} onClose={() => setAdding(false)} />
      ) : (
        <PanelAddRow label="Add security scheme" onClick={() => setAdding(true)} />
      )}
    </Panel>
  )
}
