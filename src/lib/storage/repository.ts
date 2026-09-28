import type {
  IProjectRepository,
  StoredProject,
  ProjectMetadata,
  SerializedProject,
  ProjectRecordV2,
  RouteRecord,
  SchemaRecord,
  SaveStats,
} from "./types";
import type { ApiDocument, Route, SchemaNode, SecurityScheme } from "@/lib/openapi/types";
import {
  deserializeProject,
  deserializeRoute,
  deserializeSchema,
  serializeRoute,
  serializeSchema,
} from "./serializer";

const DB_NAME = "openapi-editor";
const DB_VERSION = 2;
const PROJECTS_STORE = "projects";
const SETTINGS_STORE = "settings";
const ROUTES_STORE = "routes";
const SCHEMAS_STORE = "schemas";
const ACTIVE_PROJECT_KEY = "activeProjectId";

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

/** Every [projectId, *] key of the per-entity stores. */
function projectRange(projectId: string): IDBKeyRange {
  // arrays sort after strings, so [id, []] is above every [id, "<string>"]
  return IDBKeyRange.bound([projectId], [projectId, []]);
}

function isV2(record: unknown): record is ProjectRecordV2 {
  return (record as ProjectRecordV2 | undefined)?.format === 2;
}

/** Another tab saved this project since this tab last loaded or wrote it. Nothing was written. */
export class SaveConflictError extends Error {
  constructor(projectId: string) {
    super(`Project ${projectId} was changed in another tab`);
    this.name = "SaveConflictError";
  }
}

/** Another tab holds the database open on an older version and won't let this one upgrade it. */
export class StorageBlockedError extends Error {
  constructor() {
    super("Another tab is using an older version of this editor. Close it, then retry.");
    this.name = "StorageBlockedError";
  }
}

function newWriterId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * IndexedDB implementation of the project repository.
 *
 * Format 2 stores one record per route and per schema. saveProject diffs the
 * document against the last one this instance loaded or saved *by object
 * identity* (the editor store never mutates documents, see store.ts), so an
 * autosave after typing in one field writes one route record plus the small
 * project header instead of structured-cloning the whole document.
 * Format 1 records (whole document in the project record) are still read and
 * are rewritten as format 2 on the next save.
 */
export class IndexedDBRepository implements IProjectRepository {
  private dbPromise: Promise<IDBDatabase> | null = null;
  /** The open database, once `dbPromise` has resolved (lets saves start synchronously). */
  private db: IDBDatabase | null = null;
  /** last document loaded from / written to the DB, per project id */
  private lastSaved = new Map<string, ApiDocument>();
  /** what the most recent saveProject wrote */
  lastSaveStats: SaveStats | null = null;
  /** identifies this instance's writes in the project record */
  readonly writerId = newWriterId();
  /** revision last loaded or written per project id; absent = expect no stored project */
  private revisions = new Map<string, number>();
  /** projects another tab changed under this one; saves are refused until the next load */
  private conflicted = new Set<string>();

  /**
   * Open or create the IndexedDB database
   */
  private async getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    const opening = new Promise<IDBDatabase>((resolve, reject) => {
      let settled = false;
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        settled = true;
        reject(new Error("Failed to open IndexedDB"));
      };

      // An older tab keeps a connection open and ignores versionchange: without
      // this the open waits (and the app loads) forever.
      request.onblocked = () => {
        if (settled) return;
        settled = true;
        reject(new StorageBlockedError());
      };

      request.onsuccess = () => {
        const db = request.result;
        if (settled) {
          // Unblocked after we gave up; a retry opens its own connection.
          db.close();
          return;
        }
        settled = true;
        // Let a newer version of the app (another tab) upgrade the database.
        db.onversionchange = () => {
          db.close();
          if (this.db === db) {
            this.db = null;
            this.dbPromise = null;
          }
        };
        this.db = db;
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create projects store with id as key path
        if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
          const projectsStore = db.createObjectStore(PROJECTS_STORE, {
            keyPath: "metadata.id",
          });
          // Index for listing projects by updatedAt
          projectsStore.createIndex("updatedAt", "metadata.updatedAt", {
            unique: false,
          });
          // Index for listing projects by name
          projectsStore.createIndex("name", "metadata.name", { unique: false });
        }

        // Create settings store for app-level settings
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
          db.createObjectStore(SETTINGS_STORE);
        }

        // v2: one record per route / schema, keyed [projectId, nodeId]
        if (!db.objectStoreNames.contains(ROUTES_STORE)) {
          db.createObjectStore(ROUTES_STORE, { keyPath: ["projectId", "id"] });
        }
        if (!db.objectStoreNames.contains(SCHEMAS_STORE)) {
          db.createObjectStore(SCHEMAS_STORE, { keyPath: ["projectId", "id"] });
        }
      };
    });
    this.dbPromise = opening;
    // Don't cache a failure: the next call (Retry) opens again.
    opening.catch(() => {
      if (this.dbPromise === opening) this.dbPromise = null;
    });

    return this.dbPromise;
  }

  /**
   * Get a project by ID
   */
  async getProject(id: string): Promise<StoredProject | null> {
    const db = await this.getDB();
    const tx = db.transaction([PROJECTS_STORE, ROUTES_STORE, SCHEMAS_STORE], "readonly");
    const [record, routeRecords, schemaRecords] = await Promise.all([
      requestResult(tx.objectStore(PROJECTS_STORE).get(id)) as Promise<ProjectRecordV2 | SerializedProject | undefined>,
      requestResult(tx.objectStore(ROUTES_STORE).getAll(projectRange(id))) as Promise<RouteRecord[]>,
      requestResult(tx.objectStore(SCHEMAS_STORE).getAll(projectRange(id))) as Promise<SchemaRecord[]>,
    ]).catch(() => {
      throw new Error("Failed to get project");
    });

    this.conflicted.delete(id);
    if (!record) {
      this.revisions.delete(id);
      return null;
    }

    if (!isV2(record)) {
      // format 1: whole document inside the project record
      this.revisions.set(id, 0);
      this.lastSaved.delete(id);
      return deserializeProject(record);
    }
    this.revisions.set(id, record.revision ?? 0);

    const { header } = record;
    const routesById = new Map(routeRecords.map((r) => [r.id, r]));
    const schemasById = new Map(schemaRecords.map((s) => [s.id, s]));
    const routes = new Map<string, Route>();
    for (const routeId of header.routeIds) {
      const r = routesById.get(routeId);
      if (r) routes.set(routeId, deserializeRoute(r.route));
    }
    const schemas = new Map<string, SchemaNode>();
    for (const schemaId of header.schemaIds) {
      const s = schemasById.get(schemaId);
      if (s) schemas.set(schemaId, deserializeSchema(s.schema));
    }

    const document: ApiDocument = {
      id: header.id,
      info: header.info,
      servers: header.servers,
      routes,
      schemas,
      securitySchemes: new Map(header.securitySchemes as [string, SecurityScheme][]),
      tags: header.tags,
      security: header.security,
      extra: header.extra,
    };
    this.lastSaved.set(id, document);
    return { metadata: record.metadata, document };
  }

  /**
   * Save a project (create or update). Writes only the routes/schemas whose
   * objects changed since the last load/save of this project.
   */
  async saveProject(project: StoredProject): Promise<void> {
    // No await before the transaction once the database is open: a save started
    // from pagehide/beforeunload must be queued before the page goes away.
    const db = this.db ?? (await this.getDB());
    const { metadata, document: doc } = project;
    const projectId = metadata.id;
    if (this.conflicted.has(projectId)) throw new SaveConflictError(projectId);
    const prev = this.lastSaved.get(projectId);
    const stats: SaveStats = { full: !prev, routesWritten: 0, routesDeleted: 0, schemasWritten: 0, schemasDeleted: 0 };
    const expected = this.revisions.get(projectId);
    const revision = (expected ?? 0) + 1;

    const tx = db.transaction([PROJECTS_STORE, ROUTES_STORE, SCHEMAS_STORE], "readwrite");
    const done = transactionDone(tx);
    const projectStore = tx.objectStore(PROJECTS_STORE);

    // Check-and-set inside the transaction (readwrite transactions on these stores
    // run one at a time): the writes below are queued now, and rolled back if
    // another tab saved since this one last loaded or wrote the project.
    let conflict = false;
    const current = projectStore.get(projectId);
    current.onsuccess = () => {
      const stored = current.result as ProjectRecordV2 | SerializedProject | undefined;
      const storedRevision = stored ? (isV2(stored) ? (stored.revision ?? 0) : 0) : undefined;
      const ours = stored !== undefined && isV2(stored) && stored.writer === this.writerId;
      if (stored && !ours && storedRevision !== expected) {
        conflict = true;
        tx.abort();
        return;
      }
      // Commit as soon as the check passes instead of when the task ends: a save
      // flushed from pagehide must commit before the page unloads, or the browser
      // aborts it (edit, reload, lost).
      tx.commit?.();
    };

    const routeStore = tx.objectStore(ROUTES_STORE);
    const schemaStore = tx.objectStore(SCHEMAS_STORE);

    if (!prev) {
      // Unknown baseline (first save in this session): replace everything
      routeStore.delete(projectRange(projectId));
      schemaStore.delete(projectRange(projectId));
    }

    if (!prev || prev.routes !== doc.routes) {
      for (const [id, route] of doc.routes) {
        if (prev && prev.routes.get(id) === route) continue;
        const record: RouteRecord = { projectId, id, route: serializeRoute(route) };
        routeStore.put(record);
        stats.routesWritten++;
      }
      if (prev) {
        for (const id of prev.routes.keys()) {
          if (doc.routes.has(id)) continue;
          routeStore.delete([projectId, id]);
          stats.routesDeleted++;
        }
      }
    }

    if (!prev || prev.schemas !== doc.schemas) {
      for (const [id, schema] of doc.schemas) {
        if (prev && prev.schemas.get(id) === schema) continue;
        const record: SchemaRecord = { projectId, id, schema: serializeSchema(schema) };
        schemaStore.put(record);
        stats.schemasWritten++;
      }
      if (prev) {
        for (const id of prev.schemas.keys()) {
          if (doc.schemas.has(id)) continue;
          schemaStore.delete([projectId, id]);
          stats.schemasDeleted++;
        }
      }
    }

    const record: ProjectRecordV2 = {
      format: 2,
      metadata,
      revision,
      writer: this.writerId,
      header: {
        id: doc.id,
        info: doc.info,
        servers: doc.servers,
        tags: doc.tags,
        security: doc.security,
        extra: doc.extra,
        securitySchemes: Array.from(doc.securitySchemes.entries()),
        routeIds: Array.from(doc.routes.keys()),
        schemaIds: Array.from(doc.schemas.keys()),
      },
    };
    projectStore.put(record);
    // The next save diffs against this one as soon as it is issued: IndexedDB runs
    // overlapping readwrite transactions in creation order, so a save started
    // before this one commits lands after it.
    this.lastSaved.set(projectId, doc);
    this.revisions.set(projectId, revision);
    this.lastSaveStats = stats;

    try {
      await done;
    } catch {
      // Unknown state on disk: the next save rewrites the whole project.
      this.lastSaved.delete(projectId);
      if (conflict) {
        this.conflicted.add(projectId);
        throw new SaveConflictError(projectId);
      }
      throw new Error("Failed to save project");
    }
  }

  /** The revision this instance last loaded or wrote (undefined: none stored). */
  getRevision(projectId: string): number | undefined {
    return this.revisions.get(projectId);
  }

  /** Marks a project as changed elsewhere (e.g. told by another tab); saves are refused until the next load. */
  markConflicted(projectId: string): void {
    this.conflicted.add(projectId);
  }

  /**
   * List all projects (returns metadata only for performance)
   */
  async listProjects(): Promise<ProjectMetadata[]> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(PROJECTS_STORE, "readonly");
      const store = transaction.objectStore(PROJECTS_STORE);
      const index = store.index("updatedAt");
      const request = index.openCursor(null, "prev"); // Sort by updatedAt descending

      const projects: ProjectMetadata[] = [];

      request.onerror = () => {
        reject(new Error("Failed to list projects"));
      };

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const project = cursor.value as SerializedProject | ProjectRecordV2;
          projects.push(project.metadata);
          cursor.continue();
        } else {
          resolve(projects);
        }
      };
    });
  }

  /**
   * Delete a project by ID
   */
  async deleteProject(id: string): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction([PROJECTS_STORE, ROUTES_STORE, SCHEMAS_STORE], "readwrite");
    const done = transactionDone(tx);
    tx.objectStore(PROJECTS_STORE).delete(id);
    tx.objectStore(ROUTES_STORE).delete(projectRange(id));
    tx.objectStore(SCHEMAS_STORE).delete(projectRange(id));
    try {
      await done;
    } catch {
      throw new Error("Failed to delete project");
    }
    this.lastSaved.delete(id);
    this.revisions.delete(id);
    this.conflicted.delete(id);
  }

  /**
   * Get the currently active project ID
   */
  async getActiveProjectId(): Promise<string | null> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SETTINGS_STORE, "readonly");
      const store = transaction.objectStore(SETTINGS_STORE);
      const request = store.get(ACTIVE_PROJECT_KEY);

      request.onerror = () => {
        reject(new Error("Failed to get active project ID"));
      };

      request.onsuccess = () => {
        resolve((request.result as string) || null);
      };
    });
  }

  /**
   * Set the currently active project ID
   */
  async setActiveProjectId(id: string | null): Promise<void> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SETTINGS_STORE, "readwrite");
      const store = transaction.objectStore(SETTINGS_STORE);

      const request =
        id === null
          ? store.delete(ACTIVE_PROJECT_KEY)
          : store.put(id, ACTIVE_PROJECT_KEY);

      request.onerror = () => {
        reject(new Error("Failed to set active project ID"));
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  }
}

// Singleton instance
let repositoryInstance: IndexedDBRepository | null = null;

/**
 * Get the repository instance (singleton)
 */
export function getRepository(): IProjectRepository {
  if (!repositoryInstance) {
    repositoryInstance = new IndexedDBRepository();
  }
  return repositoryInstance;
}
