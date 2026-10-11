import { describe, expect, it } from 'vitest';
import { WebWorkspaceAdapter } from '../../workspace';
import { resolveMultiFileSpec, resolveRelativePath } from './resolver';

describe('resolveRelativePath', () => {
  it('resolves direct relative sibling and child paths', () => {
    expect(resolveRelativePath('openapi.yaml', './schemas/user.yaml')).toBe('schemas/user.yaml');
    expect(resolveRelativePath('openapi.yaml', 'schemas/user.yaml')).toBe('schemas/user.yaml');
    expect(resolveRelativePath('src/api/openapi.yaml', './schemas/user.yaml')).toBe('src/api/schemas/user.yaml');
  });

  it('resolves parent directory traversals', () => {
    expect(resolveRelativePath('paths/users.yaml', '../schemas/user.yaml')).toBe('schemas/user.yaml');
    expect(resolveRelativePath('apis/v1/paths/users.yaml', '../../common/error.yaml')).toBe('apis/common/error.yaml');
  });

  it('strips json pointer fragments before resolving path', () => {
    expect(resolveRelativePath('openapi.yaml', './schemas/models.yaml#/definitions/User')).toBe('schemas/models.yaml');
  });
});

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
});
