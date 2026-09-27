import * as React from 'react'
import { FieldRow } from '@/components/shared'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { METHOD_ORDER, useActions } from '@/lib/openapi/selectors'
import { useEditorStore } from '@/lib/openapi/store'
import { createRoute, type HttpMethod, type NodeId } from '@/lib/openapi/types'
import { normalizePath, pathParamNames, syncPathParams } from './path-params'
import { TagsCombobox } from './tags-combobox'

export type NewRouteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (id: NodeId) => void
}

/** "New route" (BLUEPRINT §3): path, method and tags; `{params}` in the path become path parameters. */
export function NewRouteDialog({ open, onOpenChange, onCreated }: NewRouteDialogProps) {
  const baseId = React.useId()
  const ids = { path: `${baseId}-path`, method: `${baseId}-method`, tags: `${baseId}-tags` }
  const [path, setPath] = React.useState('')
  const [method, setMethod] = React.useState<HttpMethod>('get')
  const [tags, setTags] = React.useState<string[]>([])
  const { addRoute } = useActions()
  const pathRef = React.useRef<HTMLInputElement>(null)

  // Each opening starts from a blank form.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setPath('')
      setMethod('get')
      setTags([])
    }
  }

  const normalized = normalizePath(path)
  const routes = useEditorStore((s) => (open ? s.document.routes : undefined))
  const duplicate = React.useMemo(() => {
    if (!routes || !normalized) return false
    for (const route of routes.values()) if (route.path === normalized && route.method === method) return true
    return false
  }, [routes, normalized, method])
  const params = pathParamNames(normalized)

  const issues = duplicate
    ? [{ severity: 'error' as const, message: `${method.toUpperCase()} ${normalized} already exists.` }]
    : undefined

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!normalized || duplicate) return
    const route = { ...createRoute(normalized, method), tags, parameters: syncPathParams([], normalized) }
    addRoute(route)
    onOpenChange(false)
    onCreated(route.id)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent initialFocus={pathRef}>
        <DialogHeader>
          <DialogTitle>New route</DialogTitle>
          <DialogDescription>Path parameters like {'{id}'} are added for you.</DialogDescription>
        </DialogHeader>
        <form id={`${baseId}-form`} onSubmit={submit} className="flex flex-col gap-4">
          <FieldRow
            layout="stacked"
            label="Path"
            htmlFor={ids.path}
            issues={issues}
            hint={
              params.length > 0 ? (
                <>
                  Adds {params.length === 1 ? 'the path parameter' : 'path parameters'}{' '}
                  <span className="font-mono text-foreground">{params.join(', ')}</span>.
                </>
              ) : undefined
            }
          >
            <Input
              id={ids.path}
              value={path}
              placeholder="/pets/{petId}"
              ref={pathRef}
              spellCheck={false}
              autoComplete="off"
              className="font-mono text-[13px]"
              aria-invalid={duplicate || undefined}
              aria-describedby={
                [duplicate ? `${ids.path}-issues` : '', params.length > 0 ? `${ids.path}-hint` : '']
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              onChange={(event) => setPath(event.target.value)}
            />
          </FieldRow>
          <FieldRow layout="stacked" label="Method" htmlFor={ids.method}>
            <Select value={method} onValueChange={(next: HttpMethod) => setMethod(next)}>
              <SelectTrigger id={ids.method} className="w-36 font-mono text-[12.5px] uppercase">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHOD_ORDER.map((option) => (
                  <SelectItem key={option} value={option} className="font-mono text-[12px] uppercase">
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow layout="stacked" label="Tags" htmlFor={ids.tags}>
            <TagsCombobox id={ids.tags} value={tags} onChange={setTags} onNavigate={() => onOpenChange(false)} />
          </FieldRow>
        </form>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form={`${baseId}-form`} size="sm" disabled={!normalized || duplicate}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
