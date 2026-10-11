import type { WorkspaceAdapter } from '../../workspace';
import {
  serializeStandalonePathItemObject,
  serializeStandaloneSchemaObject,
  serializeToJson,
  serializeToYaml,
  stringifyYaml,
} from '../serializer';
import type { ApiDocument, ExtraFields, Route, SchemaNode } from '../types';

/**
 * Calculates relative reference string from the directory of `entryFile` to `targetFile`.
 * e.g. entryFile = "openapi.yaml", targetFile = "schemas/user.yaml" -> "./schemas/user.yaml"
 */
function makeRelativeRef(fromEntryFile: string, targetFile: string): string {
  const fromDir = fromEntryFile.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
  if (!fromDir) {
    return `./${targetFile.replace(/^\.?\//, '')}`;
  }
  const fromParts = fromDir.split('/').filter(Boolean);
  const targetParts = targetFile.replace(/^\.?\//, '').split('/').filter(Boolean);

  let common = 0;
  while (common < fromParts.length && common < targetParts.length && fromParts[common] === targetParts[common]) {
    common++;
  }

  const up = fromParts.length - common;
  const rel = [...Array(up).fill('..'), ...targetParts.slice(common)].join('/');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

function formatFileContent(contentObj: unknown, filePath: string): string {
  if (filePath.toLowerCase().endsWith('.json')) {
    return JSON.stringify(contentObj, null, 2) + '\n';
  }
  return stringifyYaml(contentObj);
}

/**
 * Serializes an ApiDocument into a multi-file collection.
 * Standalone schemas and path items are serialized to their respective files,
 * and the entry file keeps $ref pointers to them.
 */
export function serializeMultiFileDocument(
  doc: ApiDocument,
  entryFile: string,
): Map<string, string> {
  const files = new Map<string, string>();

  // 1. Serialize standalone schemas
  for (const schema of doc.schemas.values()) {
    if (schema.origin?.isStandaloneFile) {
      const obj = serializeStandaloneSchemaObject(schema, doc);
      files.set(schema.origin.filePath, formatFileContent(obj, schema.origin.filePath));
    }
  }

  // 2. Serialize standalone path items
  const standalonePathFiles = new Map<string, Route[]>();
  for (const route of doc.routes.values()) {
    if (route.origin?.isStandaloneFile) {
      const list = standalonePathFiles.get(route.origin.filePath) ?? [];
      list.push(route);
      standalonePathFiles.set(route.origin.filePath, list);
    }
  }

  for (const [filePath, routes] of standalonePathFiles) {
    const isMultiPathFile = routes.some(
      (r) => r.path !== routes[0].path || Boolean(r.origin?.jsonPointer),
    );
    if (isMultiPathFile) {
      const byPath = new Map<string, Route[]>();
      for (const r of routes) {
        const list = byPath.get(r.path) ?? [];
        list.push(r);
        byPath.set(r.path, list);
      }
      const multiPathObj: Record<string, unknown> = {};
      for (const [path, pathRoutes] of byPath) {
        multiPathObj[path] = serializeStandalonePathItemObject(pathRoutes, doc);
      }
      files.set(filePath, formatFileContent(multiPathObj, filePath));
    } else {
      const singlePathObj = serializeStandalonePathItemObject(routes, doc);
      files.set(filePath, formatFileContent(singlePathObj, filePath));
    }
  }

  // 3. Construct root document with external $refs for standalone entities
  const rootDoc: ApiDocument = {
    ...doc,
    schemas: new Map(),
    routes: new Map(),
    extra: doc.extra ? { ...doc.extra } : undefined,
  };

  for (const [id, schema] of doc.schemas) {
    if (schema.origin?.isStandaloneFile) {
      const relRef = makeRelativeRef(entryFile, schema.origin.filePath);
      const pointer = schema.origin.jsonPointer;
      const fullRef = pointer ? `${relRef}#${pointer}` : relRef;
      // Replace with external $ref placeholder for root components.schemas
      const refPlaceholder: SchemaNode = {
        ...schema,
        extraKeywords: { $ref: fullRef, ...schema.extraKeywords },
      };
      rootDoc.schemas.set(id, refPlaceholder);
    } else {
      rootDoc.schemas.set(id, schema);
    }
  }

  const externalPathItems: Record<string, { $ref: string }> = {};
  for (const [id, route] of doc.routes) {
    if (route.origin?.isStandaloneFile) {
      const relRef = makeRelativeRef(entryFile, route.origin.filePath);
      const pointer = route.origin.jsonPointer;
      const fullRef = pointer ? `${relRef}#${pointer}` : relRef;
      externalPathItems[route.path] = { $ref: fullRef };
    } else {
      rootDoc.routes.set(id, route);
    }
  }

  if (Object.keys(externalPathItems).length > 0) {
    const extraPaths: ExtraFields = {
      ...(rootDoc.extra?.paths as ExtraFields | undefined),
      ...externalPathItems,
    };
    rootDoc.extra = {
      ...rootDoc.extra,
      paths: extraPaths,
    };
  }

  // Serialize root entry file
  if (entryFile.toLowerCase().endsWith('.json')) {
    files.set(entryFile, serializeToJson(rootDoc));
  } else {
    files.set(entryFile, serializeToYaml(rootDoc));
  }

  return files;
}

/**
 * Persists all modified files of a multi-file OpenAPI project to the workspace.
 */
export async function saveMultiFileProject(
  adapter: WorkspaceAdapter,
  doc: ApiDocument,
  entryFile: string,
  dirtyFiles?: Set<string>,
): Promise<{ writtenFiles: string[] }> {
  const files = serializeMultiFileDocument(doc, entryFile);
  const writtenFiles: string[] = [];

  for (const [filePath, content] of files) {
    if (dirtyFiles && !dirtyFiles.has(filePath)) {
      continue;
    }
    await adapter.writeFile(filePath, content);
    writtenFiles.push(filePath);
  }

  return { writtenFiles };
}
