import * as React from 'react'
import { Plus } from 'lucide-react'
import { EmptyState, IssueText, Panel } from '@/components/shared'
import { SchemaCombobox } from '@/components/schema-editor'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { HTTP_STATUS_CODES, getCategoryLabel, type HttpStatusCode } from '@/lib/openapi/http-status-codes'
import { useActions } from '@/lib/openapi/selectors'
import { useEditorStore } from '@/lib/openapi/store'
import { generateId, type NodeId, type ResponseDef } from '@/lib/openapi/types'
import { cn } from '@/lib/utils'
import {
  ColumnHeader,
  RowDeleteButton,
  RowHeader,
  StackedLabel,
  cellInputClassName,
  rowClassName,
  useFocusWhen,
} from './row-parts'
import { fieldIssues, issueField, useIssuesFor, type RouteIssue } from './route-issues'
import { fromPick, toPick } from './schema-pick'

const columns = cn(
  '[grid-template-areas:"code_desc_act"_"body_body_body"] grid-cols-[3.25rem_minmax(0,1fr)_1.5rem]',
  '@[40rem]:[grid-template-areas:"code_desc_body_act"] @[40rem]:grid-cols-[3.25rem_minmax(0,1.4fr)_minmax(0,1fr)_1.5rem]',
)

/** Numeric codes in order, then ranges (`4XX`), then `default`. */
function codeRank(code: string): number {
  if (code === 'default') return 1000
  const numeric = Number(code.replace(/x/gi, '0'))
  return Number.isFinite(numeric) ? numeric + (/x/i.test(code) ? 0.5 : 0) : 999
}

export function sortStatusCodes(codes: Iterable<string>): string[] {
  return [...codes].toSorted((a, b) => codeRank(a) - codeRank(b) || (a < b ? -1 : 1))
}

const CUSTOM_CODE = /^([1-5]\d\d|[1-5]XX|default)$/

const CATEGORIES = [...new Set(HTTP_STATUS_CODES.map((status) => status.category))]
const CODES_BY_CATEGORY = new Map<HttpStatusCode['category'], HttpStatusCode[]>(
  CATEGORIES.map((category) => [category, HTTP_STATUS_CODES.filter((status) => status.category === category)]),
)

function defaultDescription(code: string): string {
  const known = HTTP_STATUS_CODES.find((status) => status.value === code)
  if (known) return known.label.slice(code.length + 1)
  return code === 'default' ? 'Unexpected error' : 'Response'
}

const EMPTY_RESPONSES = new Map<string, ResponseDef>()

export function ResponsesPanel({ routeId }: { routeId: NodeId }) {
  const responses = useEditorStore((s) => s.document.routes.get(routeId)?.responses) ?? EMPTY_RESPONSES
  const { addResponse, updateResponse, deleteResponse } = useActions()
  const [focusCode, setFocusCode] = React.useState<string | null>(null)
  const issues = useIssuesFor(routeId)
  const panelIssues = fieldIssues(issues, 'responses')

  const codes = React.useMemo(() => sortStatusCodes(responses.keys()), [responses])

  const add = (code: string) => {
    addResponse(routeId, code, { id: generateId(), description: defaultDescription(code) })
    setFocusCode(code)
  }
  const update = React.useCallback(
    (code: string, updates: Partial<ResponseDef>) => updateResponse(routeId, code, updates),
    [routeId, updateResponse],
  )
  const remove = React.useCallback((code: string) => deleteResponse(routeId, code), [routeId, deleteResponse])

  return (
    <Panel
      id="responses"
      title="Responses"
      count={codes.length}
      flush
      actions={<AddResponseButton existing={responses} onAdd={add} />}
    >
      {panelIssues.length > 0 && (
        <IssueText issues={panelIssues} id={`${routeId}-responses-issues`} className="mt-0 border-b border-border px-4 py-2.5" />
      )}
      {codes.length === 0 ? (
        <EmptyState size="panel" title="No responses." description="Every operation needs at least one response." />
      ) : (
        <div role="table" aria-label="Responses" className="text-[13px]">
          <RowHeader className={columns}>
            <ColumnHeader className="[grid-area:code]">Code</ColumnHeader>
            <ColumnHeader className="[grid-area:desc]">Description</ColumnHeader>
            <ColumnHeader className="[grid-area:body]">Body</ColumnHeader>
            <ColumnHeader className="[grid-area:act]">
              <span className="sr-only">Actions</span>
            </ColumnHeader>
          </RowHeader>
          <div role="rowgroup">
            {codes.map((code) => (
              <ResponseRow
                key={code}
                code={code}
                response={responses.get(code)!}
                focusDescription={code === focusCode}
                issues={fieldIssues(issues, issueField.response(code))}
                onUpdate={update}
                onDelete={remove}
              />
            ))}
          </div>
        </div>
      )}
    </Panel>
  )
}

function AddResponseButton({
  existing,
  onAdd,
}: {
  existing: ReadonlyMap<string, ResponseDef>
  onAdd: (code: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const custom = query.trim().toUpperCase().replace('DEFAULT', 'default')
  const offerCustom =
    CUSTOM_CODE.test(custom) && !existing.has(custom) && !HTTP_STATUS_CODES.some((status) => status.value === custom)

  const pick = (code: string) => {
    onAdd(code)
    setOpen(false)
    setQuery('')
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}
    >
      <PopoverTrigger render={<Button variant="ghost" size="xs" />}>
        <Plus aria-hidden />
        Add response
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-0 p-0">
        <Command>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search status codes"
            aria-label="Search status codes"
          />
          <CommandList label="Status codes">
            <CommandEmpty>No status code matches. Type a code like 299, 4XX or default.</CommandEmpty>
            {offerCustom && (
              <CommandGroup>
                <CommandItem value={`custom ${custom}`} onSelect={() => pick(custom)}>
                  <span className="font-mono text-[12px] text-foreground">{custom}</span>
                  <span>Add this code</span>
                </CommandItem>
              </CommandGroup>
            )}
            {CATEGORIES.map((category) => {
              const available = CODES_BY_CATEGORY.get(category)!.filter((status) => !existing.has(status.value))
              if (available.length === 0) return null
              return (
                <CommandGroup key={category} heading={getCategoryLabel(category)}>
                  {available.map((status) => (
                    <CommandItem key={status.value} value={status.label} onSelect={() => pick(status.value)}>
                      <span className="w-7 shrink-0 font-mono text-[12px] text-foreground">{status.value}</span>
                      <span className="truncate">{status.label.slice(status.value.length + 1)}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

type ResponseRowProps = {
  code: string
  response: ResponseDef
  /** Focus the description input (the row was just added). */
  focusDescription: boolean
  issues: readonly RouteIssue[]
  onUpdate: (code: string, updates: Partial<ResponseDef>) => void
  onDelete: (code: string) => void
}

const ResponseRow = React.memo(function ResponseRow({
  code,
  response,
  focusDescription,
  issues,
  onUpdate,
  onDelete,
}: ResponseRowProps) {
  const types = response.content ? [...response.content.keys()] : []
  const firstType = types[0]
  const media = firstType ? response.content!.get(firstType) : undefined
  const pick = toPick(media?.schema)
  const descriptionRef = useFocusWhen<HTMLInputElement>(focusDescription)
  const { sealHistory } = useActions()

  return (
    <div
      id={`response-${code}`}
      role="row"
      aria-label={code}
      className={cn(rowClassName, columns)}
    >
      <div role="cell" className="font-mono text-[12.5px] font-medium [grid-area:code]">
        {code}
      </div>
      <div role="cell" className="min-w-0 [grid-area:desc]">
        <Input
          aria-label="Description"
          value={response.description}
          placeholder="Description"
          ref={descriptionRef}
          onChange={(event) => onUpdate(code, { description: event.target.value })}
          onBlur={sealHistory}
          className={cellInputClassName}
        />
      </div>
      <div role="cell" className="flex min-w-0 flex-col gap-1 [grid-area:body]">
        <StackedLabel>Body</StackedLabel>
        <SchemaCombobox
          value={pick}
          onChange={(next) => {
            const schema = fromPick(next, media?.schema)
            if (!schema) {
              onUpdate(code, { content: undefined })
              return
            }
            const content = new Map(response.content)
            content.set(firstType ?? 'application/json', { ...media, schema })
            onUpdate(code, { content })
          }}
          allowNone="No body"
          allowInline={pick.kind === 'inline' ? 'Inline schema' : undefined}
          size="sm"
          aria-label={`Body for ${code}`}
          invalid={issues.length > 0}
          aria-describedby={issues.length > 0 ? `response-${code}-issues` : undefined}
          className="w-full"
        />
        {firstType && (types.length > 1 || firstType !== 'application/json') && (
          <span className="truncate font-mono text-[11px] text-subtle-foreground">
            {firstType}
            {types.length > 1 && ` +${types.length - 1} more`}
          </span>
        )}
      </div>
      <div role="cell" className="flex justify-end [grid-area:act]">
        <RowDeleteButton label={`Delete response ${code}`} onClick={() => onDelete(code)} />
      </div>
      {issues.length > 0 && (
        <div className="col-span-full">
          <IssueText issues={issues} id={`response-${code}-issues`} className="mt-0" />
        </div>
      )}
    </div>
  )
})
