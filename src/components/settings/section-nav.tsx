import { Link, useNavigate } from '@tanstack/react-router'
import { ChevronDown, Info, KeyRound, Server, Tag } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { tabsListVariants } from '@/components/ui/tabs'
import { SETTINGS_SECTIONS, SETTINGS_SECTION_LABELS, isSettingsSection, type SettingsSection } from '@/lib/settings-sections'
import { cn } from '@/lib/utils'

export const SECTION_ICONS = { info: Info, servers: Server, security: KeyRound, tags: Tag } as const

/** §9.2 segmented item, as a link. */
const itemClassName = cn(
  'relative inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs font-medium whitespace-nowrap text-muted-foreground outline-none transition-colors duration-150',
  'hover:bg-accent/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
  'aria-[current=page]:bg-accent aria-[current=page]:text-foreground',
  'pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:top-1/2 pointer-coarse:after:min-h-11 pointer-coarse:after:-translate-y-1/2',
)

/**
 * Settings section switcher: a segmented control of links (§9.2), and below
 * 768px a native select styled as an outline button (§9.20).
 */
export function SectionNav({ section }: { section: SettingsSection }) {
  const navigate = useNavigate()
  const CurrentIcon = SECTION_ICONS[section]
  return (
    <>
      <nav aria-label="Settings sections" className={cn(tabsListVariants({ variant: 'segmented' }), 'hidden md:inline-flex')}>
        {SETTINGS_SECTIONS.map((value) => {
          const Icon = SECTION_ICONS[value]
          return (
            <Link
              key={value}
              to="/settings/$section"
              params={{ section: value }}
              aria-current={value === section ? 'page' : undefined}
              className={itemClassName}
            >
              <Icon aria-hidden className="size-3.5" />
              {SETTINGS_SECTION_LABELS[value]}
            </Link>
          )
        })}
      </nav>
      <div className="relative md:hidden">
        <CurrentIcon aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <select
          aria-label="Settings section"
          value={section}
          onChange={(event) => {
            const next = event.target.value
            if (isSettingsSection(next)) void navigate({ to: '/settings/$section', params: { section: next } })
          }}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'appearance-none pr-7 pl-7')}
        >
          {SETTINGS_SECTIONS.map((value) => (
            <option key={value} value={value}>
              {SETTINGS_SECTION_LABELS[value]}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      </div>
    </>
  )
}
