'use server';

export async function fetchOpenApiFromUrl(url: string): Promise<{ content?: string; error?: string }> {
  try {
    // Validate URL
    const parsedUrl = new URL(url);
    
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return { error: 'Invalid URL protocol. Only HTTP and HTTPS are allowed.' };
    }

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/yaml, application/x-yaml, text/yaml, text/x-yaml, application/json, text/plain, */*',
        'User-Agent': 'OpenAPI-Editor/1.0',
      },
    });

    if (!response.ok) {
      return { error: `Failed to fetch: ${response.status} ${response.statusText}` };
    }

    const content = await response.text();
    
    if (!content.trim()) {
      return { error: 'The URL returned empty content.' };
    }

    return { content };
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('URL')) {
      return { error: 'Invalid URL format.' };
    }
    return { error: error instanceof Error ? error.message : 'Failed to fetch URL' };
  }
}
