import type { ApiDocument, SecurityScheme } from "@/lib/openapi/types";

/**
 * Metadata for a stored project
 */
export interface ProjectMetadata {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * A project stored in the database
 * Contains the API document and associated metadata
 */
export interface StoredProject {
  metadata: ProjectMetadata;
  document: ApiDocument;
}

/**
 * Serialized format for IndexedDB storage
 * Maps are converted to plain objects for storage compatibility
 */
export interface SerializedProject {
  metadata: ProjectMetadata;
  document: SerializedApiDocument;
}

/**
 * Serialized ApiDocument with Maps converted to arrays of entries
 * Mirrors the internal ApiDocument structure, not the OpenAPI spec
 */
export interface SerializedApiDocument {
  id: string;
  info: ApiDocument["info"];
  servers: ApiDocument["servers"];
  routes: [string, SerializedRoute][];
  schemas: [string, SerializedSchema][];
  securitySchemes: [string, SecurityScheme][];
  tags: ApiDocument["tags"];
  security?: ApiDocument["security"];
}

/**
 * Serialized Route with responses Map converted to array
 */
export interface SerializedRoute {
  id: string;
  path: string;
  method: string;
  summary?: string;
  description?: string;
  operationId?: string;
  tags: string[];
  parameters: unknown[];
  requestBody?: unknown;
  responses: [string, unknown][];
  security?: unknown[];
  deprecated?: boolean;
}

/**
 * Serialized Schema with properties Map converted to array
 */
export interface SerializedSchema {
  id: string;
  name?: string;
  type: string;
  description?: string;
  properties?: [string, unknown][];
  items?: unknown;
  variants?: unknown[];
  enumValues?: Array<string | number | boolean>;
  required?: string[];
  format?: string;
  example?: unknown;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  discriminator?: unknown;
  nullable?: boolean;
  enumType?: string;
  extraKeywords?: Record<string, unknown>;
}

/**
 * Storage format 2 (DB version 2): the project record holds metadata and the
 * small document "header"; each route and schema is its own record, so an
 * autosave only writes what changed.
 */
export interface ProjectRecordV2 {
  format: 2;
  metadata: ProjectMetadata;
  header: {
    id: string;
    info: ApiDocument["info"];
    servers: ApiDocument["servers"];
    tags: ApiDocument["tags"];
    security?: ApiDocument["security"];
    securitySchemes: [string, unknown][];
    /** document order of the route / schema records */
    routeIds: string[];
    schemaIds: string[];
  };
}

export interface RouteRecord {
  projectId: string;
  id: string;
  route: SerializedRoute;
}

export interface SchemaRecord {
  projectId: string;
  id: string;
  schema: SerializedSchema;
}

/** What the last saveProject call wrote (for diagnostics and tests). */
export interface SaveStats {
  /** true when every record was rewritten (first save of a project in this session) */
  full: boolean;
  routesWritten: number;
  routesDeleted: number;
  schemasWritten: number;
  schemasDeleted: number;
}

/**
 * Repository interface for project persistence
 * Designed to support multiple projects for future extensibility
 */
export interface IProjectRepository {
  /**
   * Get a project by ID
   */
  getProject(id: string): Promise<StoredProject | null>;

  /**
   * Save a project (create or update)
   */
  saveProject(project: StoredProject): Promise<void>;

  /**
   * List all projects (metadata only for performance)
   */
  listProjects(): Promise<ProjectMetadata[]>;

  /**
   * Delete a project by ID
   */
  deleteProject(id: string): Promise<void>;

  /**
   * Get the currently active project ID
   */
  getActiveProjectId(): Promise<string | null>;

  /**
   * Set the currently active project ID
   */
  setActiveProjectId(id: string | null): Promise<void>;
}
