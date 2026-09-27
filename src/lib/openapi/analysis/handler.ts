/**
 * The analysis work itself, as plain synchronous functions over the live
 * document. Serialization runs on the main thread on purpose: the serializer
 * caches per-node output keyed on object identity, which a structured clone
 * into a worker would throw away.
 */
import { parseYaml } from '../parser'
import { serializeToYaml } from '../serializer'
import type { ApiDocument, ValidationError } from '../types'
import { validateDocument } from '../validator'
import { supplementaryChecks, toIssues, type Issue } from './issues'
import { buildLineIndex, type YamlLineIndex } from './yaml-lines'

export type SerializeResult = YamlLineIndex & { yaml: string }

export type ParseOutcome = {
  document: ApiDocument | null
  errors: ValidationError[]
}

export function serializeWithIndex(doc: ApiDocument): SerializeResult {
  const yaml = serializeToYaml(doc)
  return { yaml, ...buildLineIndex(yaml) }
}

export function validateToIssues(doc: ApiDocument): Issue[] {
  return toIssues(doc, validateDocument(doc), supplementaryChecks(doc))
}

export function parseText(text: string): ParseOutcome {
  const { document, errors } = parseYaml(text)
  return { document, errors }
}
