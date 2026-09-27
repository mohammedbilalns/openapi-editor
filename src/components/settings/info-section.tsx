import { Info } from 'lucide-react'
import { FieldRow, Panel } from '@/components/shared'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { INFO_ISSUES, fieldIssues, issueProps, useIssuesFor } from '@/lib/openapi/analysis'
import { useActions, useInfo } from '@/lib/openapi/selectors'
import type { InfoObject } from '@/lib/openapi/types'

/** Drops empty strings so cleared fields disappear from the YAML. */
function optional(value: string): string | undefined {
  return value.trim() === '' ? undefined : value
}

function contactUpdate(info: InfoObject, key: 'name' | 'email' | 'url', value: string): Partial<InfoObject> {
  const contact = { ...info.contact, [key]: optional(value) }
  const empty = !contact.name && !contact.email && !contact.url
  return { contact: empty ? undefined : contact }
}

function licenseUpdate(info: InfoObject, key: 'name' | 'url', value: string): Partial<InfoObject> {
  const name = key === 'name' ? value : (info.license?.name ?? '')
  const url = key === 'url' ? optional(value) : info.license?.url
  return { license: name.trim() === '' && !url ? undefined : { name, url } }
}

/** `/settings/info`: the document's info object. */
export function InfoSection() {
  const info = useInfo()
  const { updateInfo } = useActions()
  const issues = useIssuesFor(INFO_ISSUES)

  return (
    <Panel title="API info" icon={Info}>
      <div className="flex flex-col gap-3">
        <FieldRow label="Title" htmlFor="info-title" issues={fieldIssues(issues, 'title')}>
          <Input
            id="info-title"
            value={info.title}
            onChange={(event) => updateInfo({ title: event.target.value })}
            {...issueProps(issues, 'title', 'info-title')}
          />
        </FieldRow>
        <FieldRow label="Version" htmlFor="info-version" issues={fieldIssues(issues, 'version')}>
          <Input
            id="info-version"
            value={info.version}
            onChange={(event) => updateInfo({ version: event.target.value })}
            className="font-mono text-[13px]"
            {...issueProps(issues, 'version', 'info-version')}
          />
        </FieldRow>
        <FieldRow label="Description" htmlFor="info-description" hint="Markdown is allowed.">
          <Textarea
            id="info-description"
            rows={3}
            value={info.description ?? ''}
            onChange={(event) => updateInfo({ description: optional(event.target.value) })}
            aria-describedby="info-description-hint"
          />
        </FieldRow>
        <FieldRow label="Terms of service" htmlFor="info-tos">
          <Input
            id="info-tos"
            type="url"
            inputMode="url"
            placeholder="https://example.com/terms"
            value={info.termsOfService ?? ''}
            onChange={(event) => updateInfo({ termsOfService: optional(event.target.value) })}
          />
        </FieldRow>
        <FieldRow label="Contact name" htmlFor="info-contact-name">
          <Input
            id="info-contact-name"
            autoComplete="off"
            value={info.contact?.name ?? ''}
            onChange={(event) => updateInfo(contactUpdate(info, 'name', event.target.value))}
          />
        </FieldRow>
        <FieldRow label="Contact email" htmlFor="info-contact-email">
          <Input
            id="info-contact-email"
            type="email"
            autoComplete="off"
            placeholder="api@example.com"
            value={info.contact?.email ?? ''}
            onChange={(event) => updateInfo(contactUpdate(info, 'email', event.target.value))}
          />
        </FieldRow>
        <FieldRow label="Contact URL" htmlFor="info-contact-url">
          <Input
            id="info-contact-url"
            type="url"
            inputMode="url"
            placeholder="https://example.com/support"
            value={info.contact?.url ?? ''}
            onChange={(event) => updateInfo(contactUpdate(info, 'url', event.target.value))}
          />
        </FieldRow>
        <FieldRow label="License" htmlFor="info-license-name">
          <Input
            id="info-license-name"
            placeholder="MIT"
            value={info.license?.name ?? ''}
            onChange={(event) => updateInfo(licenseUpdate(info, 'name', event.target.value))}
          />
        </FieldRow>
        <FieldRow label="License URL" htmlFor="info-license-url">
          <Input
            id="info-license-url"
            type="url"
            inputMode="url"
            placeholder="https://opensource.org/licenses/MIT"
            value={info.license?.url ?? ''}
            onChange={(event) => updateInfo(licenseUpdate(info, 'url', event.target.value))}
          />
        </FieldRow>
      </div>
    </Panel>
  )
}
