import { PageHeader } from '@/components/shared'
import type { SettingsSection } from '@/lib/settings-sections'
import { InfoSection } from './info-section'
import { SectionNav } from './section-nav'
import { SecuritySection } from './security-section'
import { ServersSection } from './servers-section'
import { TagsSection } from './tags-section'

const SECTIONS = {
  info: InfoSection,
  servers: ServersSection,
  security: SecuritySection,
  tags: TagsSection,
} as const

/** `/settings/$section` (BLUEPRINT §3 Settings). */
export function SettingsPage({ section }: { section: SettingsSection }) {
  const Section = SECTIONS[section]
  return (
    <div className="mx-auto flex w-full max-w-[56rem] flex-col gap-6 px-4 py-4 md:px-6 md:py-6">
      <PageHeader title="Settings" toolbar={<SectionNav section={section} />} />
      <Section />
    </div>
  )
}
