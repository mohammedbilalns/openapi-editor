import { createFileRoute, notFound } from '@tanstack/react-router'
import { SettingsPage } from '@/components/settings/settings-page'
import { SETTINGS_SECTION_LABELS, isSettingsSection } from '@/lib/settings-sections'

export const Route = createFileRoute('/_app/settings/$section')({
  params: {
    parse: ({ section }) => {
      if (!isSettingsSection(section)) throw notFound()
      return { section }
    },
    stringify: ({ section }) => ({ section }),
  },
  head: ({ params }) => ({
    meta: [{ title: `${SETTINGS_SECTION_LABELS[params.section]} settings · OpenAPI Editor` }],
  }),
  component: SettingsRoute,
})

function SettingsRoute() {
  const { section } = Route.useParams()
  return <SettingsPage section={section} />
}
