import { create } from 'zustand';
import { toast } from '@/components/shared';
import { resolveMultiFileSpec } from '@/lib/openapi/multi-file/resolver';
import { saveMultiFileProject } from '@/lib/openapi/multi-file/writer';
import { useEditorStore } from '@/lib/openapi/store';
import type { ValidationError } from '@/lib/openapi/types';
import { getWorkspaceAdapter } from './index';
import type { WorkspaceProject } from './types';

interface WorkspaceState {
  activeProject: WorkspaceProject | null;
  loadedFiles: Set<string>;
  errors: ValidationError[];
  isOpening: boolean;
  isSaving: boolean;
  openProject: () => Promise<boolean>;
  openFile: () => Promise<boolean>;
  saveToDisk: () => Promise<boolean>;
  closeProject: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => ({
  activeProject: null,
  loadedFiles: new Set<string>(),
  errors: [],
  isOpening: false,
  isSaving: false,

  openProject: async () => {
    const adapter = getWorkspaceAdapter();
    set({ isOpening: true });
    try {
      const project = await adapter.openProject();
      if (!project) {
        set({ isOpening: false });
        return false;
      }

      const result = await resolveMultiFileSpec(adapter, project.entryFile);
      if (!result.document) {
        toast(`Could not open project: entry file not found or invalid.`);
        set({ isOpening: false });
        return false;
      }

      useEditorStore.getState().setDocument(result.document);
      set({
        activeProject: project,
        loadedFiles: result.loadedFiles,
        errors: result.errors,
        isOpening: false,
      });

      toast(`Opened workspace: ${project.name} (${result.loadedFiles.size} files loaded)`);
      return true;
    } catch (error) {
      toast(`Failed to open project: ${error instanceof Error ? error.message : String(error)}`);
      set({ isOpening: false });
      return false;
    }
  },

  openFile: async () => {
    const adapter = getWorkspaceAdapter();
    set({ isOpening: true });
    try {
      const project = await adapter.openFile();
      if (!project) {
        set({ isOpening: false });
        return false;
      }

      const result = await resolveMultiFileSpec(adapter, project.entryFile);
      if (!result.document) {
        toast(`Could not open file: file not found or invalid.`);
        set({ isOpening: false });
        return false;
      }

      useEditorStore.getState().setDocument(result.document);
      set({
        activeProject: project,
        loadedFiles: result.loadedFiles,
        errors: result.errors,
        isOpening: false,
      });

      toast(`Opened file: ${project.entryFile}`);
      return true;
    } catch (error) {
      toast(`Failed to open file: ${error instanceof Error ? error.message : String(error)}`);
      set({ isOpening: false });
      return false;
    }
  },

  saveToDisk: async () => {
    const { activeProject } = get();
    if (!activeProject) return false;

    const adapter = getWorkspaceAdapter();
    const doc = useEditorStore.getState().document;
    set({ isSaving: true });
    try {
      const { writtenFiles } = await saveMultiFileProject(adapter, doc, activeProject.entryFile);
      set({ isSaving: false });
      toast(`Saved ${writtenFiles.length} file(s) to disk.`);
      return true;
    } catch (error) {
      set({ isSaving: false });
      toast(`Failed to save to disk: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  },

  closeProject: () => {
    set({
      activeProject: null,
      loadedFiles: new Set<string>(),
      errors: [],
    });
  },
}));
