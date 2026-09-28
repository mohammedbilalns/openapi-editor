import { Link } from '@tanstack/react-router'
import { SearchX } from 'lucide-react'
import { EmptyState, type IconProp } from '@/components/shared'
import { Button, buttonVariants } from '@/components/ui/button'
import { useActions, useCanUndo } from '@/lib/openapi/selectors'

const PAGE_CLASS = 'mx-auto flex w-full max-w-[56rem] flex-col gap-6 px-4 py-4 md:px-6 md:py-6'

function GoToOverview() {
  return (
    <Link to="/" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
      Go to overview
    </Link>
  )
}

/**
 * 404 inside or outside the shell (BLUEPRINT §3). Same page layout as the
 * missing route / schema states: the content column, a top-aligned EmptyState
 * with an icon, a short heading and a description.
 */
export function NotFound() {
  return (
    <div className={PAGE_CLASS}>
      <EmptyState
        icon={SearchX}
        title="Page not found."
        description="Check the address or go back to the overview."
        actions={<GoToOverview />}
      />
    </div>
  )
}

/**
 * A route or schema page whose entity isn't in the document (deleted, undone,
 * replaced by an import). Reactive: an undo can bring it back while this is on
 * screen.
 */
export function MissingEntity({ entity, icon }: { entity: 'route' | 'schema'; icon: IconProp }) {
  const canUndo = useCanUndo()
  const { undo } = useActions()
  return (
    <div className={PAGE_CLASS}>
      <EmptyState
        icon={icon}
        title={`This ${entity} is gone.`}
        description="It may have been deleted or replaced by an import."
        actions={
          <>
            <GoToOverview />
            {canUndo && (
              <Button variant="outline" size="sm" onClick={() => undo()}>
                Undo
              </Button>
            )}
          </>
        }
      />
    </div>
  )
}
