import * as React from 'react'
import { Tag as TagIcon } from 'lucide-react'
import { EmptyState, IssueText, Panel, PanelAddRow, confirm } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getActions, useActions, useTags } from '@/lib/openapi/selectors'
import { useEditorStore } from '@/lib/openapi/store'
import type { NodeId, Route, Tag } from '@/lib/openapi/types'
import { cn } from '@/lib/utils'
import { DraftError, DraftRow, RowDeleteButton } from './row-actions'

let usageCache: { routes: Map<NodeId, Route>; usage: Map<string, number> } | null = null

/** Routes per tag name, one pass per routes-map change. */
export function tagUsage(routes: Map<NodeId, Route>): Map<string, number> {
  if (usageCache?.routes === routes) return usageCache.usage
  const usage = new Map<string, number>()
  for (const route of routes.values()) {
    for (const tag of new Set(route.tags)) usage.set(tag, (usage.get(tag) ?? 0) + 1)
  }
  usageCache = { routes, usage }
  return usage
}

const useTagUsage = () => useEditorStore((s) => tagUsage(s.document.routes))

function routesLabel(count: number): string {
  return count === 1 ? '1 route uses' : `${count} routes use`
}

/** Deletes a tag, confirming first when routes use it ("4 routes use pets. The tag is removed from them."). */
export async function deleteTagWithConfirm(name: string): Promise<boolean> {
  const used = tagUsage(useEditorStore.getState().document.routes).get(name) ?? 0
  if (used > 0) {
    const confirmed = await confirm({
      title: `Delete ${name}?`,
      description: `${routesLabel(used)} ${name}. The tag is removed from ${used === 1 ? 'it' : 'them'}.`,
      confirmLabel: 'Delete tag',
      destructive: true,
    })
    if (!confirmed) return false
  }
  getActions().deleteTag(name)
  return true
}

const cellClassName = 'h-10 px-4 align-middle @max-[40rem]:h-auto @max-[40rem]:w-auto @max-[40rem]:p-0'

function TagRow({ tag, count, names }: { tag: Tag; count: number; names: Set<string> }) {
  const actions = useActions()
  // `null` while not renaming, so the input follows the stored name (undo, imports).
  const [editing, setDraft] = React.useState<string | null>(null)
  const draft = editing ?? tag.name
  const trimmed = draft.trim()
  const error =
    trimmed === '' ? 'A tag needs a name.' : trimmed !== tag.name && names.has(trimmed) ? `${trimmed} already exists.` : null
  const nameId = `tag-${tag.name}-name`

  const commit = () => {
    setDraft(null)
    if (error || trimmed === tag.name) return
    actions.updateTag(tag.name, { name: trimmed })
  }

  return (
    <tr
      className={cn(
        'group/row border-b border-border/70 transition-colors duration-150 last:border-0 hover:bg-muted/40',
        '@max-[40rem]:grid @max-[40rem]:grid-cols-[minmax(0,1fr)_auto_auto] @max-[40rem]:items-center @max-[40rem]:gap-x-2 @max-[40rem]:gap-y-1.5 @max-[40rem]:px-4 @max-[40rem]:py-2.5',
      )}
    >
      <td className={cn(cellClassName, 'w-[34%]')}>
        <Input
          id={nameId}
          aria-label="Tag name"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') {
              setDraft(null)
              event.currentTarget.blur()
            }
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${nameId}-issues` : undefined}
          className="h-7 font-mono text-[12.5px]"
        />
        <IssueText id={`${nameId}-issues`} issues={error ? [{ message: error, severity: 'error' }] : undefined} />
      </td>
      <td className={cn(cellClassName, '@max-[40rem]:col-span-3 @max-[40rem]:row-start-2')}>
        <Input
          aria-label={`Description of ${tag.name}`}
          placeholder="Description"
          value={tag.description ?? ''}
          onChange={(event) =>
            actions.updateTag(tag.name, { description: event.target.value === '' ? undefined : event.target.value })
          }
          className="h-7 text-[13px] @[40rem]:placeholder:text-transparent @[40rem]:focus:placeholder:text-muted-foreground"
        />
      </td>
      <td className={cn(cellClassName, 'w-20 text-right font-mono text-[12.5px] text-muted-foreground tabular-nums')}>
        <span className="sr-only">Used by </span>
        {count}
        <span className="sr-only"> {count === 1 ? 'route' : 'routes'}</span>
      </td>
      <td className={cn(cellClassName, 'w-12 pr-2 pl-0 text-right')}>
        <RowDeleteButton label={`Delete tag ${tag.name}`} onClick={() => void deleteTagWithConfirm(tag.name)} />
      </td>
    </tr>
  )
}

function AddTagRow({ names, onClose }: { names: Set<string>; onClose: () => void }) {
  const { addTag } = useActions()
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const trimmed = name.trim()
  const duplicate = names.has(trimmed)
  return (
    <DraftRow
      submitLabel="Add tag"
      canSubmit={trimmed !== '' && !duplicate}
      onCancel={onClose}
      onSubmit={() => {
        addTag({ name: trimmed, description: description.trim() || undefined })
        onClose()
      }}
      error={<DraftError id="new-tag-error">{duplicate ? `${trimmed} already exists.` : null}</DraftError>}
    >
      <Input
        // The row appears because the user asked to add a tag.
        // oxlint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        aria-label="New tag name"
        placeholder="pets"
        value={name}
        onChange={(event) => setName(event.target.value)}
        aria-invalid={duplicate || undefined}
        aria-describedby={duplicate ? 'new-tag-error' : undefined}
        className="h-7 font-mono text-[12.5px] @[40rem]:flex-1"
      />
      <Input
        aria-label="New tag description"
        placeholder="Everything about your pets"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        className="h-7 text-[13px] @[40rem]:flex-[2]"
      />
    </DraftRow>
  )
}

/** `/settings/tags`: tag definitions, with how many routes use each. */
export function TagsSection() {
  const tags = useTags()
  const usage = useTagUsage()
  const { addTag } = useActions()
  const [adding, setAdding] = React.useState(false)
  const names = React.useMemo(() => new Set(tags.map((tag) => tag.name)), [tags])
  const undefinedTags = React.useMemo(() => [...usage.keys()].filter((name) => !names.has(name)), [usage, names])

  return (
    <Panel
      title="Tags"
      icon={TagIcon}
      count={tags.length}
      flush
      footer={
        undefinedTags.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              Routes also use {undefinedTags.length === 1 ? 'a tag' : `${undefinedTags.length} tags`} that{' '}
              {undefinedTags.length === 1 ? "isn't" : "aren't"} defined here:{' '}
              <span className="font-mono text-foreground">{undefinedTags.join(', ')}</span>.
            </span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                for (const name of undefinedTags) addTag({ name })
              }}
            >
              Define {undefinedTags.length === 1 ? 'it' : 'them'}
            </Button>
          </div>
        ) : undefined
      }
    >
      {tags.length === 0 && !adding ? (
        <EmptyState
          size="panel"
          title="No tags yet."
          description="Tags group routes in the sidebar and in generated docs."
        />
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead className="@max-[40rem]:sr-only">
              <tr>
                <th scope="col" className="h-9 border-b border-border px-4 text-left text-xs font-medium text-muted-foreground">
                  Name
                </th>
                <th scope="col" className="h-9 border-b border-border px-4 text-left text-xs font-medium text-muted-foreground">
                  Description
                </th>
                <th scope="col" className="h-9 border-b border-border px-4 text-right text-xs font-medium text-muted-foreground">
                  Routes
                </th>
                <th scope="col" className="h-9 border-b border-border">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="@max-[40rem]:block">
              {tags.map((tag) => (
                <TagRow key={tag.name} tag={tag} count={usage.get(tag.name) ?? 0} names={names} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {adding ? (
        <AddTagRow names={names} onClose={() => setAdding(false)} />
      ) : (
        <PanelAddRow label="Add tag" onClick={() => setAdding(true)} />
      )}
    </Panel>
  )
}
