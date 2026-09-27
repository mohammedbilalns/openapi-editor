// STUB (Step 0) — owned by agent D. Replace this file's contents.
import { useUiPrefs } from '@/hooks/use-ui-prefs'

export function Inspector({ variant }: { variant: 'panel' | 'sheet' }) {
  const tab = useUiPrefs((s) => s.inspectorTab)
  return (
    <div data-variant={variant} className="flex h-full flex-col">
      <div className="flex h-11 items-center border-b border-border px-3 text-[13px] text-muted-foreground">
        Inspector placeholder ({tab === 'yaml' ? 'YAML' : 'Problems'})
      </div>
    </div>
  )
}
