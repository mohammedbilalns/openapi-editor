import { describe, expect, it } from 'vitest';
import {
  decodeJsonPointerToken,
  encodeJsonPointerToken,
  resolveJsonPointer,
} from './pointer';

describe('JSON pointer utilities (RFC 6901)', () => {
  it('encodes and decodes JSON pointer tokens according to RFC 6901', () => {
    expect(encodeJsonPointerToken('/auth/login')).toBe('~1auth~1login');
    expect(encodeJsonPointerToken('user~name/profile')).toBe('user~0name~1profile');

    expect(decodeJsonPointerToken('~1auth~1login')).toBe('/auth/login');
    expect(decodeJsonPointerToken('user~0name~1profile')).toBe('user~name/profile');
  });

  it('handles empty or root pointers', () => {
    const data = { hello: 'world' };
    expect(resolveJsonPointer(data, '')).toBe(data);
    expect(resolveJsonPointer(data, '#')).toBe(data);
  });

  it('resolves JSON pointers inside nested objects and arrays', () => {
    const data = {
      paths: {
        '/auth/login': {
          post: { summary: 'Login' },
        },
      },
      definitions: [
        { name: 'Admin' },
        { name: 'User' },
      ],
    };

    expect(resolveJsonPointer(data, '#/paths/~1auth~1login/post')).toEqual({ summary: 'Login' });
    expect(resolveJsonPointer(data, '/definitions/1')).toEqual({ name: 'User' });
    expect(resolveJsonPointer(data, '#/definitions/0/name')).toBe('Admin');
    expect(resolveJsonPointer(data, '#/non_existent/path')).toBeUndefined();
  });

  it('returns undefined when traversing non-object/primitive nodes or invalid array indices', () => {
    const data = { count: 42, list: ['a', 'b'] };
    expect(resolveJsonPointer(data, '#/count/sub')).toBeUndefined();
    expect(resolveJsonPointer(data, '#/list/99')).toBeUndefined();
    expect(resolveJsonPointer(data, '#/list/-1')).toBeUndefined();
    expect(resolveJsonPointer(data, '#/list/invalid')).toBeUndefined();
  });
});
