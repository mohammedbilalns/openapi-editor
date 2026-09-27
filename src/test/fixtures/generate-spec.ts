/**
 * Deterministic generator for large, realistic OpenAPI 3.0 documents.
 *
 * Used by the benchmark (bench/core.bench.ts) and the performance guard test.
 * Fixtures are generated at run time and never committed: the "large" preset
 * produces a ~10 MB YAML document (Stripe/GitHub-sized).
 */
import * as YAML from 'yaml';

export interface SpecSize {
  /** number of distinct paths (each gets 1-4 operations) */
  paths: number;
  /** number of components.schemas entries */
  schemas: number;
  /** number of tags */
  tags: number;
  seed?: number;
}

export const SIZES = {
  small: { paths: 40, schemas: 30, tags: 5 },
  medium: { paths: 300, schemas: 200, tags: 20 },
  large: { paths: 2000, schemas: 1500, tags: 60 },
  xlarge: { paths: 3000, schemas: 2000, tags: 80 },
} satisfies Record<string, SpecSize>;

/** mulberry32: tiny deterministic PRNG */
function prng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    chance: (p: number) => next() < p,
  };
}

const NOUNS = [
  'account', 'customer', 'invoice', 'charge', 'refund', 'payout', 'transfer', 'balance',
  'subscription', 'plan', 'price', 'product', 'coupon', 'discount', 'dispute', 'event',
  'file', 'mandate', 'order', 'quote', 'review', 'session', 'source', 'token', 'webhook',
  'repository', 'issue', 'comment', 'commit', 'branch', 'release', 'deployment', 'workflow',
  'artifact', 'secret', 'team', 'member', 'organization', 'project', 'label', 'milestone',
  'pod', 'node', 'service', 'volume', 'namespace', 'ingress', 'job', 'secretKey', 'configMap',
] as const;
const WORDS = [
  'the', 'resource', 'identifier', 'returned', 'when', 'object', 'value', 'current', 'status',
  'created', 'updated', 'time', 'unique', 'amount', 'currency', 'optional', 'list', 'field',
  'describes', 'associated', 'with', 'this', 'request', 'response', 'client', 'server', 'used',
] as const;
const FORMATS = ['date-time', 'email', 'uuid', 'uri', 'hostname', 'byte'] as const;

const pascal = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function generateSpec(size: SpecSize): Record<string, unknown> {
  const r = prng(size.seed ?? 42);
  const sentence = (min = 3, max = 8) => {
    const n = r.int(min, max);
    const words: string[] = [];
    for (let i = 0; i < n; i++) words.push(r.pick(WORDS));
    const s = words.join(' ');
    return pascal(s) + '.';
  };

  const tags = Array.from({ length: size.tags }, (_, i) => ({
    name: `${r.pick(NOUNS)}-${i}`,
    description: sentence(),
  }));

  // ---- schemas ----
  const schemaNames = Array.from({ length: size.schemas }, (_, i) => `${pascal(r.pick(NOUNS))}${pascal(r.pick(NOUNS))}${i}`);
  schemaNames[0] = 'Error';
  const ref = (i: number) => ({ $ref: `#/components/schemas/${schemaNames[i]}` });
  const anyRef = () => ref(r.int(0, size.schemas - 1));

  const primitive = (): Record<string, unknown> => {
    const kind = r.int(0, 9);
    if (kind <= 3) {
      const s: Record<string, unknown> = { type: 'string', description: sentence() };
      if (r.chance(0.4)) s.format = r.pick(FORMATS);
      if (r.chance(0.2)) s.maxLength = r.int(8, 5000);
      if (r.chance(0.1)) s.pattern = '^[a-z0-9_]+$';
      if (r.chance(0.3)) s.example = `${r.pick(NOUNS)}_${r.int(1000, 9999)}`;
      if (r.chance(0.15)) s.nullable = true;
      return s;
    }
    if (kind <= 5) {
      const s: Record<string, unknown> = { type: 'integer', description: sentence() };
      if (r.chance(0.5)) s.format = 'int64';
      if (r.chance(0.3)) s.minimum = 0;
      if (r.chance(0.2)) s.maximum = r.int(100, 100000);
      if (r.chance(0.2)) s.default = r.int(0, 100);
      return s;
    }
    if (kind === 6) return { type: 'number', format: 'double', description: sentence() };
    if (kind === 7) return { type: 'boolean', description: sentence(), default: r.chance(0.5) };
    if (kind === 8) {
      return {
        type: 'string',
        enum: Array.from({ length: r.int(2, 6) }, (_, i) => `${r.pick(WORDS)}_${i}`),
        description: sentence(),
      };
    }
    return { type: 'array', items: { type: 'string' }, description: sentence() };
  };

  const inlineObject = (depth: number): Record<string, unknown> => {
    const properties: Record<string, unknown> = {};
    const n = r.int(2, 5);
    for (let i = 0; i < n; i++) {
      properties[`${r.pick(WORDS)}_${i}`] =
        depth > 0 && r.chance(0.3) ? inlineObject(depth - 1) : r.chance(0.2) ? anyRef() : primitive();
    }
    return { type: 'object', properties, required: Object.keys(properties).slice(0, 1) };
  };

  const objectSchema = (): Record<string, unknown> => {
    const properties: Record<string, unknown> = { id: { type: 'string', description: 'Unique identifier.', example: 'obj_123' } };
    const n = r.int(4, 14);
    for (let i = 0; i < n; i++) {
      const name = `${r.pick(WORDS)}_${r.pick(NOUNS)}_${i}`;
      const k = r.int(0, 9);
      if (k <= 5) properties[name] = primitive();
      else if (k === 6) properties[name] = anyRef();
      else if (k === 7) properties[name] = { type: 'array', items: anyRef(), description: sentence() };
      else properties[name] = inlineObject(2);
    }
    const keys = Object.keys(properties);
    return {
      type: 'object',
      description: sentence(4, 12),
      properties,
      required: keys.filter((_, i) => i === 0 || r.chance(0.25)),
    };
  };

  const schemas: Record<string, unknown> = {};
  schemaNames.forEach((name, i) => {
    if (i === 0) {
      schemas[name] = {
        type: 'object',
        properties: { code: { type: 'string' }, message: { type: 'string' }, param: { type: 'string', nullable: true } },
        required: ['code', 'message'],
      };
      return;
    }
    const k = r.int(0, 99);
    if (k < 70) schemas[name] = objectSchema();
    else if (k < 78) schemas[name] = { type: 'string', enum: Array.from({ length: r.int(3, 8) }, (_, j) => `${r.pick(NOUNS)}_${j}`), description: sentence() };
    else if (k < 85) schemas[name] = { allOf: [anyRef(), inlineObject(1)], description: sentence() };
    else if (k < 92) schemas[name] = { oneOf: [anyRef(), anyRef(), anyRef()], discriminator: { propertyName: 'object' } };
    else if (k < 95) schemas[name] = { anyOf: [anyRef(), primitive()] };
    else schemas[name] = { type: 'array', items: anyRef(), description: sentence() };
  });

  // ---- paths ----
  const paths: Record<string, unknown> = {};
  let opCount = 0;
  const errorResponses = {
    '400': { description: 'Bad request', content: { 'application/json': { schema: ref(0) } } },
    '404': { description: 'Not found', content: { 'application/json': { schema: ref(0) } } },
    '500': { description: 'Server error', content: { 'application/json': { schema: ref(0) } } },
  };
  for (let p = 0; p < size.paths; p++) {
    const res = r.pick(NOUNS);
    const shape = r.int(0, 2);
    const path =
      shape === 0 ? `/v1/${res}s/${p}` :
      shape === 1 ? `/v1/${res}s/${p}/{${res}_id}` :
      `/v1/${res}s/{${res}_id}/items${p}/{item_id}`;
    const pathParams = Array.from(path.matchAll(/\{([^}]+)\}/g), (m) => m[1]);
    const methods = ['get', ...['post', 'put', 'patch', 'delete'].filter(() => r.chance(0.4))];
    const item: Record<string, unknown> = {};
    for (const method of methods) {
      const bodySchema = anyRef();
      const parameters: Record<string, unknown>[] = pathParams.map((name) => ({
        name, in: 'path', required: true, description: sentence(), schema: { type: 'string' },
      }));
      if (method === 'get') {
        parameters.push(
          { name: 'limit', in: 'query', description: sentence(), schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 } },
          { name: 'starting_after', in: 'query', schema: { type: 'string' } },
        );
        if (r.chance(0.5)) parameters.push({ name: 'expand', in: 'query', schema: { type: 'array', items: { type: 'string' } } });
      }
      if (r.chance(0.2)) parameters.push({ name: 'Idempotency-Key', in: 'header', schema: { type: 'string', maxLength: 255 } });

      const op: Record<string, unknown> = {
        summary: sentence(3, 8),
        description: sentence(4, 12),
        operationId: `${method}${pascal(res)}${p}`,
        tags: [r.pick(tags).name],
        parameters,
        responses: {
          [method === 'post' ? '201' : method === 'delete' ? '204' : '200']:
            method === 'delete'
              ? { description: 'Deleted' }
              : r.chance(0.5)
                ? { description: 'Success', content: { 'application/json': { schema: bodySchema } } }
                : {
                    description: 'A paginated list',
                    content: {
                      'application/json': {
                        schema: {
                          type: 'object',
                          properties: {
                            data: { type: 'array', items: bodySchema },
                            has_more: { type: 'boolean' },
                            url: { type: 'string', format: 'uri' },
                          },
                          required: ['data', 'has_more'],
                        },
                      },
                    },
                  },
          ...errorResponses,
        },
        security: r.chance(0.7) ? [{ bearerAuth: [] }] : [{ oauth2: ['read', 'write'] }],
      };
      if (method === 'post' || method === 'put' || method === 'patch') {
        op.requestBody = {
          required: true,
          content: {
            'application/json': { schema: r.chance(0.6) ? bodySchema : inlineObject(1) },
          },
        };
      }
      if (r.chance(0.03)) op.deprecated = true;
      item[method] = op;
      opCount++;
    }
    paths[path] = item;
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'Generated Large API',
      version: '2024-06-20',
      description: sentence(40, 120),
      contact: { name: 'API Support', email: 'support@example.com' },
      license: { name: 'MIT' },
    },
    servers: [
      { url: 'https://api.example.com', description: 'Production' },
      { url: 'https://sandbox.example.com', description: 'Sandbox' },
    ],
    tags,
    paths,
    components: {
      schemas,
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        apiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
        oauth2: {
          type: 'oauth2',
          flows: {
            authorizationCode: {
              authorizationUrl: 'https://example.com/oauth/authorize',
              tokenUrl: 'https://example.com/oauth/token',
              scopes: { read: 'Read access', write: 'Write access' },
            },
          },
        },
      },
    },
    'x-generated-operations': opCount,
  };
}

export function generateSpecYaml(size: SpecSize): string {
  return YAML.stringify(generateSpec(size), { lineWidth: 0, aliasDuplicateObjects: false });
}

export function generateSpecJson(size: SpecSize): string {
  return JSON.stringify(generateSpec(size), null, 2);
}
