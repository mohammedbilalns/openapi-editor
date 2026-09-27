// STUB (Step 0) — owned by agent D. Replace this file's contents (worker serialization).
import { useEditorStore } from '@/lib/openapi/store'
import { serializeToYaml } from '@/lib/openapi/serializer'

function slug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'openapi'
  )
}

/** Serializes the current document and downloads it as `{slug(title)}.yaml`. */
export async function exportYaml(): Promise<void> {
  const { document } = useEditorStore.getState()
  const yaml = serializeToYaml(document)
  const url = URL.createObjectURL(new Blob([yaml], { type: 'application/yaml' }))
  const link = Object.assign(window.document.createElement('a'), { href: url, download: `${slug(document.info.title)}.yaml` })
  link.click()
  URL.revokeObjectURL(url)
}
