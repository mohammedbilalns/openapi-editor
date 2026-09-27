/** The sections under `/settings/$section`, in navigation order. */
export const SETTINGS_SECTIONS = ['info', 'servers', 'security', 'tags'] as const

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

export function isSettingsSection(value: unknown): value is SettingsSection {
  return typeof value === 'string' && (SETTINGS_SECTIONS as readonly string[]).includes(value)
}

export const SETTINGS_SECTION_LABELS: Record<SettingsSection, string> = {
  info: 'Info',
  servers: 'Servers',
  security: 'Security',
  tags: 'Tags',
}
