// STUB (Step 0) — owned by agent D. Replace this file's contents.
import { PageHeader } from '@/components/shared'
import { SETTINGS_SECTION_LABELS, type SettingsSection } from '@/lib/settings-sections'

export function SettingsPage({ section }: { section: SettingsSection }) {
  return (
    <div className="mx-auto w-full max-w-[56rem] px-4 py-4 md:px-6 md:py-6">
      <PageHeader title="Settings" description={`${SETTINGS_SECTION_LABELS[section]} placeholder.`} />
    </div>
  )
}
