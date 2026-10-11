import { describe, expect, it } from 'vitest';
import { WebWorkspaceAdapter } from '../../workspace';
import { resolveMultiFileSpec } from './resolver';

describe('resolveMultiFileSpec', () => {
  it('resolves external schema files referenced in components.schemas', async () => {
    const adapter = new WebWorkspaceAdapter({
      'openapi.yaml': `
openapi: 3.0.3
info:
  title: Test API
  version: 1.0.0
paths: {}
components:
  schemas:
    User:
      $ref: './schemas/user.yaml'
`,
      'schemas/user.yaml': `
type: object
description: User profile
properties:
  id:
    type: string
  name:
    type: string
required:
  - id
  - name
`,
    });

    const result = await resolveMultiFileSpec(adapter, 'openapi.yaml');
    expect(result.document).not.toBeNull();
    expect(result.loadedFiles).toContain('openapi.yaml');
    expect(result.loadedFiles).toContain('schemas/user.yaml');

    const userSchema = Array.from(result.document.schemas.values()).find((s) => s.name === 'User');
    expect(userSchema).toBeDefined();
    expect(userSchema?.type).toBe('object');
    expect(userSchema?.description).toBe('User profile');
    expect(userSchema?.properties?.get('id')?.schema).toEqual({
      kind: 'inline',
      schema: expect.objectContaining({ type: 'string' }),
    });
    expect(userSchema?.origin).toEqual({
      filePath: 'schemas/user.yaml',
      isStandaloneFile: true,
    });
  });

  it('resolves external path item files referenced in paths', async () => {
    const adapter = new WebWorkspaceAdapter({
      'openapi.yaml': `
openapi: 3.0.3
info:
  title: Test API
  version: 1.0.0
paths:
  /users:
    $ref: './paths/users.yaml'
`,
      'paths/users.yaml': `
get:
  summary: List all users
  responses:
    '200':
      description: OK
post:
  summary: Create user
  responses:
    '201':
      description: Created
`,
    });

    const result = await resolveMultiFileSpec(adapter, 'openapi.yaml');
    expect(result.document).not.toBeNull();
    expect(result.loadedFiles).toContain('paths/users.yaml');

    const routes = Array.from(result.document.routes.values()).filter((r) => r.path === '/users');
    expect(routes).toHaveLength(2);

    const getRoute = routes.find((r) => r.method === 'get');
    expect(getRoute?.summary).toBe('List all users');
    expect(getRoute?.origin).toEqual({
      filePath: 'paths/users.yaml',
      isStandaloneFile: true,
    });

    const postRoute = routes.find((r) => r.method === 'post');
    expect(postRoute?.summary).toBe('Create user');
    expect(postRoute?.origin).toEqual({
      filePath: 'paths/users.yaml',
      isStandaloneFile: true,
    });
  });

  it('resolves nested schema references across multiple files', async () => {
    const adapter = new WebWorkspaceAdapter({
      'openapi.yaml': `
openapi: 3.0.3
info:
  title: Store API
  version: 1.0.0
paths: {}
components:
  schemas:
    Order:
      $ref: './schemas/order.yaml'
`,
      'schemas/order.yaml': `
type: object
properties:
  orderId:
    type: string
  item:
    $ref: './item.yaml'
`,
      'schemas/item.yaml': `
type: object
properties:
  name:
    type: string
  price:
    type: number
`,
    });

    const result = await resolveMultiFileSpec(adapter, 'openapi.yaml');
    expect(result.document).not.toBeNull();
    expect(result.loadedFiles).toContain('schemas/order.yaml');
    expect(result.loadedFiles).toContain('schemas/item.yaml');

    const orderSchema = Array.from(result.document.schemas.values()).find((s) => s.name === 'Order');
    expect(orderSchema).toBeDefined();

    const itemProp = orderSchema?.properties?.get('item');
    expect(itemProp).toBeDefined();
    expect(itemProp?.schema.kind).toBe('ref');

    const targetId = itemProp && itemProp.schema.kind === 'ref' ? itemProp.schema.targetId : '';
    const itemSchema = result.document.schemas.get(targetId);
    expect(itemSchema).toBeDefined();
    expect(itemSchema?.name).toBe('Item');
    expect(itemSchema?.origin).toEqual({
      filePath: 'schemas/item.yaml',
      isStandaloneFile: true,
    });
  });

  it('handles missing external files with warnings without throwing', async () => {
    const adapter = new WebWorkspaceAdapter({
      'openapi.yaml': `
openapi: 3.0.3
info:
  title: Test API
  version: 1.0.0
paths: {}
components:
  schemas:
    Missing:
      $ref: './schemas/non_existent.yaml'
`,
    });

    const result = await resolveMultiFileSpec(adapter, 'openapi.yaml');
    expect(result.document).not.toBeNull();
    const warning = result.errors.find((e) => e.code === 'EXTERNAL_FILE_NOT_FOUND');
    expect(warning).toBeDefined();
    expect(warning?.severity).toBe('warning');
  });

  it('resolves paths with JSON pointer fragments pointing to multi-path files (like buildathon/api)', async () => {
    const adapter = new WebWorkspaceAdapter({
      'openapi.json': JSON.stringify({
        openapi: '3.0.0',
        info: { title: 'Test Multi Path', version: '1.0.0' },
        components: {
          securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer' },
          },
          schemas: {
            User: { $ref: './schemas/user.json' },
          },
        },
        paths: {
          '/auth/login': { $ref: './paths/auth.json#/~1auth~1login' },
          '/auth/refresh': { $ref: './paths/auth.json#/~1auth~1refresh' },
        },
      }),
      'paths/auth.json': JSON.stringify({
        '/auth/login': {
          post: {
            summary: 'Login User',
            security: [{ bearerAuth: [] }],
            responses: {
              '200': {
                description: 'OK',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        user: { $ref: '../schemas/user.json' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        '/auth/refresh': {
          post: {
            summary: 'Refresh Token',
            security: [{ bearerAuth: [] }],
            responses: { '200': { description: 'OK' } },
          },
        },
      }),
      'schemas/user.json': JSON.stringify({
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
        },
      }),
    });

    const result = await resolveMultiFileSpec(adapter, 'openapi.json');
    expect(result.errors).toHaveLength(0);
    expect(result.loadedFiles).toContain('openapi.json');
    expect(result.loadedFiles).toContain('paths/auth.json');
    expect(result.loadedFiles).toContain('schemas/user.json');
    expect(result.document.routes.size).toBe(2);

    const loginRoute = Array.from(result.document.routes.values()).find((r) => r.path === '/auth/login');
    expect(loginRoute).toBeDefined();
    expect(loginRoute?.summary).toBe('Login User');
    expect(loginRoute?.origin).toEqual({
      filePath: 'paths/auth.json',
      isStandaloneFile: true,
      jsonPointer: '/~1auth~1login',
    });

    const refreshRoute = Array.from(result.document.routes.values()).find((r) => r.path === '/auth/refresh');
    expect(refreshRoute).toBeDefined();
    expect(refreshRoute?.summary).toBe('Refresh Token');
    expect(refreshRoute?.origin).toEqual({
      filePath: 'paths/auth.json',
      isStandaloneFile: true,
      jsonPointer: '/~1auth~1refresh',
    });

    // Check that nested user ref was resolved to schema node
    const userSchema = Array.from(result.document.schemas.values()).find((s) => s.name === 'User');
    expect(userSchema).toBeDefined();
    expect(userSchema?.properties?.has('id')).toBe(true);

    const resp = loginRoute?.responses.get('200');
    const media = resp?.content?.get('application/json');
    expect(media).toBeDefined();
    const mediaSchema = media?.schema;
    expect(mediaSchema?.kind).toBe('inline');
    const inlineSchema = mediaSchema?.kind === 'inline' ? mediaSchema.schema : null;
    const userProp = inlineSchema?.properties?.get('user');
    expect(userProp?.schema).toEqual({ kind: 'ref', targetId: userSchema?.id });
  });

  it('resolves schemas with JSON pointer fragments', async () => {
    const adapter = new WebWorkspaceAdapter({
      'openapi.yaml': `
openapi: 3.0.3
info:
  title: Test API
  version: 1.0.0
paths: {}
components:
  schemas:
    Admin:
      $ref: './schemas/models.json#/definitions/Admin'
`,
      'schemas/models.json': JSON.stringify({
        definitions: {
          Admin: {
            type: 'object',
            properties: {
              role: { type: 'string' },
            },
          },
        },
      }),
    });

    const result = await resolveMultiFileSpec(adapter, 'openapi.yaml');
    expect(result.errors).toHaveLength(0);
    expect(result.loadedFiles).toContain('schemas/models.json');

    const adminSchema = Array.from(result.document.schemas.values()).find((s) => s.name === 'Admin');
    expect(adminSchema).toBeDefined();
    expect(adminSchema?.properties?.get('role')).toBeDefined();
    expect(adminSchema?.origin).toEqual({
      filePath: 'schemas/models.json',
      isStandaloneFile: true,
      jsonPointer: '/definitions/Admin',
    });
  });
});
