import type {
  IProjectRepository,
  StoredProject,
  ProjectMetadata,
  SerializedProject,
} from "./types";
import { serializeProject, deserializeProject } from "./serializer";

const DB_NAME = "openapi-editor";
const DB_VERSION = 1;
const PROJECTS_STORE = "projects";
const SETTINGS_STORE = "settings";
const ACTIVE_PROJECT_KEY = "activeProjectId";

/**
 * IndexedDB implementation of the project repository
 */
export class IndexedDBRepository implements IProjectRepository {
  private dbPromise: Promise<IDBDatabase> | null = null;

  /**
   * Open or create the IndexedDB database
   */
  private async getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error("Failed to open IndexedDB"));
      };

      request.onsuccess = () => {
        resolve(request.result);
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
      };
    });

    return this.dbPromise;
  }

  /**
   * Get a project by ID
   */
  async getProject(id: string): Promise<StoredProject | null> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(PROJECTS_STORE, "readonly");
      const store = transaction.objectStore(PROJECTS_STORE);
      const request = store.get(id);

      request.onerror = () => {
        reject(new Error("Failed to get project"));
      };

      request.onsuccess = () => {
        const result = request.result as SerializedProject | undefined;
        if (result) {
          resolve(deserializeProject(result));
        } else {
          resolve(null);
        }
      };
    });
  }

  /**
   * Save a project (create or update)
   */
  async saveProject(project: StoredProject): Promise<void> {
    const db = await this.getDB();
    const serialized = serializeProject(project);

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(PROJECTS_STORE, "readwrite");
      const store = transaction.objectStore(PROJECTS_STORE);
      const request = store.put(serialized);

      request.onerror = () => {
        reject(new Error("Failed to save project"));
      };

      request.onsuccess = () => {
        resolve();
      };
    });
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
          const project = cursor.value as SerializedProject;
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

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(PROJECTS_STORE, "readwrite");
      const store = transaction.objectStore(PROJECTS_STORE);
      const request = store.delete(id);

      request.onerror = () => {
        reject(new Error("Failed to delete project"));
      };

      request.onsuccess = () => {
        resolve();
      };
    });
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
