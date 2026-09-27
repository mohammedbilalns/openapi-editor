import { describe, expect, it, vi } from 'vitest'
import { createEmptyDocument, type ApiDocument } from '../types'
import type { SerializeResult } from './handler'
import { createAnalysisClient, type Scheduler } from './client'

/** A scheduler whose tasks run only when the test says so, in any order. */
function manualScheduler() {
  const tasks: (() => void)[] = []
  const schedule: Scheduler = (task) => {
    tasks.push(task)
  }
  return { schedule, tasks }
}

describe('analysis client', () => {
  it('drops a result that a newer request on the same channel overtook, without doing its work', async () => {
    const { schedule, tasks } = manualScheduler()
    const serialize = vi.fn<(doc: ApiDocument) => SerializeResult>((doc) => ({
      yaml: doc.info.title,
      lineStarts: new Uint32Array([0, doc.info.title.length + 1]),
      blockFlags: new Uint8Array(1),
      lineCount: 1,
      maxLineLength: doc.info.title.length,
    }))
    const client = createAnalysisClient({ schedule, serialize })

    const first = createEmptyDocument()
    first.info.title = 'first'
    const second = createEmptyDocument()
    second.info.title = 'second'

    const older = client.serialize(first)
    const newer = client.serialize(second)

    // Run in reverse order: the newer one finishes first, then the older one.
    tasks[1]()
    tasks[0]()

    await expect(newer).resolves.toMatchObject({ stale: false, value: { yaml: 'second' } })
    await expect(older).resolves.toEqual({ stale: true })
    expect(serialize).toHaveBeenCalledTimes(1)
  })

  it('keeps channels independent: an export is not overtaken by live YAML updates', async () => {
    const { schedule, tasks } = manualScheduler()
    const client = createAnalysisClient({ schedule })
    const doc = createEmptyDocument()
    doc.info.title = 'Petstore'

    const exported = client.serialize(doc, 'export')
    const live = client.serialize(doc, 'yaml')
    for (const task of tasks) task()

    await expect(exported).resolves.toMatchObject({ stale: false })
    await expect(live).resolves.toMatchObject({ stale: false })
    const settled = await exported
    expect(!settled.stale && settled.value.yaml).toContain('title: Petstore')
  })

  it('marks an overtaken parse stale even when it finishes last', async () => {
    const resolvers: ((value: { document: null; errors: [] }) => void)[] = []
    const client = createAnalysisClient({
      parse: () => new Promise((resolve) => resolvers.push(resolve)),
    })
    const older = client.parse('a: 1')
    const newer = client.parse('b: 2')
    resolvers[1]({ document: null, errors: [] })
    resolvers[0]({ document: null, errors: [] })
    await expect(newer).resolves.toMatchObject({ stale: false })
    await expect(older).resolves.toEqual({ stale: true })
  })

  it('runs validation against the live document on the default main-thread path', async () => {
    const client = createAnalysisClient()
    const doc = createEmptyDocument()
    doc.info.title = ''
    const settled = await client.validate(doc)
    expect(settled.stale).toBe(false)
    expect(!settled.stale && settled.value.some((issue) => issue.code === 'MISSING_TITLE')).toBe(true)
  })
})
