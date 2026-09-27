import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { IndexedDBRepository } from './repository';
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

  it('stores, replaces and clears the active project id', async () => {
    expect(await repo.getActiveProjectId()).toBeNull();
    await repo.setActiveProjectId('a');
    await repo.setActiveProjectId('b');
    expect(await repo.getActiveProjectId()).toBe('b');
    await repo.setActiveProjectId(null);
    expect(await repo.getActiveProjectId()).toBeNull();
  });
});
