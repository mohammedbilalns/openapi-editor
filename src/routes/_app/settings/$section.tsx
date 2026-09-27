import { createFileRoute, notFound } from '@tanstack/react-router'
import { NotFound } from '@/components/app/not-found'
import { SettingsPage } from '@/components/settings/settings-page'
import { isSettingsSection } from '@/lib/settings-sections'

export const Route = createFileRoute('/_app/settings/$section')({
  params: {
    // Unknown sections parse to null and 404 in the loader, handled by this route's own
    // notFoundComponent so it renders inside the shell (a parse/beforeLoad 404, or one
    // handled by a layout, replaces the whole shell).
    parse: ({ section }) => ({ section: isSettingsSection(section) ? section : null }),
    stringify: ({ section }) => ({ section: section ?? '' }),
  },
  loader: ({ params }) => {
    if (!params.section) throw notFound()
  },
  notFoundComponent: NotFound,
  component: SettingsRoute,
})

function SettingsRoute() {
  const { section } = Route.useParams()
  if (!section) return null
  return <SettingsPage section={section} />
}
