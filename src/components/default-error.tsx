import { type ErrorComponentProps, useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export function DefaultErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const message = error instanceof Error ? error.message : String(error)

  return (
    <main
      role="alert"
      className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center"
    >
      <h1 className="text-2xl font-medium tracking-[-0.025em]">Something went wrong.</h1>
      <p className="max-w-md font-mono text-xs break-words text-muted-foreground">{message}</p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => {
            reset()
            void router.invalidate()
          }}
        >
          Try again
        </Button>
        <Button variant="ghost" onClick={() => window.location.assign('/')}>
          Reload the editor
        </Button>
      </div>
    </main>
  )
}
