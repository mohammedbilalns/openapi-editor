export interface FetchOpenApiResult {
  content?: string
  error?: string
}

const ACCEPT =
  'application/yaml, application/x-yaml, text/yaml, text/x-yaml, application/json, text/plain, */*'

const CORS_HINT =
  'The server may not allow cross-origin requests (CORS). Download the file and use the Upload tab instead.'

/**
 * Fetches an OpenAPI document directly from the browser.
 *
 * There is no server-side proxy: the target must allow cross-origin requests.
 * When it doesn't, the browser reports a generic network error, so the message
 * points the user to the Upload tab instead.
 */
export async function fetchOpenApiFromUrl(
  url: string,
  { signal }: { signal?: AbortSignal } = {},
): Promise<FetchOpenApiResult> {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url.trim())
  } catch {
    return { error: 'Invalid URL format.' }
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return { error: 'Invalid URL protocol. Only HTTP and HTTPS are allowed.' }
  }

  let response: Response
  try {
    response = await fetch(parsedUrl, {
      headers: { Accept: ACCEPT },
      mode: 'cors',
      credentials: 'omit',
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { error: 'The request was cancelled.' }
    }
    return { error: `Couldn't fetch ${parsedUrl.host}. ${CORS_HINT}` }
  }

  if (!response.ok) {
    const status = `${response.status} ${response.statusText}`.trim()
    return { error: `Failed to fetch: ${status}.` }
  }

  const content = await response.text()
  if (!content.trim()) {
    return { error: 'The URL returned empty content.' }
  }

  return { content }
}
