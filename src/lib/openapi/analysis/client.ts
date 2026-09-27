/**
 * Async, latest-wins access to the analysis work (YAML, validation, import
 * parsing).
 *
 * Serialization and validation run on the main thread against the live
 * document (the serializer's per-node cache depends on object identity), in an
 * idle callback so they never run inside an input event. Import parsing runs in
 * the OpenAPI worker (`worker-client.ts`); the parsed ApiDocument comes back by
 * structured clone, which is fine since it is brand new anyway.
 *
 * Every request is tagged with a per-channel version. A request that a newer
 * one on the same channel overtook resolves as `{ stale: true }` (and is
 * skipped entirely if it hadn't started yet); callers drop it.
 */
import type { ApiDocument } from '../types'
import { createOpenApiWorkerClient, type OpenApiWorkerClient } from '../worker-client'
import { parseText, serializeWithIndex, validateToIssues, type ParseOutcome, type SerializeResult } from './handler'
import type { Issue } from './issues'

export type { ParseOutcome, SerializeResult }

export type Settled<T> = { stale: false; value: T } | { stale: true }

/** Runs `task` later, off the current event. */
export type Scheduler = (task: () => void) => void

/** Idle time when the browser offers it (with a deadline), else the next macrotask. */
export const idleScheduler: Scheduler = (task) => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => task(), { timeout: 1000 })
  else setTimeout(task, 0)
}

export type AnalysisChannel = 'yaml' | 'validate' | 'export' | 'import'

export type ParseImplementation = (text: string) => Promise<ParseOutcome>

export interface AnalysisClient {
  serialize(doc: ApiDocument, channel?: AnalysisChannel): Promise<Settled<SerializeResult>>
  validate(doc: ApiDocument, channel?: AnalysisChannel): Promise<Settled<Issue[]>>
  parse(text: string, channel?: AnalysisChannel): Promise<Settled<ParseOutcome>>
}

export type AnalysisClientOptions = {
  schedule?: Scheduler
  /** Import parsing; defaults to the OpenAPI worker. */
  parse?: ParseImplementation
  serialize?: (doc: ApiDocument) => SerializeResult
  validate?: (doc: ApiDocument) => Issue[]
}

/** After the next paint, so a pending state ("Reading the spec…") shows before a long parse. */
function afterPaint(task: () => void) {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(task, 0))
  else setTimeout(task, 0)
}

const mainThreadParse: ParseImplementation = (text) =>
  new Promise((resolve, reject) =>
    afterPaint(() => {
      try {
        resolve(parseText(text))
      } catch (error) {
        reject(error)
      }
    }),
  )

let workerClient: OpenApiWorkerClient | null = null

/**
 * Parses in the OpenAPI worker. Without `Worker` (jsdom) or if the worker
 * fails, parses on the main thread after a paint instead.
 */
const workerParse: ParseImplementation = async (text) => {
  if (typeof Worker === 'undefined') return mainThreadParse(text)
  try {
    workerClient ??= createOpenApiWorkerClient()
    const { document, errors } = await workerClient.parseYaml(text)
    return { document, errors }
  } catch (error) {
    console.error('Parsing in the worker failed; parsing on the main thread.', error)
    workerClient?.terminate()
    workerClient = null
    return mainThreadParse(text)
  }
}

export function createAnalysisClient(options: AnalysisClientOptions = {}): AnalysisClient {
  const schedule = options.schedule ?? idleScheduler
  const serialize = options.serialize ?? serializeWithIndex
  const validate = options.validate ?? validateToIssues
  const latest = new Map<AnalysisChannel, number>()
  let nextVersion = 1

  const claim = (channel: AnalysisChannel) => {
    const version = nextVersion++
    latest.set(channel, version)
    return () => latest.get(channel) === version
  }

  function runScheduled<T>(channel: AnalysisChannel, work: () => T): Promise<Settled<T>> {
    const isLatest = claim(channel)
    return new Promise((resolve, reject) =>
      schedule(() => {
        // Overtaken before it started: don't do the work at all.
        if (!isLatest()) return resolve({ stale: true })
        try {
          resolve({ stale: false, value: work() })
        } catch (error) {
          reject(error)
        }
      }),
    )
  }

  return {
    serialize: (doc, channel = 'yaml') => runScheduled(channel, () => serialize(doc)),
    validate: (doc, channel = 'validate') => runScheduled(channel, () => validate(doc)),
    parse: async (text, channel = 'import') => {
      const isLatest = claim(channel)
      const value = await (options.parse ?? parseImplementation)(text)
      return isLatest() ? { stale: false, value } : { stale: true }
    },
  }
}

// ---------------------------------------------------------------------------
// Shared instance

let parseImplementation: ParseImplementation = workerParse

/** Tests: route import parsing elsewhere (`undefined` restores the worker). */
export function setParseImplementation(parse: ParseImplementation | undefined): void {
  parseImplementation = parse ?? workerParse
}

let shared: AnalysisClient | undefined

/** The app-wide client. */
export function getAnalysisClient(): AnalysisClient {
  shared ??= createAnalysisClient()
  return shared
}

/** Tests: swap the shared client. */
export function setAnalysisClientForTests(client: AnalysisClient | undefined): void {
  shared = client
}
