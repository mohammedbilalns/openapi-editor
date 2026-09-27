import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useEditorStore } from '../store'
import { createEmptyDocument, createRoute } from '../types'
import { resetValidationForTests, useIssuesFor, useSerializedYaml, useValidationIssues } from './hooks'

function seed() {
  const doc = createEmptyDocument()
  const route = createRoute('/pets', 'get')
  doc.routes.set(route.id, route)
  useEditorStore.getState().initializeDocument(doc)
  return route.id
}

beforeEach(() => resetValidationForTests())
afterEach(() => resetValidationForTests())

describe('validation hooks', () => {
  it('keeps an entity’s issues identical when an unrelated edit re-validates', async () => {
    const routeId = seed()
    const { result } = renderHook(() => ({ route: useIssuesFor(routeId), all: useValidationIssues() }))
    await waitFor(() => expect(result.current.route.length).toBeGreaterThan(0))
    const before = result.current.route
    expect(before.some((issue) => issue.code === 'MISSING_OPERATION_ID')).toBe(true)

    act(() => useEditorStore.getState().updateInfo({ description: 'Now described' }))
    expect(result.current.all.pending).toBe(true)
    await waitFor(() => expect(result.current.all.pending).toBe(false), { timeout: 3000 })

    expect(result.current.all.issues.some((issue) => issue.code === 'MISSING_DESCRIPTION')).toBe(false)
    expect(result.current.route).toBe(before)
  })

  it('updates an entity’s issues when that entity changes', async () => {
    const routeId = seed()
    const { result } = renderHook(() => useIssuesFor(routeId))
    await waitFor(() => expect(result.current.some((i) => i.code === 'MISSING_OPERATION_ID')).toBe(true))
    act(() => useEditorStore.getState().updateRoute(routeId, { operationId: 'listPets' }))
    await waitFor(() => expect(result.current.some((i) => i.code === 'MISSING_OPERATION_ID')).toBe(false), {
      timeout: 3000,
    })
  })
})

describe('useSerializedYaml', () => {
  it('serializes only while enabled and reports pending until the new YAML lands', async () => {
    seed()
    const { result, rerender } = renderHook(({ enabled }) => useSerializedYaml(enabled), {
      initialProps: { enabled: false },
    })
    expect(result.current.pending).toBe(false)

    rerender({ enabled: true })
    await waitFor(() => expect(result.current.result?.yaml).toContain('/pets:'))
    expect(result.current.pending).toBe(false)

    act(() => useEditorStore.getState().updateInfo({ title: 'Renamed API' }))
    expect(result.current.pending).toBe(true)
    await waitFor(() => expect(result.current.result?.yaml).toContain('title: Renamed API'))
    expect(result.current.pending).toBe(false)
  })
})
