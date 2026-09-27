/**
 * Comprehensive list of HTTP status codes for OpenAPI responses
 * Organized by category for better searchability
 */

export interface HttpStatusCode {
  value: string;
  label: string;
  category: 'informational' | 'success' | 'redirection' | 'client-error' | 'server-error';
}

export const HTTP_STATUS_CODES: HttpStatusCode[] = [
  // 1xx Informational
  { value: '100', label: '100 Continue', category: 'informational' },
  { value: '101', label: '101 Switching Protocols', category: 'informational' },
  { value: '102', label: '102 Processing', category: 'informational' },
  { value: '103', label: '103 Early Hints', category: 'informational' },

  // 2xx Success
  { value: '200', label: '200 OK', category: 'success' },
  { value: '201', label: '201 Created', category: 'success' },
  { value: '202', label: '202 Accepted', category: 'success' },
  { value: '203', label: '203 Non-Authoritative Information', category: 'success' },
  { value: '204', label: '204 No Content', category: 'success' },
  { value: '205', label: '205 Reset Content', category: 'success' },
  { value: '206', label: '206 Partial Content', category: 'success' },
  { value: '207', label: '207 Multi-Status', category: 'success' },
  { value: '208', label: '208 Already Reported', category: 'success' },
  { value: '226', label: '226 IM Used', category: 'success' },

  // 3xx Redirection
  { value: '300', label: '300 Multiple Choices', category: 'redirection' },
  { value: '301', label: '301 Moved Permanently', category: 'redirection' },
  { value: '302', label: '302 Found', category: 'redirection' },
  { value: '303', label: '303 See Other', category: 'redirection' },
  { value: '304', label: '304 Not Modified', category: 'redirection' },
  { value: '305', label: '305 Use Proxy', category: 'redirection' },
  { value: '307', label: '307 Temporary Redirect', category: 'redirection' },
  { value: '308', label: '308 Permanent Redirect', category: 'redirection' },

  // 4xx Client Errors
  { value: '400', label: '400 Bad Request', category: 'client-error' },
  { value: '401', label: '401 Unauthorized', category: 'client-error' },
  { value: '402', label: '402 Payment Required', category: 'client-error' },
  { value: '403', label: '403 Forbidden', category: 'client-error' },
  { value: '404', label: '404 Not Found', category: 'client-error' },
  { value: '405', label: '405 Method Not Allowed', category: 'client-error' },
  { value: '406', label: '406 Not Acceptable', category: 'client-error' },
  { value: '407', label: '407 Proxy Authentication Required', category: 'client-error' },
  { value: '408', label: '408 Request Timeout', category: 'client-error' },
  { value: '409', label: '409 Conflict', category: 'client-error' },
  { value: '410', label: '410 Gone', category: 'client-error' },
  { value: '411', label: '411 Length Required', category: 'client-error' },
  { value: '412', label: '412 Precondition Failed', category: 'client-error' },
  { value: '413', label: '413 Payload Too Large', category: 'client-error' },
  { value: '414', label: '414 URI Too Long', category: 'client-error' },
  { value: '415', label: '415 Unsupported Media Type', category: 'client-error' },
  { value: '416', label: '416 Range Not Satisfiable', category: 'client-error' },
  { value: '417', label: '417 Expectation Failed', category: 'client-error' },
  { value: '418', label: "418 I'm a Teapot", category: 'client-error' },
  { value: '421', label: '421 Misdirected Request', category: 'client-error' },
  { value: '422', label: '422 Unprocessable Entity', category: 'client-error' },
  { value: '423', label: '423 Locked', category: 'client-error' },
  { value: '424', label: '424 Failed Dependency', category: 'client-error' },
  { value: '425', label: '425 Too Early', category: 'client-error' },
  { value: '426', label: '426 Upgrade Required', category: 'client-error' },
  { value: '428', label: '428 Precondition Required', category: 'client-error' },
  { value: '429', label: '429 Too Many Requests', category: 'client-error' },
  { value: '431', label: '431 Request Header Fields Too Large', category: 'client-error' },
  { value: '451', label: '451 Unavailable For Legal Reasons', category: 'client-error' },

  // 5xx Server Errors
  { value: '500', label: '500 Internal Server Error', category: 'server-error' },
  { value: '501', label: '501 Not Implemented', category: 'server-error' },
  { value: '502', label: '502 Bad Gateway', category: 'server-error' },
  { value: '503', label: '503 Service Unavailable', category: 'server-error' },
  { value: '504', label: '504 Gateway Timeout', category: 'server-error' },
  { value: '505', label: '505 HTTP Version Not Supported', category: 'server-error' },
  { value: '506', label: '506 Variant Also Negotiates', category: 'server-error' },
  { value: '507', label: '507 Insufficient Storage', category: 'server-error' },
  { value: '508', label: '508 Loop Detected', category: 'server-error' },
  { value: '510', label: '510 Not Extended', category: 'server-error' },
  { value: '511', label: '511 Network Authentication Required', category: 'server-error' },
];

/**
 * Get the color class for a status code
 */
export function getStatusCodeColor(code: string): string {
  if (code.startsWith('1')) return 'bg-gray-500';
  if (code.startsWith('2')) return 'bg-green-500';
  if (code.startsWith('3')) return 'bg-blue-500';
  if (code.startsWith('4')) return 'bg-amber-500';
  if (code.startsWith('5')) return 'bg-red-500';
  return 'bg-gray-500';
}

/**
 * Get category label for display
 */
export function getCategoryLabel(category: HttpStatusCode['category']): string {
  switch (category) {
    case 'informational': return '1xx Informational';
    case 'success': return '2xx Success';
    case 'redirection': return '3xx Redirection';
    case 'client-error': return '4xx Client Error';
    case 'server-error': return '5xx Server Error';
  }
}

/**
 * Group status codes by category
 */
export function getGroupedStatusCodes(): Record<HttpStatusCode['category'], HttpStatusCode[]> {
  return HTTP_STATUS_CODES.reduce((acc, code) => {
    if (!acc[code.category]) {
      acc[code.category] = [];
    }
    acc[code.category].push(code);
    return acc;
  }, {} as Record<HttpStatusCode['category'], HttpStatusCode[]>);
}
