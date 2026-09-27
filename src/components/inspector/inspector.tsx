import * as React from 'react'
import { Check, CircleAlert, Copy, Download, FileCode2 } from 'lucide-react'
import { EmptyState, toast } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useUiPrefs, type InspectorTab } from '@/hooks/use-ui-prefs'
import { useProblemCounts, useSerializedYaml, type SerializedYaml } from '@/lib/openapi/analysis'
import { cn } from '@/lib/utils'
import { currentYaml, exportYaml } from './export-yaml'
import { ProblemsList } from './problems-list'
import { YamlView } from './yaml-view'

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick} />}>
        {children}
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

function CopyButton() {
  const [copied, setCopied] = React.useState(false)
  React.useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    const yaml = await currentYaml()
    if (yaml === null) return
    try {
      await navigator.clipboard.writeText(yaml)
      setCopied(true)
    } catch {
      toast("Couldn't copy. Your browser blocked clipboard access.")
    }
  }

  return (
    <>
      <IconAction label={copied ? 'Copied' : 'Copy YAML'} onClick={() => void copy()}>
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      </IconAction>
      <span className="sr-only" aria-live="polite">
        {copied ? 'YAML copied to the clipboard.' : ''}
      </span>
    </>
  )
}

function YamlTab({ yaml }: { yaml: SerializedYaml }) {
  const { result, error } = yaml
  if (!result) {
    return error ? (
      <EmptyState size="panel" icon={FileCode2} title="The YAML couldn't be generated." description={error} />
    ) : (
      <p className="px-3 py-3 text-xs text-muted-foreground">Generating YAML…</p>
    )
  }
  return <YamlView result={result} />
}

export type InspectorProps = {
  /** `panel`: resizable right column. `sheet`: inside A's Sheet (a close button sits top-right). */
  variant: 'panel' | 'sheet'
}

/** Right-hand inspector with the generated YAML and the Problems list (BLUEPRINT §3 Inspector). */
export function Inspector({ variant }: InspectorProps) {
  const tab = useUiPrefs((s) => s.inspectorTab)
  const setTab = useUiPrefs((s) => s.setInspectorTab)
  const setOpen = useUiPrefs((s) => s.setInspectorOpen)
  const counts = useProblemCounts()
  // Serializes only while the YAML tab is showing (BLUEPRINT §5.4).
  const yaml = useSerializedYaml(tab === 'yaml')
  const problemCount = counts.errors + counts.warnings

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as InspectorTab)}
      data-variant={variant}
      className="flex h-full min-h-0 flex-col gap-0 bg-background"
    >
      <header
        className={cn(
          'flex h-11 shrink-0 items-center gap-2 border-b border-border px-3',
          variant === 'sheet' && 'pr-12',
        )}
      >
        <TabsList aria-label="Inspector view">
          <TabsTrigger value="yaml">
            <FileCode2 aria-hidden />
            YAML
          </TabsTrigger>
          <TabsTrigger value="problems">
            <CircleAlert aria-hidden />
            Problems
            {problemCount > 0 && (
              <span className="font-mono text-[11px] text-subtle-foreground tabular-nums">
                <span className="sr-only">(</span>
                {problemCount}
                <span className="sr-only">)</span>
              </span>
            )}
          </TabsTrigger>
        </TabsList>
        <div className="ml-auto flex items-center gap-0.5">
          {tab === 'yaml' && (
            <span aria-live="polite" className="mr-1 text-xs text-muted-foreground">
              {yaml.pending ? 'Updating…' : ''}
            </span>
          )}
          <CopyButton />
          <IconAction label="Download YAML" onClick={() => void exportYaml()}>
            <Download aria-hidden />
          </IconAction>
        </div>
      </header>
      <TabsContent value="yaml" className="min-h-0 flex-1">
        {tab === 'yaml' && <YamlTab yaml={yaml} />}
      </TabsContent>
      <TabsContent value="problems" className="min-h-0 flex-1">
        {tab === 'problems' && <ProblemsList onNavigate={variant === 'sheet' ? () => setOpen(false) : undefined} />}
      </TabsContent>
    </Tabs>
  )
}
