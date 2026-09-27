import { Toaster as Sonner, toast } from 'sonner'
import { buttonVariants } from '@/components/ui/button'
import { useEditorStore } from '@/lib/openapi/store'
import { cn } from '@/lib/utils'

export { toast }

/**
 * Toaster styled per DESIGN.md: the neutral popover surface (§6), 13px text,
 * no coloured fills. Mount once (the root route does).
 */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      visibleToasts={3}
      containerAriaLabel="Notifications"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: cn(
            'flex w-(--width) items-center gap-3 rounded-lg border border-border bg-popover px-3 py-2.5 text-[13px] leading-5 text-popover-foreground shadow-lg',
          ),
          content: 'flex min-w-0 flex-1 flex-col gap-0.5',
          title: 'font-medium',
          description: 'text-xs text-muted-foreground',
          icon: 'flex size-4 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-4',
          actionButton: cn(buttonVariants({ variant: 'outline', size: 'xs' }), 'ml-auto'),
          cancelButton: cn(buttonVariants({ variant: 'ghost', size: 'xs' }), 'ml-auto'),
          closeButton: cn(buttonVariants({ variant: 'ghost', size: 'icon-xs' })),
        },
      }}
    />
  )
}

/**
 * Confirms a change that just happened ("Route deleted.") with an Undo action.
 * Call it right after the store action. Undo only applies while the document is
 * still in the state that change left it in, so it never undoes a later edit.
 */
export function toastUndo(message: string): void {
  const documentAfterChange = useEditorStore.getState().document
  toast(message, {
    action: {
      label: 'Undo',
      onClick: () => {
        const store = useEditorStore.getState()
        if (store.document === documentAfterChange) {
          store.undo()
        } else {
          toast('The document changed since then. Use Undo in the top bar to step back.')
        }
      },
    },
  })
}
