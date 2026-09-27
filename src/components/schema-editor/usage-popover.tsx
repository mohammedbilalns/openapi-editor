import { Link } from '@tanstack/react-router'
import { Link2 } from 'lucide-react'
import { MetaChip, metaChipClassName, MethodBadge, SchemaTypeIcon } from '@/components/shared'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useSchemaUsage, type SchemaReferrer } from '@/lib/openapi/selectors'
import { useEditorStore } from '@/lib/openapi/store'
import type { HttpMethod, NodeId } from '@/lib/openapi/types'
import { cn } from '@/lib/utils'

const NO_REFERRERS: readonly SchemaReferrer[] = []

export function usageLabel(count: number): string {
  if (count === 0) return 'Not used'
  return count === 1 ? 'Used in 1 place' : `Used in ${count} places`
}

/** "Used in N places" meta chip; opens a list of the routes and schemas that reference this schema. */
export function UsagePopover({ schemaId }: { schemaId: NodeId }) {
  const referrers = useSchemaUsage().get(schemaId) ?? NO_REFERRERS
  const label = usageLabel(referrers.length)
  if (referrers.length === 0) return <MetaChip icon={Link2}>{label}</MetaChip>
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          metaChipClassName,
          'cursor-pointer outline-none transition-colors duration-150 hover:bg-accent hover:text-foreground',
          'focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent data-popup-open:text-foreground',
          'pointer-coarse:relative pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:top-1/2 pointer-coarse:after:min-h-11 pointer-coarse:after:-translate-y-1/2',
        )}
      >
        <Link2 aria-hidden className="size-3 shrink-0" />
        {label}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] gap-0 p-1">
        <p className="px-2 pt-1 pb-1.5 text-xs text-muted-foreground">Referenced by</p>
        <ul className="max-h-72 overflow-y-auto">
          {referrers.map((referrer) => (
            <li key={`${referrer.kind}:${referrer.id}`}>
              <ReferrerLink referrer={referrer} />
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

const rowClassName = cn(
  'flex h-7 w-full items-center gap-2 rounded-md px-2 text-xs text-muted-foreground outline-none transition-colors duration-150',
  'hover:bg-accent/60 hover:text-foreground focus-visible:bg-accent/60 focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
)

function ReferrerLink({ referrer }: { referrer: SchemaReferrer }) {
  if (referrer.kind === 'route') {
    const space = referrer.label.indexOf(' ')
    const method = referrer.label.slice(0, space).toLowerCase() as HttpMethod
    const path = referrer.label.slice(space + 1)
    return (
      <Link to="/routes/$routeId" params={{ routeId: referrer.id }} className={rowClassName}>
        <MethodBadge method={method} />{' '}
        <span className="truncate font-mono text-[12.5px] text-foreground">{path}</span>
      </Link>
    )
  }
  return (
    <Link to="/schemas/$schemaId" params={{ schemaId: referrer.id }} className={rowClassName}>
      <ReferrerSchemaIcon id={referrer.id} />
      <span className="truncate font-mono text-[12.5px] text-foreground">{referrer.label}</span>
    </Link>
  )
}

function ReferrerSchemaIcon({ id }: { id: NodeId }) {
  const type = useEditorStore((s) => s.document.schemas.get(id)?.type)
  return type ? <SchemaTypeIcon type={type} /> : null
}
