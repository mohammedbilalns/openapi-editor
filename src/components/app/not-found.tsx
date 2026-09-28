import { Link } from '@tanstack/react-router'
import { SearchX } from 'lucide-react'
import { EmptyState } from '@/components/shared'
import { buttonVariants } from '@/components/ui/button'

/**
 * 404 inside or outside the shell (BLUEPRINT §3). Same page layout as the
 * missing route / schema states: the content column, a top-aligned EmptyState
 * with an icon.
 */
export function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-[56rem] flex-col gap-6 px-4 py-4 md:px-6 md:py-6">
      <EmptyState
        icon={SearchX}
        title="Page not found. Check the address or go back to the overview."
        actions={
          <Link to="/" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Go to overview
          </Link>
        }
      />
    </div>
  )
}
