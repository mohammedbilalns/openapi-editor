import * as React from 'react'
import { FieldRow, SchemaTypeIcon } from '@/components/shared'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useActions, useSchemaOptions, type SchemaOption } from '@/lib/openapi/selectors'
import { createSchema, type NodeId, type SchemaType } from '@/lib/openapi/types'
import { SCHEMA_TYPES } from './schema-model'

export type NewSchemaDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (id: NodeId) => void
}

function nameProblem(name: string, options: readonly SchemaOption[]): string | null {
  const trimmed = name.trim()
  if (!trimmed) return null
  return options.some((option) => option.name === trimmed) ? `A schema named ${trimmed} already exists.` : null
}

/** New schema: a name and one of the ten types. Creates it and hands back the id. */
export function NewSchemaDialog({ open, onOpenChange, onCreated }: NewSchemaDialogProps) {
  const { addSchema } = useActions()
  const [name, setName] = React.useState('')
  const [type, setType] = React.useState<SchemaType>('object')
  const nameId = React.useId()
  const typeId = React.useId()
  const nameInput = React.useRef<HTMLInputElement>(null)

  const options = useSchemaOptions()
  const problem = nameProblem(name, options)
  const canCreate = name.trim() !== '' && !problem

  const create = (event: React.FormEvent) => {
    event.preventDefault()
    if (!canCreate) return
    const schema = createSchema(type, name.trim())
    addSchema(schema)
    onOpenChange(false)
    onCreated(schema.id)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) {
          setName('')
          setType('object')
        }
      }}
    >
      <DialogContent className="sm:max-w-md" initialFocus={nameInput}>
        <form onSubmit={create} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>New schema</DialogTitle>
            <DialogDescription>A reusable model, listed under components in the exported YAML.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <FieldRow
              label="Name"
              htmlFor={nameId}
              layout="stacked"
              issues={problem ? [{ message: problem, severity: 'error' }] : undefined}
            >
              <Input
                id={nameId}
                ref={nameInput}
                value={name}
                placeholder="Pet"
                spellCheck={false}
                autoComplete="off"
                aria-invalid={problem ? true : undefined}
                aria-describedby={problem ? `${nameId}-issues` : undefined}
                onChange={(event) => setName(event.target.value)}
                className="font-mono text-[13px]"
              />
            </FieldRow>
            <FieldRow label="Type" htmlFor={typeId} layout="stacked">
              <Select value={type} onValueChange={(value) => setType(value as SchemaType)}>
                <SelectTrigger id={typeId} className="w-full">
                  <SelectValue>
                    {(value: SchemaType) => (
                      <>
                        <SchemaTypeIcon type={value} />
                        <span className="font-mono">{value}</span>
                      </>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SCHEMA_TYPES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <SchemaTypeIcon type={option.value} />
                      <span className="font-mono">{option.label}</span>
                      <span className="ml-2 text-subtle-foreground">{option.hint}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" size="sm" />}>Cancel</DialogClose>
            <Button type="submit" size="sm" disabled={!canCreate}>
              Create schema
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
