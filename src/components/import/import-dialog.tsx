import * as React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { CircleX, ClipboardPaste, FileText, Globe, Info, TriangleAlert, Upload, WifiOff } from 'lucide-react'
import { toast } from '@/components/shared'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { fetchOpenApiFromUrl } from '@/lib/fetch-openapi'
import { getAnalysisClient } from '@/lib/openapi/analysis/client'
import { getActions } from '@/lib/openapi/selectors'
import type { ApiDocument, ValidationError, ValidationSeverity } from '@/lib/openapi/types'
import { cn } from '@/lib/utils'

export type ImportDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Source = 'paste' | 'file' | 'url'

type LoadedText = { text: string; label: string }

type Outcome =
  | { kind: 'idle' }
  | { kind: 'parsing' }
  /** Errors block the import; `document` is kept only for warnings. */
  | { kind: 'problems'; problems: ValidationError[]; document: ApiDocument | null }

const ACCEPTED_EXTENSIONS = ['.yaml', '.yml', '.json']

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

/** "Imported Petstore. 14 routes, 9 schemas." */
export function importedMessage(doc: ApiDocument): string {
  const title = doc.info.title.trim() || 'the spec'
  return `Imported ${title}. ${plural(doc.routes.size, 'route')}, ${plural(doc.schemas.size, 'schema')}.`
}

const SEVERITY_ICON: Record<ValidationSeverity, { icon: typeof CircleX; className: string; label: string }> = {
  error: { icon: CircleX, className: 'text-destructive-foreground', label: 'Error' },
  warning: { icon: TriangleAlert, className: 'text-warning-foreground', label: 'Warning' },
  info: { icon: Info, className: 'text-muted-foreground', label: 'Note' },
}

/**
 * YAML parse errors arrive as one line of explanation followed by a code frame
 * (`1 | openapi: 3.0.3` … `-----^`). The first line is the message; the rest,
 * if any, keeps its line breaks and alignment in a code block (§9.19).
 */
export function splitCodeFrame(message: string): { text: string; frame?: string } {
  const newline = message.indexOf('\n')
  if (newline === -1) return { text: message }
  const text = message.slice(0, newline).trim()
  const frame = message
    .slice(newline + 1)
    .replace(/^(?:[ \t]*\r?\n)+/, '')
    .trimEnd()
  return frame ? { text, frame } : { text }
}

function ProblemList({ problems }: { problems: ValidationError[] }) {
  const errors = problems.filter((p) => p.severity === 'error').length
  const warnings = problems.length - errors
  const summary =
    errors > 0
      ? `${plural(errors, 'error')} ${errors === 1 ? 'stops' : 'stop'} the import. Fix the spec and try again.`
      : `${plural(warnings, 'warning')}. You can import anyway.`
  return (
    <div className="flex flex-col gap-2">
      <p aria-live="polite" className="text-xs text-muted-foreground">
        {summary}
      </p>
      <ul
        aria-label="Import problems"
        className="max-h-64 divide-y divide-border/70 overflow-y-auto rounded-lg border border-border"
      >
        {problems.map((problem, index) => {
          const severity = SEVERITY_ICON[problem.severity]
          const Icon = severity.icon
          const path = problem.location.path?.join('.')
          const message = splitCodeFrame(problem.message)
          return (
            // Parser problems have no stable identity; their order is fixed per parse.
            // oxlint-disable-next-line react/no-array-index-key
            <li key={index} className="flex items-start gap-2 px-3 py-2">
              <Icon aria-hidden className={cn('mt-0.5 size-3.5 shrink-0', severity.className)} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="text-[13px] leading-5 break-words text-foreground">
                  <span className="sr-only">{severity.label}: </span>
                  {message.text}
                </p>
                {message.frame && (
                  <pre className="mt-1 overflow-x-auto rounded-lg border border-border bg-code p-3 font-mono text-[12.5px] leading-5 whitespace-pre text-code-foreground [tab-size:2]">
                    {message.frame}
                  </pre>
                )}
                {path && <p className="font-mono text-[11px] leading-4 text-subtle-foreground">{path}</p>}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function hasAcceptedExtension(name: string): boolean {
  const lower = name.toLowerCase()
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

function FileDropZone({
  file,
  onFile,
  error,
}: {
  file: LoadedText | null
  onFile: (file: File) => void
  error: string | null
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = React.useState(false)
  const depth = React.useRef(0)

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault()
          depth.current += 1
          setDragging(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
        }}
        onDragLeave={() => {
          depth.current = Math.max(0, depth.current - 1)
          if (depth.current === 0) setDragging(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          depth.current = 0
          setDragging(false)
          const dropped = event.dataTransfer.files[0]
          if (dropped) onFile(dropped)
        }}
        data-dragging={dragging || undefined}
        aria-describedby="import-file-hint"
        className={cn(
          'flex h-64 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-input px-6 text-center outline-none',
          'transition-colors duration-150 ease-standard hover:bg-muted/40',
          'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/24 dark:focus-visible:ring-ring/48',
          'data-dragging:border-ring data-dragging:bg-muted/55',
        )}
      >
        <span className="flex size-8 items-center justify-center rounded-lg border border-border/70 bg-muted/40 text-muted-foreground">
          <Upload aria-hidden className="size-3.5" />
        </span>
        <span className="text-sm font-medium text-foreground">
          {dragging ? 'Drop to load the file' : 'Drop a file here, or click to choose one'}
        </span>
        <span id="import-file-hint" className="text-xs text-muted-foreground">
          YAML or JSON: .yaml, .yml, .json
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(',')}
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose an OpenAPI file"
        onChange={(event) => {
          const chosen = event.target.files?.[0]
          if (chosen) onFile(chosen)
          event.target.value = ''
        }}
      />
      {error ? (
        <p role="alert" className="flex items-center gap-1.5 text-xs text-destructive-foreground">
          <CircleX aria-hidden className="size-3 shrink-0" />
          {error}
        </p>
      ) : (
        file && (
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <FileText aria-hidden className="size-3.5 shrink-0" />
            <span className="truncate font-mono text-foreground">{file.label}</span>
            <span className="shrink-0">loaded. Import to replace the current document.</span>
          </p>
        )
      )}
    </div>
  )
}

/** Import a spec from pasted text, a file or a URL (BLUEPRINT §3 Import dialog). */
export function ImportDialog({ open, onOpenChange }: ImportDialogProps) {
  // Remount the body after every close so a reopened dialog starts clean.
  const [session, setSession] = React.useState(0)
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) setSession((n) => n + 1)
      }}
    >
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
        <ImportForm key={session} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function ImportForm({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate()
  const online = useOnlineStatus()
  const [source, setSource] = React.useState<Source>('paste')
  const [pasted, setPasted] = React.useState('')
  const [file, setFile] = React.useState<LoadedText | null>(null)
  const [fileError, setFileError] = React.useState<string | null>(null)
  const [url, setUrl] = React.useState('')
  const [fetched, setFetched] = React.useState<LoadedText | null>(null)
  const [fetchState, setFetchState] = React.useState<{ loading: boolean; error: string | null }>({
    loading: false,
    error: null,
  })
  const [outcome, setOutcome] = React.useState<Outcome>({ kind: 'idle' })
  const abortRef = React.useRef<AbortController | null>(null)

  React.useEffect(() => () => abortRef.current?.abort(), [])

  const text = source === 'paste' ? pasted : source === 'file' ? (file?.text ?? '') : (fetched?.text ?? '')
  const parsing = outcome.kind === 'parsing'
  const blocking = outcome.kind === 'problems' && (outcome.document === null || outcome.problems.some((p) => p.severity === 'error'))
  const canImportAnyway = outcome.kind === 'problems' && !blocking

  const resetOutcome = () => setOutcome({ kind: 'idle' })

  const apply = (doc: ApiDocument) => {
    getActions().setDocument(doc)
    onDone()
    void navigate({ to: '/' })
    toast(importedMessage(doc))
  }

  const runImport = async () => {
    if (canImportAnyway && outcome.document) {
      apply(outcome.document)
      return
    }
    if (!text.trim()) return
    setOutcome({ kind: 'parsing' })
    let settled
    try {
      settled = await getAnalysisClient().parse(text)
    } catch (error) {
      setOutcome({
        kind: 'problems',
        document: null,
        problems: [
          {
            code: 'PARSE_FAILED',
            message: `The spec couldn't be read. ${error instanceof Error ? error.message : ''}`.trim(),
            severity: 'error',
            location: {},
          },
        ],
      })
      return
    }
    if (settled.stale) return
    const { document, errors } = settled.value
    if (!document || errors.length > 0) {
      setOutcome({ kind: 'problems', problems: errors, document })
      return
    }
    apply(document)
  }

  const loadFile = async (chosen: File) => {
    resetOutcome()
    if (!hasAcceptedExtension(chosen.name)) {
      setFile(null)
      setFileError(`${chosen.name} isn't a .yaml, .yml or .json file.`)
      return
    }
    try {
      const content = await chosen.text()
      setFileError(null)
      setFile({ text: content, label: `${chosen.name} · ${formatBytes(chosen.size)}` })
    } catch {
      setFile(null)
      setFileError(`${chosen.name} couldn't be read.`)
    }
  }

  const fetchUrl = async () => {
    if (!url.trim()) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    resetOutcome()
    setFetched(null)
    setFetchState({ loading: true, error: null })
    const result = await fetchOpenApiFromUrl(url, { signal: controller.signal })
    if (controller.signal.aborted) return
    if (result.error || result.content === undefined) {
      setFetchState({ loading: false, error: result.error ?? "The URL didn't return anything." })
      return
    }
    let host = url
    try {
      host = new URL(url.trim()).host
    } catch {
      // fetchOpenApiFromUrl already validated it; keep the raw text if not.
    }
    setFetched({ text: result.content, label: `${formatBytes(new Blob([result.content]).size)} from ${host}` })
    setFetchState({ loading: false, error: null })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Import a spec</DialogTitle>
        <DialogDescription>
          Paste, upload or fetch an OpenAPI 3.0 document in YAML or JSON. It replaces the current document. You can
          undo this.
        </DialogDescription>
      </DialogHeader>

      <Tabs
        value={source}
        onValueChange={(value) => {
          setSource(value as Source)
          resetOutcome()
        }}
        className="min-w-0 gap-3"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <TabsList aria-label="Import from">
            <TabsTrigger value="paste">
              <ClipboardPaste aria-hidden />
              Paste
            </TabsTrigger>
            <TabsTrigger value="file">
              <Upload aria-hidden />
              File
            </TabsTrigger>
            <TabsTrigger value="url" disabled={!online}>
              {online ? <Globe aria-hidden /> : <WifiOff aria-hidden />}
              URL
            </TabsTrigger>
          </TabsList>
          {!online && <p className="text-xs text-muted-foreground">Fetching from a URL needs a connection.</p>}
        </div>

        <TabsContent value="paste">
          <Textarea
            data-native-undo
            aria-label="OpenAPI document"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="Paste a YAML or JSON document here."
            value={pasted}
            onChange={(event) => {
              setPasted(event.target.value)
              resetOutcome()
            }}
            className="h-64 resize-none font-mono text-[12.5px] leading-5 whitespace-pre [field-sizing:fixed]"
          />
        </TabsContent>

        <TabsContent value="file">
          <FileDropZone file={file} onFile={(chosen) => void loadFile(chosen)} error={fileError} />
        </TabsContent>

        <TabsContent value="url">
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void fetchUrl()
            }}
          >
            <div className="flex gap-2">
              <Input
                type="url"
                inputMode="url"
                aria-label="Spec URL"
                placeholder="https://example.com/openapi.yaml"
                value={url}
                disabled={!online}
                onChange={(event) => {
                  setUrl(event.target.value)
                  setFetchState({ loading: false, error: null })
                }}
                aria-invalid={fetchState.error ? true : undefined}
                aria-describedby="import-url-note"
                className="font-mono text-[12.5px]"
              />
              <Button type="submit" variant="outline" disabled={!online || !url.trim() || fetchState.loading}>
                {fetchState.loading ? 'Fetching…' : 'Fetch'}
              </Button>
            </div>
            <p id="import-url-note" className="text-xs text-muted-foreground">
              {online
                ? 'The server has to allow cross-origin requests.'
                : 'Fetching from a URL needs a connection.'}
            </p>
            {fetchState.error && (
              <p role="alert" className="flex items-start gap-1.5 text-xs text-destructive-foreground">
                <CircleX aria-hidden className="mt-0.5 size-3 shrink-0" />
                {fetchState.error}
              </p>
            )}
            {fetched && !fetchState.error && (
              <p className="text-xs text-muted-foreground">
                Fetched {fetched.label}. Import to replace the current document.
              </p>
            )}
          </form>
        </TabsContent>
      </Tabs>

      {outcome.kind === 'problems' && <ProblemList problems={outcome.problems} />}

      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => void runImport()} disabled={parsing || blocking || !text.trim()}>
          {parsing ? 'Reading the spec…' : canImportAnyway ? 'Import anyway' : 'Import'}
        </Button>
      </DialogFooter>
    </>
  )
}
