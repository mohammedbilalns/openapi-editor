import * as React from 'react'
import { Combine, Split } from 'lucide-react'
import { EmptyState, FieldRow, IssueText, Panel, PanelAddRow } from '@/components/shared'
import { Input } from '@/components/ui/input'
import { useActions } from '@/lib/openapi/selectors'
import type { NodeId, SchemaNode, SchemaOrRef } from '@/lib/openapi/types'
import { cn } from '@/lib/utils'
import { RowIconButton, rowActionClassName } from './row-parts'
import { SchemaCombobox } from './schema-combobox'
import { fieldIssues, issueProps, type Issue } from './schema-issues'
import { schemaOrRefFromPick, schemaPickFrom, type SchemaPick } from './schema-pick'

const EMPTY_VARIANTS: readonly SchemaOrRef[] = []

const COPY: Record<'oneOf' | 'anyOf' | 'allOf', string> = {
  oneOf: 'A value matches exactly one of these.',
  anyOf: 'A value matches one or more of these.',
  allOf: 'A value matches all of these combined.',
}

/** Composition "Variants": one picker per variant, "+ Add variant", and the discriminator for oneOf. */
export function VariantsPanel({ schema, issues }: { schema: SchemaNode; issues: readonly Issue[] }) {
  const { updateSchema } = useActions()
  const [adding, setAdding] = React.useState(false)
  const variants = schema.variants ?? EMPTY_VARIANTS
  const schemaId = schema.id
  const type = schema.type as 'oneOf' | 'anyOf' | 'allOf'

  const setVariants = (next: SchemaOrRef[]) => updateSchema(schemaId, { variants: next })

  /** Each row can't pick the schema itself or a schema another row already uses. */
  const usedRefs = React.useMemo(
    () => variants.flatMap((variant) => (variant.kind === 'ref' ? [variant.targetId] : [])),
    [variants],
  )

  const panelIssues = fieldIssues(issues, 'variants')

  return (
    <div className="flex flex-col gap-4">
      <Panel
        id="variants"
        title="Variants"
        icon={Combine}
        count={variants.length}
        note={<span className="hidden @[32rem]:inline">{COPY[type]}</span>}
        flush
        footer={<PanelAddRow label="Add variant" onClick={() => setAdding(true)} disabled={adding} />}
      >
        {variants.length === 0 && !adding ? (
          <EmptyState size="panel" title="No variants yet." description="Add the schemas this one combines." />
        ) : (
          <ol className="divide-y divide-border/70">
            {variants.map((variant, index) => (
              <VariantRow
                // Variants have no identity of their own; a row is its position.
                // oxlint-disable-next-line react/no-array-index-key
                key={index}
                index={index}
                variant={variant}
                excludeIds={[schemaId, ...usedRefs.filter((id) => variant.kind !== 'ref' || id !== variant.targetId)]}
                onChange={(pick) => {
                  const next = schemaOrRefFromPick(pick, variant)
                  if (next) setVariants(variants.map((v, i) => (i === index ? next : v)))
                }}
                onRemove={() => setVariants(variants.filter((_, i) => i !== index))}
              />
            ))}
            {adding && (
              <VariantRow
                index={variants.length}
                excludeIds={[schemaId, ...usedRefs]}
                onChange={(pick) => {
                  const next = schemaOrRefFromPick(pick)
                  if (next) setVariants([...variants, next])
                  setAdding(false)
                }}
                onRemove={() => setAdding(false)}
                onClosed={() => setAdding(false)}
              />
            )}
          </ol>
        )}
        <IssueText issues={panelIssues} id={`${schemaId}-variants-issues`} className="mx-4 mb-3" />
      </Panel>
      {type === 'oneOf' && <DiscriminatorPanel schema={schema} issues={issues} />}
    </div>
  )
}

function VariantRow({
  index,
  variant,
  excludeIds,
  onChange,
  onRemove,
  onClosed,
}: {
  index: number
  /** Missing for the row being added: its picker opens right away. */
  variant?: SchemaOrRef
  excludeIds: NodeId[]
  onChange: (pick: SchemaPick) => void
  onRemove: () => void
  onClosed?: () => void
}) {
  const label = `Variant ${index + 1}`
  return (
    <li className="group/row flex items-center gap-2 px-4 py-1.5 transition-colors hover:bg-muted/40">
      <span className="w-5 shrink-0 font-mono text-[11px] text-subtle-foreground tabular-nums">{index + 1}</span>
      <SchemaCombobox
        aria-label={label}
        size="sm"
        value={schemaPickFrom(variant)}
        placeholder="Choose a schema"
        allowInline={variant?.kind === 'inline' ? 'Inline schema' : undefined}
        excludeIds={excludeIds}
        onChange={onChange}
        defaultOpen={!variant}
        onOpenChange={onClosed ? (open) => !open && onClosed() : undefined}
        className="max-w-sm flex-1"
      />
      <RowIconButton
        label={variant ? `Remove variant ${index + 1}` : 'Cancel adding a variant'}
        icon="remove"
        onClick={onRemove}
        className={cn('ml-auto', variant && rowActionClassName)}
      />
    </li>
  )
}

function DiscriminatorPanel({ schema, issues }: { schema: SchemaNode; issues: readonly Issue[] }) {
  const { updateSchema, sealHistory } = useActions()
  const id = React.useId()
  const discriminator = schema.discriminator
  return (
    <Panel title="Discriminator" icon={Split}>
      <FieldRow
        label="Property"
        htmlFor={id}
        hint="The field whose value says which variant a payload is."
        issues={fieldIssues(issues, 'discriminator')}
      >
        <Input
          id={id}
          value={discriminator?.propertyName ?? ''}
          placeholder="e.g. petType"
          spellCheck={false}
          autoComplete="off"
          {...issueProps(issues, 'discriminator', id)}
          onBlur={sealHistory}
          onChange={(event) => {
            const propertyName = event.target.value
            // An emptied name keeps an imported mapping (the serializer skips a nameless discriminator).
            const keep = propertyName !== '' || discriminator?.mapping !== undefined
            updateSchema(schema.id, { discriminator: keep ? { ...discriminator, propertyName } : undefined })
          }}
          className="font-mono text-[12.5px]"
        />
      </FieldRow>
    </Panel>
  )
}
