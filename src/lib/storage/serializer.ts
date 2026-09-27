import type { ApiDocument, Route, SchemaNode, ResponseDef, RequestBody, MediaType, PropertyDef } from "@/lib/openapi/types";
import type {
  StoredProject,
  SerializedProject,
  SerializedApiDocument,
  SerializedRoute,
  SerializedSchema,
} from "./types";

/**
 * Serialize a RequestBody (convert content Map to array)
 */
function serializeRequestBody(body: RequestBody): unknown {
  return {
    ...body,
    content: Array.from(body.content.entries()),
  };
}

/**
 * Deserialize a RequestBody (convert content array back to Map)
 */
function deserializeRequestBody(serialized: unknown): RequestBody {
  const body = serialized as { content: [string, MediaType][] } & Omit<RequestBody, 'content'>;
  return {
    ...body,
    content: new Map(body.content),
  };
}

/**
 * Serialize a ResponseDef (convert content and headers Maps to arrays)
 */
function serializeResponse(response: ResponseDef): unknown {
  return {
    ...response,
    content: response.content ? Array.from(response.content.entries()) : undefined,
    headers: response.headers ? Array.from(response.headers.entries()) : undefined,
  };
}

/**
 * Deserialize a ResponseDef (convert arrays back to Maps)
 */
function deserializeResponse(serialized: unknown): ResponseDef {
  const resp = serialized as {
    content?: [string, MediaType][];
    headers?: [string, unknown][];
  } & Omit<ResponseDef, 'content' | 'headers'>;
  
  return {
    ...resp,
    content: resp.content ? new Map(resp.content) : undefined,
    headers: resp.headers ? new Map(resp.headers as [string, Parameters<Map<string, unknown>['set']>[1]][]) : undefined,
  } as ResponseDef;
}

/**
 * Serialize a Route (convert responses Map to array)
 */
function serializeRoute(route: Route): SerializedRoute {
  return {
    id: route.id,
    path: route.path,
    method: route.method,
    summary: route.summary,
    description: route.description,
    operationId: route.operationId,
    tags: route.tags,
    parameters: route.parameters,
    requestBody: route.requestBody ? serializeRequestBody(route.requestBody) : undefined,
    responses: Array.from(route.responses.entries()).map(([status, resp]) => [
      status,
      serializeResponse(resp),
    ]),
    security: route.security,
    deprecated: route.deprecated,
  };
}

/**
 * Deserialize a Route (convert responses array back to Map)
 */
function deserializeRoute(serialized: SerializedRoute): Route {
  return {
    id: serialized.id,
    path: serialized.path,
    method: serialized.method as Route['method'],
    summary: serialized.summary,
    description: serialized.description,
    operationId: serialized.operationId,
    tags: serialized.tags,
    parameters: serialized.parameters as Route['parameters'],
    requestBody: serialized.requestBody ? deserializeRequestBody(serialized.requestBody) : undefined,
    responses: new Map(
      serialized.responses.map(([status, resp]) => [status, deserializeResponse(resp)])
    ),
    security: serialized.security as Route['security'],
    deprecated: serialized.deprecated,
  };
}

/**
 * Serialize a SchemaNode (convert properties Map to array)
 */
function serializeSchema(schema: SchemaNode): SerializedSchema {
  return {
    id: schema.id,
    name: schema.name,
    type: schema.type,
    description: schema.description,
    properties: schema.properties ? Array.from(schema.properties.entries()) : undefined,
    items: schema.items,
    variants: schema.variants,
    enumValues: schema.enumValues,
    required: schema.required,
    format: schema.format,
    example: schema.example,
    default: schema.default,
    minimum: schema.minimum,
    maximum: schema.maximum,
    minLength: schema.minLength,
    maxLength: schema.maxLength,
    pattern: schema.pattern,
    discriminator: schema.discriminator,
  };
}

/**
 * Deserialize a SchemaNode (convert properties array back to Map)
 */
function deserializeSchema(serialized: SerializedSchema): SchemaNode {
  return {
    id: serialized.id,
    name: serialized.name,
    type: serialized.type as SchemaNode['type'],
    description: serialized.description,
    properties: serialized.properties ? new Map(serialized.properties as [string, PropertyDef][]) : undefined,
    items: serialized.items as SchemaNode['items'],
    variants: serialized.variants as SchemaNode['variants'],
    enumValues: serialized.enumValues,
    required: serialized.required,
    format: serialized.format,
    example: serialized.example,
    default: serialized.default,
    minimum: serialized.minimum,
    maximum: serialized.maximum,
    minLength: serialized.minLength,
    maxLength: serialized.maxLength,
    pattern: serialized.pattern,
    discriminator: serialized.discriminator as SchemaNode['discriminator'],
  };
}

/**
 * Serialize an ApiDocument for storage
 * Converts all Map instances to arrays of entries
 */
export function serializeDocument(doc: ApiDocument): SerializedApiDocument {
  return {
    id: doc.id,
    info: doc.info,
    servers: doc.servers,
    routes: Array.from(doc.routes.entries()).map(([id, route]) => [id, serializeRoute(route)]),
    schemas: Array.from(doc.schemas.entries()).map(([id, schema]) => [id, serializeSchema(schema)]),
    securitySchemes: Array.from(doc.securitySchemes.entries()),
    tags: doc.tags,
  };
}

/**
 * Deserialize an ApiDocument from storage
 * Converts arrays back to Map instances
 */
export function deserializeDocument(serialized: SerializedApiDocument): ApiDocument {
  return {
    id: serialized.id,
    info: serialized.info,
    servers: serialized.servers,
    routes: new Map(
      serialized.routes.map(([id, route]) => [id, deserializeRoute(route)])
    ),
    schemas: new Map(
      serialized.schemas.map(([id, schema]) => [id, deserializeSchema(schema)])
    ),
    securitySchemes: new Map(serialized.securitySchemes),
    tags: serialized.tags,
  };
}

/**
 * Serialize a StoredProject for IndexedDB storage
 */
export function serializeProject(project: StoredProject): SerializedProject {
  return {
    metadata: project.metadata,
    document: serializeDocument(project.document),
  };
}

/**
 * Deserialize a StoredProject from IndexedDB storage
 */
export function deserializeProject(serialized: SerializedProject): StoredProject {
  return {
    metadata: serialized.metadata,
    document: deserializeDocument(serialized.document),
  };
}
