import * as React from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, ChevronsUpDown } from 'lucide-react'
import { metaChipClassName } from '@/components/shared'
import { Button, buttonVariants } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useTags } from '@/lib/openapi/selectors'
import { cn } from '@/lib/utils'

/** Label tag (DESIGN §9.3): a meta chip with a dot. Tags carry no colour of their own, so the dot is neutral. */
export function TagChip({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn(metaChipClassName, 'max-w-48 font-medium text-foreground/90', className)}>
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-subtle-foreground" />
      <span className="truncate">{name}</span>
    </span>
  )
}

export type TagsComboboxProps = {
  id?: string
  value: readonly string[]
  onChange: (tags: string[]) => void
  'aria-describedby'?: string
  invalid?: boolean
  /** Called when the settings link is followed (a dialog closes itself). */
  onNavigate?: () => void
}

/**
 * Multi-select over the document's tags. Tags a route uses but the document
 * doesn't define (common after an import) are listed too, so they can be removed.
 * With no tags at all it links to the tag settings instead.
 */
export function TagsCombobox({ id, value, onChange, invalid, onNavigate, ...props }: TagsComboboxProps) {
  const tags = useTags()
  const [open, setOpen] = React.useState(false)

  const options = React.useMemo(() => {
    const names = tags.map((tag) => tag.name)
    for (const name of value) if (!names.includes(name)) names.push(name)
    return names
  }, [tags, value])

  const settingsLink = (label: string, className?: string) => (
    <Link
      to="/settings/$section"
      params={{ section: 'tags' }}
      onClick={() => {
        setOpen(false)
        onNavigate?.()
      }}
      className={cn(buttonVariants({ variant: 'link', size: 'sm' }), 'h-auto gap-1 px-0', className)}
    >
      {label}
      <ArrowUpRight aria-hidden className="size-3.5" />
    </Link>
  )

  if (options.length === 0) {
    return (
      <div id={id} className="flex min-h-8 items-center gap-2 text-[13px] text-muted-foreground">
        <span>No tags yet.</span>
        {settingsLink('Add tags in settings')}
      </div>
    )
  }

  const toggle = (name: string) => {
    onChange(value.includes(name) ? value.filter((tag) => tag !== name) : [...value, name])
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            variant="outline"
            aria-invalid={invalid || undefined}
            aria-describedby={props['aria-describedby']}
            className="h-auto min-h-8 w-full justify-between gap-2 px-2.5 py-1 font-normal"
          />
        }
      >
        {value.length > 0 ? (
          <span className="flex min-w-0 flex-wrap gap-1">
            {value.map((name) => (
              <TagChip key={name} name={name} />
            ))}
          </span>
        ) : (
          <span className="text-muted-foreground">Choose tags</span>
        )}
        <ChevronsUpDown aria-hidden className="size-3.5 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--anchor-width) min-w-56 gap-0 p-0">
        <Command>
          <CommandInput placeholder="Search tags" aria-label="Search tags" />
          <CommandList label="Tags" aria-multiselectable>
            <CommandEmpty>No tags match.</CommandEmpty>
            <CommandGroup>
              {options.map((name) => {
                const selected = value.includes(name)
                return (
                  <CommandItem
                    key={name}
                    value={name}
                    data-checked={selected}
                    aria-checked={selected}
                    onSelect={() => toggle(name)}
                  >
                    <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-subtle-foreground" />
                    <span className="truncate">{name}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="border-t border-border px-2.5 py-1.5">{settingsLink('Manage tags in settings', 'text-xs')}</div>
      </PopoverContent>
    </Popover>
  )
}
