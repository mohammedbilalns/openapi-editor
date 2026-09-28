import * as React from 'react'
import { useValidationIssues, type Issue } from '@/lib/openapi/analysis'
import { useEditorStore } from '@/lib/openapi/store'
import type { ApiDocument } from '@/lib/openapi/types'

/**
 * Validation issues split the way the UI talks about them:
 * - **problems**: errors and warnings. Every count labelled "Problems" (sidebar,
 *   inspector tab, overview tile and panel) counts exactly these.
 * - **suggestions**: info-level notes ("not used anywhere"), listed separately.
 *
 * Validation runs 500ms after the last change, so right after a delete the last
 * result still has issues for the deleted route or schema. Those are dropped
 * here at once, against the current document.
 */
export type LiveIssues = {
  problems: readonly Issue[]
  suggestions: readonly Issue[]
  errors: number
  warnings: number
  /** True from a document change until its validation lands. */
  pending: boolean
  error: string | null
}

const EMPTY: readonly Issue[] = Object.freeze([])

function exists(issue: Issue, routes: ApiDocument['routes'], schemas: ApiDocument['schemas']): boolean {
  const { entity } = issue
  if (entity.kind === 'route') return routes.has(entity.id)
  if (entity.kind === 'schema') return schemas.has(entity.id)
  return true
}

export function splitIssues(
  issues: readonly Issue[],
  routes: ApiDocument['routes'],
  schemas: ApiDocument['schemas'],
): Omit<LiveIssues, 'pending' | 'error'> {
  const problems: Issue[] = []
  const suggestions: Issue[] = []
  let errors = 0
  let warnings = 0
  for (const issue of issues) {
    if (!exists(issue, routes, schemas)) continue
    if (issue.severity === 'info') {
      suggestions.push(issue)
      continue
    }
    problems.push(issue)
    if (issue.severity === 'error') errors += 1
    else warnings += 1
  }
  return {
    problems: problems.length === 0 ? EMPTY : problems,
    suggestions: suggestions.length === 0 ? EMPTY : suggestions,
    errors,
    warnings,
  }
}

export function useLiveIssues(): LiveIssues {
  const { issues, pending, error } = useValidationIssues()
  const routes = useEditorStore((s) => s.document.routes)
  const schemas = useEditorStore((s) => s.document.schemas)
  const split = React.useMemo(() => splitIssues(issues, routes, schemas), [issues, routes, schemas])
  return { ...split, pending, error }
}

/** Errors + warnings on entities that still exist: the number shown next to "Problems". */
export function useLiveProblemCount(): number {
  const { issues } = useValidationIssues()
  const routes = useEditorStore((s) => s.document.routes)
  const schemas = useEditorStore((s) => s.document.schemas)
  return React.useMemo(() => {
    let count = 0
    for (const issue of issues) if (issue.severity !== 'info' && exists(issue, routes, schemas)) count += 1
    return count
  }, [issues, routes, schemas])
}
