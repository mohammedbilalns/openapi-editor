import * as React from 'react'
import { Brackets } from 'lucide-react'
import { FieldRow, Panel } from '@/components/shared'
import { useActions } from '@/lib/openapi/selectors'
import { createSchema, type NodeId, type SchemaOrRef } from '@/lib/openapi/types'
import { fieldIssues, issueProps, type Issue } from './schema-issues'
import { SchemaTypePicker } from './schema-type-picker'

const DEFAULT_ITEMS: SchemaOrRef = { kind: 'inline', schema: createSchema('string') }

/** Array "Items": what each element is, inline type or a named schema (not the array itself). */
export function ItemsPanel({
  schemaId,
  items,
  issues,
}: {
  schemaId: NodeId
  items: SchemaOrRef | undefined
  issues: readonly Issue[]
}) {
  const { updateSchema } = useActions()
  const id = React.useId()
  const onChange = React.useCallback((next: SchemaOrRef) => updateSchema(schemaId, { items: next }), [schemaId, updateSchema])
  const excludeIds = React.useMemo(() => [schemaId], [schemaId])
  const aria = issueProps(issues, 'items', id)
  return (
    <Panel id="items" title="Items" icon={Brackets}>
      <FieldRow label="Item type" htmlFor={id} issues={fieldIssues(issues, 'items')}>
        <SchemaTypePicker
          id={id}
          aria-label="Item type"
          value={items ?? DEFAULT_ITEMS}
          onChange={onChange}
          excludeIds={excludeIds}
          invalid={aria['aria-invalid']}
          aria-describedby={aria['aria-describedby']}
          className="max-w-sm"
        />
      </FieldRow>
    </Panel>
  )
}
