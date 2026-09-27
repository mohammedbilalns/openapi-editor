import { toast } from '@/components/shared'
import { getAnalysisClient } from '@/lib/openapi/analysis/client'
import { getCachedYaml, rememberYaml } from '@/lib/openapi/analysis/hooks'
import { useEditorStore } from '@/lib/openapi/store'

export function slug(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/\p{Mn}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'openapi'
  )
}

/**
 * YAML for the current document: the viewer's last output when it is current,
 * otherwise serialized now (idle-scheduled). Resolves `null` when a newer export
 * superseded this one.
 */
export async function currentYaml(): Promise<string | null> {
  const { document } = useEditorStore.getState()
  const cached = getCachedYaml(document)
  if (cached) return cached.yaml
  const settled = await getAnalysisClient().serialize(document, 'export')
  if (settled.stale) return null
  rememberYaml(document, settled.value)
  return settled.value.yaml
}

/** Serializes the current document and downloads it as `{slug(title)}.yaml`. */
export async function exportYaml(): Promise<void> {
  const { title } = useEditorStore.getState().document.info
  let yaml: string | null
  try {
    yaml = await currentYaml()
  } catch (error) {
    toast(`Couldn't export the YAML. ${error instanceof Error ? error.message : ''}`.trim())
    return
  }
  if (yaml === null) return
  const url = URL.createObjectURL(new Blob([yaml], { type: 'application/yaml' }))
  const link = Object.assign(window.document.createElement('a'), { href: url, download: `${slug(title)}.yaml` })
  window.document.body.append(link)
  link.click()
  link.remove()
  // Revoke after the click has been handled; some browsers read the URL asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
