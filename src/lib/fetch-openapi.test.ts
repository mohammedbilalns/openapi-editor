import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchOpenApiFromUrl } from './fetch-openapi'
import { MAX_DOCUMENT_CHARS } from './openapi/parser'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchOpenApiFromUrl', () => {
  it('refuses a document the server says is over the size limit, without reading it', async () => {
    const text = vi.fn<() => Promise<string>>(async () => 'openapi: 3.0.0')
    vi.stubGlobal(
      'fetch',
      vi.fn<() => Promise<unknown>>(async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-length': String(MAX_DOCUMENT_CHARS + 1) }),
        body: null,
        text,
      })),
    )
    const result = await fetchOpenApiFromUrl('https://example.com/spec.yaml')
    expect(result.error).toMatch(/larger than 50 MB/)
    expect(text).not.toHaveBeenCalled()
  })

  it('refuses an oversized body without a length header', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<() => Promise<Response>>(async () => new Response(' '.repeat(MAX_DOCUMENT_CHARS + 1))),
    )
    const result = await fetchOpenApiFromUrl('https://example.com/spec.yaml')
    expect(result).toEqual({ error: expect.stringMatching(/larger than 50 MB/) })
  })

  it('returns the text of a normal document', async () => {
    vi.stubGlobal('fetch', vi.fn<() => Promise<Response>>(async () => new Response('openapi: 3.0.0\n')))
    expect(await fetchOpenApiFromUrl('https://example.com/spec.yaml')).toEqual({ content: 'openapi: 3.0.0\n' })
  })
})
