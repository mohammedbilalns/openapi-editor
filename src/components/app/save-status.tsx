import * as React from 'react'
import { StatusChip, toast } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { onSaveError, saveNow, useSaveStatus } from '@/lib/persistence'

/** Sidebar footer save state (BLUEPRINT §3 Status). Quiet when fine, a chip + Retry when not. */
export function SaveStatus() {
  const { state } = useSaveStatus()
  if (state === 'error') {
    return (
      <output className="flex items-center gap-1.5">
        <StatusChip tone="destructive">Not saved</StatusChip>
        <Button variant="ghost" size="xs" onClick={() => void saveNow()}>
          Retry
        </Button>
      </output>
    )
  }
  return (
    <output className="block text-[11px] text-subtle-foreground">
      {state === 'saved' ? 'Saved locally' : 'Saving…'}
    </output>
  )
}

/** One toast per failure streak. Mount once (AppShell). */
export function useSaveErrorToast() {
  React.useEffect(
    () =>
      onSaveError(() => {
        toast('Could not save to this browser.', {
          description: 'Your changes are still in this tab. Use Retry in the sidebar.',
        })
      }),
    [],
  )
}
