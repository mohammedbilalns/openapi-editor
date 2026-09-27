import * as React from 'react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

export type ConfirmOptions = {
  /** A question, e.g. "Delete Pet?" */
  title: string
  description?: string
  /** Verb-first, e.g. "Delete schema". */
  confirmLabel: string
  /** Uses the destructive button (§9.1: reserved for confirmations). */
  destructive?: boolean
  /** Defaults to "Cancel". */
  cancelLabel?: string
}

type Request = ConfirmOptions & { key: number; resolve: (confirmed: boolean) => void }

type ConfirmState = { request: Request | null; open: boolean }

let state: ConfirmState = { request: null, open: false }
let nextKey = 0
const listeners = new Set<() => void>()

function setState(next: ConfirmState) {
  state = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function settle(confirmed: boolean) {
  const { request } = state
  if (!request) return
  request.resolve(confirmed)
  setState({ request, open: false })
}

/**
 * Asks the user to confirm. Resolves `true` on confirm and `false` on cancel,
 * Escape or when another confirmation replaces it. Needs `<ConfirmHost/>` mounted
 * (it is, in the root route).
 */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  settle(false)
  return new Promise<boolean>((resolve) => {
    nextKey += 1
    setState({ request: { ...options, key: nextKey, resolve }, open: true })
  })
}

/** Renders the dialog for `confirm()`. Mount once. */
export function ConfirmHost() {
  const { request, open } = React.useSyncExternalStore(subscribe, () => state, () => state)
  if (!request) return null
  return (
    <AlertDialog
      key={request.key}
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) settle(false)
      }}
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen && state.request === request) setState({ request: null, open: false })
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{request.title}</AlertDialogTitle>
          {request.description && <AlertDialogDescription>{request.description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel size="sm">{request.cancelLabel ?? 'Cancel'}</AlertDialogCancel>
          <Button size="sm" variant={request.destructive ? 'destructive' : 'default'} onClick={() => settle(true)}>
            {request.confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
