import { Link } from '@tanstack/react-router'
import { buttonVariants } from '@/components/ui/button'

export function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-xs text-muted-foreground">404</p>
      <h1 className="text-2xl font-medium tracking-[-0.025em]">This page doesn’t exist.</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The link may be broken, or the page may have moved. Your specs are still saved locally.
      </p>
      <Link to="/" className={buttonVariants({ variant: 'outline' })}>
        Back to the editor
      </Link>
    </main>
  )
}
