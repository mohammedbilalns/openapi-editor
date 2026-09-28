import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { IndexedDBRepository, SaveConflictError, StorageBlockedError } from './repository';
import { serializeProject } from './serializer';
import { useEditorStore } from '@/lib/openapi/store';
import type { StoredProject } from './types';
import { REALISTIC_SPEC_YAML } from '@/test/fixtures/realistic-spec';
import { parseOk } from '@/test/helpers';

const project = (id: string, updatedAt: number): StoredProject => ({
  metadata: { id, name: `Project ${id}`, createdAt: 1, updatedAt },
  document: parseOk(REALISTIC_SPEC_YAML).doc,
});

let repo: IndexedDBRepository;
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory(); // fresh, empty database per test
  repo = new IndexedDBRepository();
});

describe('IndexedDBRepository', () => {
  it('saves and loads a project losslessly', async () => {
    const p = project('a', 10);
    await repo.saveProject(p);
    const loaded = await repo.getProject('a');
    expect(loaded).toEqual(p);
    expect(loaded!.document.schemas).toBeInstanceOf(Map);
  });

  it('returns null for an unknown project', async () => {
    expect(await repo.getProject('missing')).toBeNull();
  });

  it('overwrites on save with the same id', async () => {
    const p = project('a', 10);
    await repo.saveProject(p);
    p.document.info.title = 'Renamed';
    p.metadata.updatedAt = 11;
    await repo.saveProject(p);
    expect((await repo.getProject('a'))!.document.info.title).toBe('Renamed');
    expect(await repo.listProjects()).toHaveLength(1);
  });

  it('lists metadata newest first and deletes', async () => {
    await repo.saveProject(project('old', 1));
    await repo.saveProject(project('new', 3));
    await repo.saveProject(project('mid', 2));
    expect((await repo.listProjects()).map((m) => m.id)).toEqual(['new', 'mid', 'old']);
    await repo.deleteProject('mid');
    expect((await repo.listProjects()).map((m) => m.id)).toEqual(['new', 'old']);
  });

  it('after a load, saving an edited document writes only the changed records', async () => {
    await repo.saveProject(project('a', 1));
    const session = new IndexedDBRepository(); // e.g. after a page reload
    const loaded = (await session.getProject('a'))!;

    useEditorStore.getState().initializeDocument(loaded.document);
    const createPet = Array.from(loaded.document.routes.values()).find((r) => r.operationId === 'createPet')!;
    useEditorStore.getState().updateRoute(createPet.id, { summary: 'Adopt a pet' });
    const edited = useEditorStore.getState().document;

    await session.saveProject({ metadata: { ...loaded.metadata, updatedAt: 2 }, document: edited });
    expect(session.lastSaveStats).toEqual({ full: false, routesWritten: 1, routesDeleted: 0, schemasWritten: 0, schemasDeleted: 0 });

    const reloaded = (await new IndexedDBRepository().getProject('a'))!;
    expect(reloaded.document).toEqual(edited);
    expect(Array.from(reloaded.document.routes.keys())).toEqual(Array.from(edited.routes.keys()));
  });

  it('deletes records of removed routes and schemas', async () => {
    const p = project('a', 1);
    await repo.saveProject(p);
    const [firstRouteId] = p.document.routes.keys();
    const [firstSchemaId] = p.document.schemas.keys();
    const routes = new Map(p.document.routes);
    routes.delete(firstRouteId);
    const schemas = new Map(p.document.schemas);
    schemas.delete(firstSchemaId);
    const next = { ...p.document, routes, schemas };
    await repo.saveProject({ metadata: p.metadata, document: next });
    expect(repo.lastSaveStats).toMatchObject({ full: false, routesWritten: 0, routesDeleted: 1, schemasWritten: 0, schemasDeleted: 1 });
    expect((await new IndexedDBRepository().getProject('a'))!.document).toEqual(next);
  });

  it('a first save without a baseline replaces stale records from an earlier session', async () => {
    const p = project('a', 1);
    await repo.saveProject(p);
    const routes = new Map(Array.from(p.document.routes).slice(0, 2));
    const smaller = { ...p.document, routes };
    const other = new IndexedDBRepository();
    await other.getProject('a');
    // no diff baseline (as after a failed write), but the revision it loaded is current
    (other as unknown as { lastSaved: Map<string, unknown> }).lastSaved.clear();
    await other.saveProject({ metadata: p.metadata, document: smaller });
    expect(other.lastSaveStats?.full).toBe(true);
    expect((await new IndexedDBRepository().getProject('a'))!.document.routes.size).toBe(2);
  });

  it('deleting a project removes its route and schema records', async () => {
    await repo.saveProject(project('a', 1));
    await repo.saveProject(project('b', 2));
    await repo.deleteProject('a');
    expect(await repo.getProject('a')).toBeNull();
    // re-creating 'a' with an empty document must not resurrect old records
    const empty = project('a', 3);
    empty.document = { ...empty.document, routes: new Map(), schemas: new Map() };
    await new IndexedDBRepository().saveProject(empty);
    const back = (await new IndexedDBRepository().getProject('a'))!;
    expect(back.document.routes.size + back.document.schemas.size).toBe(0);
    expect((await repo.getProject('b'))!.document.routes.size).toBeGreaterThan(0);
  });

  it('reads format-1 records written by the previous version and upgrades them on save', async () => {
    const p = project('legacy', 5);
    // database as the previous release created it (version 1, whole document in the project record)
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('openapi-editor', 1);
      open.onupgradeneeded = () => {
        const db = open.result;
        const store = db.createObjectStore('projects', { keyPath: 'metadata.id' });
        store.createIndex('updatedAt', 'metadata.updatedAt', { unique: false });
        store.createIndex('name', 'metadata.name', { unique: false });
        db.createObjectStore('settings');
      };
      open.onsuccess = () => {
        const tx = open.result.transaction('projects', 'readwrite');
        tx.objectStore('projects').put(serializeProject(p));
        tx.oncomplete = () => {
          open.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      open.onerror = () => reject(open.error);
    });

    const upgraded = new IndexedDBRepository();
    expect((await upgraded.listProjects()).map((m) => m.id)).toEqual(['legacy']);
    const loaded = (await upgraded.getProject('legacy'))!;
    expect(loaded).toEqual(p);

    await upgraded.saveProject(loaded);
    expect(upgraded.lastSaveStats?.full).toBe(true); // rewritten as format 2
    expect((await new IndexedDBRepository().getProject('legacy'))!).toEqual(p);
  });

  it('stores, replaces and clears the active project id', async () => {
    expect(await repo.getActiveProjectId()).toBeNull();
    await repo.setActiveProjectId('a');
    await repo.setActiveProjectId('b');
    expect(await repo.getActiveProjectId()).toBe('b');
    await repo.setActiveProjectId(null);
    expect(await repo.getActiveProjectId()).toBeNull();
  });
});

describe('IndexedDBRepository: two tabs', () => {
  it('refuses a stale save instead of mixing two tabs diffs into one document', async () => {
    const seed = project('a', 1);
    await repo.saveProject(seed);
    const tabA = new IndexedDBRepository();
    const tabB = new IndexedDBRepository();
    const a0 = (await tabA.getProject('a'))!.document;
    const b0 = (await tabB.getProject('a'))!.document;

    // Tab B edits one route and deletes another.
    const [first, second] = b0.routes.keys();
    const bRoutes = new Map(b0.routes);
    bRoutes.set(first, { ...b0.routes.get(first)!, summary: 'B edit' });
    bRoutes.delete(second);
    const bDoc = { ...b0, routes: bRoutes, info: { ...b0.info, title: 'B title' } };
    await tabB.saveProject({ metadata: seed.metadata, document: bDoc });

    // Tab A only renames. Its diff would overwrite B's title and keep B's other edits: a mixed document.
    const aDoc = { ...a0, info: { ...a0.info, title: 'A title' } };
    await expect(tabA.saveProject({ metadata: seed.metadata, document: aDoc })).rejects.toBeInstanceOf(SaveConflictError);
    // and keeps refusing until it loads again
    await expect(tabA.saveProject({ metadata: seed.metadata, document: aDoc })).rejects.toBeInstanceOf(SaveConflictError);

    const stored = (await new IndexedDBRepository().getProject('a'))!.document;
    expect(stored).toEqual(bDoc);

    // After reloading, tab A saves normally.
    const a1 = (await tabA.getProject('a'))!.document;
    await tabA.saveProject({ metadata: seed.metadata, document: { ...a1, info: { ...a1.info, title: 'A again' } } });
    expect((await new IndexedDBRepository().getProject('a'))!.document.info.title).toBe('A again');
  });

  it('back-to-back saves from one tab never conflict with each other', async () => {
    const seed = project('a', 1);
    await repo.saveProject(seed);
    const tab = new IndexedDBRepository();
    const doc = (await tab.getProject('a'))!.document;
    const [routeId] = doc.routes.keys();
    const added = { ...doc, info: { ...doc.info, title: 'one' } };
    const routes = new Map(added.routes);
    routes.delete(routeId);
    const removed = { ...added, routes };
    // issued without waiting, as a pagehide flush during a pending save does
    await Promise.all([
      tab.saveProject({ metadata: seed.metadata, document: added }),
      tab.saveProject({ metadata: seed.metadata, document: removed }),
    ]);
    expect((await new IndexedDBRepository().getProject('a'))!.document).toEqual(removed);
  });

  it('a tab that found no project refuses to overwrite one another tab created', async () => {
    const tabA = new IndexedDBRepository();
    expect(await tabA.getProject('a')).toBeNull();
    await new IndexedDBRepository().saveProject(project('a', 1));
    await expect(tabA.saveProject(project('a', 2))).rejects.toBeInstanceOf(SaveConflictError);
  });

  it('refuses saves after markConflicted until the next load', async () => {
    await repo.saveProject(project('a', 1));
    repo.markConflicted('a');
    await expect(repo.saveProject(project('a', 2))).rejects.toBeInstanceOf(SaveConflictError);
    await repo.getProject('a');
    await repo.saveProject(project('a', 3));
  });
});

describe('IndexedDBRepository: opening the database', () => {
  function openOld(version: number): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('openapi-editor', version);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('projects')) {
          request.result.createObjectStore('projects', { keyPath: 'metadata.id' });
          request.result.createObjectStore('settings');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  it('rejects instead of hanging when an old tab blocks the upgrade, and a retry works once it closes', async () => {
    const oldTab = await openOld(1); // previous build: ignores versionchange, keeps its connection
    await expect(repo.getActiveProjectId()).rejects.toBeInstanceOf(StorageBlockedError);
    oldTab.close();
    // the rejected open isn't cached: the same instance (Retry) opens again
    expect(await repo.getActiveProjectId()).toBeNull();
    await repo.saveProject(project('a', 1));
    expect(await repo.getProject('a')).not.toBeNull();
  });

  it('closes its connection when a newer version needs to upgrade', async () => {
    await repo.saveProject(project('a', 1));
    // a newer build in another tab opens a higher version; this repository must not block it
    const newer = await Promise.race([
      openOld(3).then((db) => {
        db.close();
        return 'opened';
      }),
      new Promise((resolve) => setTimeout(() => resolve('blocked'), 1000)),
    ]);
    expect(newer).toBe('opened');
  });
});
