import { describe, expect, it } from 'vitest';
import {
  deriveSchemaName,
  makeRelativeRef,
  resolveRefPath,
  resolveRelativePath,
} from './path-utils';

describe('path-utils', () => {
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

  describe('resolveRefPath', () => {
    it('extracts path and fragment cleanly', () => {
      expect(resolveRefPath('openapi.yaml', './schemas/models.yaml#/definitions/User')).toEqual({
        filePath: 'schemas/models.yaml',
        fragment: '/definitions/User',
      });
      expect(resolveRefPath('openapi.yaml', './paths/auth.json#/~1auth~1login')).toEqual({
        filePath: 'paths/auth.json',
        fragment: '/~1auth~1login',
      });
      expect(resolveRefPath('openapi.yaml', './schemas/user.yaml')).toEqual({
        filePath: 'schemas/user.yaml',
        fragment: undefined,
      });
    });
  });

  describe('deriveSchemaName', () => {
    it('derives pascal-cased schema names from file basenames', () => {
      expect(deriveSchemaName('schemas/user.yaml')).toBe('User');
      expect(deriveSchemaName('schemas/user-profile.json')).toBe('UserProfile');
      expect(deriveSchemaName('schemas/driver_document.yml')).toBe('DriverDocument');
    });
  });

  describe('makeRelativeRef', () => {
    it('calculates relative path string from entry file to target file', () => {
      expect(makeRelativeRef('openapi.yaml', 'schemas/user.yaml')).toBe('./schemas/user.yaml');
      expect(makeRelativeRef('api/v1/openapi.yaml', 'api/v1/schemas/user.yaml')).toBe('./schemas/user.yaml');
      expect(makeRelativeRef('api/v1/openapi.yaml', 'common/error.yaml')).toBe('../../common/error.yaml');
    });
  });
});
