import { Link } from '@tanstack/react-router'
import { EmptyState } from '@/components/shared'
import { buttonVariants } from '@/components/ui/button'

/** 404 inside or outside the shell (BLUEPRINT §3). */
export function NotFound() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-[56rem] items-center justify-center px-4 md:px-6">
      <EmptyState
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
