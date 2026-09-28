import * as React from 'react'
import { StatusChip, toast } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { getSaveStatus, onSaveError, retryLoad, saveNow, useSaveStatus, type SaveState } from '@/lib/persistence'
import { StorageBlockedError } from '@/lib/storage'

/** Sidebar footer save state (BLUEPRINT §3 Status). Quiet when fine, a chip + action when not. */
export function SaveStatus() {
  const { state } = useSaveStatus()
  if (state === 'error' || state === 'load-error') {
    const loadFailed = state === 'load-error'
    return (
      <output className="flex items-center gap-1.5">
        <StatusChip tone="destructive">{loadFailed ? 'Not loaded' : 'Not saved'}</StatusChip>
        <Button variant="ghost" size="xs" onClick={() => void (loadFailed ? retryLoad() : saveNow())}>
          Retry
        </Button>
      </output>
    )
  }
  if (state === 'conflict') {
    return (
      <output className="flex min-w-0 items-center gap-1.5">
        <StatusChip tone="warning">Changed in another tab</StatusChip>
        <Button variant="ghost" size="xs" onClick={() => window.location.reload()}>
          Reload
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

/** One toast per failure streak, conflict or failed load. Mount once (AppShell). */
export function useSaveErrorToast() {
  React.useEffect(() => {
    const unsubscribe = onSaveError(showSaveErrorToast)
    // A failed load happens in the route loader, before the shell (and this listener) mounts.
    const { state, error } = getSaveStatus()
    if (state === 'load-error') showSaveErrorToast(error, state)
    return unsubscribe
  }, [])
}

function showSaveErrorToast(error: unknown, state: SaveState) {
  if (state === 'conflict') {
    toast('This document was changed in another tab.', {
      id: 'save-conflict',
      description: 'This tab stopped saving so it won’t overwrite those changes. Reload to continue here.',
    })
  } else if (state === 'load-error') {
    toast('Could not open the saved document.', {
      id: 'load-error',
      description:
        error instanceof StorageBlockedError
          ? error.message
          : 'Nothing will be saved until it loads. Use Retry in the sidebar.',
    })
  } else {
    toast('Could not save to this browser.', {
      description: 'Your changes are still in this tab. Use Retry in the sidebar.',
    })
  }
}
