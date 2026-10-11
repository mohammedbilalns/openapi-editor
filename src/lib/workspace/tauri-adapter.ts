import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { exists, readDir as tauriReadDir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { WorkspaceAdapter, WorkspaceProject } from './types';

const COMMON_ENTRY_FILES = [
  'openapi.yaml',
  'openapi.yml',
  'openapi.json',
  'swagger.yaml',
  'swagger.yml',
  'swagger.json',
  'index.yaml',
  'index.yml',
  'index.json',
] as const;

export class TauriWorkspaceAdapter implements WorkspaceAdapter {
  readonly isNative = true;
  private currentProject: WorkspaceProject | null = null;

  getCurrentProject(): WorkspaceProject | null {
    return this.currentProject;
  }

  setCurrentProject(project: WorkspaceProject | null): void {
    this.currentProject = project;
  }

  /**
   * Prompts the user to select an OpenAPI project folder.
   * Scans for an entry file (openapi.yaml, etc.) inside the chosen folder.
   */
  async openProject(): Promise<WorkspaceProject | null> {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: 'Select OpenAPI Project Folder',
    });

    if (!selected || typeof selected !== 'string') {
      return null;
    }

    const rootPath = selected;
    let entryFile = '';

    // Check for common entry filenames
    for (const candidate of COMMON_ENTRY_FILES) {
      const candidatePath = this.joinPath(rootPath, candidate);
      if (await exists(candidatePath)) {
        entryFile = candidate;
        break;
      }
    }

    // If none found, inspect root directory for any yaml/json
    if (!entryFile) {
      try {
        const entries = await tauriReadDir(rootPath);
        for (const entry of entries) {
          if (entry.name && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml') || entry.name.endsWith('.json'))) {
            entryFile = entry.name;
            break;
          }
        }
      } catch {
        // Fallback to default
        entryFile = 'openapi.yaml';
      }
    }

    if (!entryFile) {
      entryFile = 'openapi.yaml';
    }

    const folderName = rootPath.split(/[/\\]/).filter(Boolean).pop() ?? 'Project';

    const project: WorkspaceProject = {
      rootPath,
      entryFile,
      name: folderName,
    };

    this.currentProject = project;
    return project;
  }

  /**
   * Prompts the user to select an individual OpenAPI file.
   * Sets the file's parent directory as the workspace root.
   */
  async openFile(): Promise<WorkspaceProject | null> {
    const selected = await openDialog({
      directory: false,
      multiple: false,
      title: 'Select OpenAPI Specification File',
      filters: [
        {
          name: 'OpenAPI Specification',
          extensions: ['yaml', 'yml', 'json'],
        },
      ],
    });

    if (!selected || typeof selected !== 'string') {
      return null;
    }

    const fullPath = selected.replace(/\\/g, '/');
    const lastSlash = fullPath.lastIndexOf('/');
    const rootPath = lastSlash !== -1 ? fullPath.slice(0, lastSlash) : '.';
    const entryFile = lastSlash !== -1 ? fullPath.slice(lastSlash + 1) : fullPath;

    const project: WorkspaceProject = {
      rootPath,
      entryFile,
      name: entryFile,
    };

    this.currentProject = project;
    return project;
  }

  async readFile(relativePath: string): Promise<string> {
    if (!this.currentProject) {
      throw new Error('No project currently open in workspace.');
    }
    const fullPath = this.joinPath(this.currentProject.rootPath, relativePath);
    return readTextFile(fullPath);
  }

  async writeFile(relativePath: string, content: string): Promise<void> {
    if (!this.currentProject) {
      throw new Error('No project currently open in workspace.');
    }
    const fullPath = this.joinPath(this.currentProject.rootPath, relativePath);
    await writeTextFile(fullPath, content);
  }

  async readDir(relativePath = ''): Promise<string[]> {
    if (!this.currentProject) {
      throw new Error('No project currently open in workspace.');
    }
    const targetPath = relativePath
      ? this.joinPath(this.currentProject.rootPath, relativePath)
      : this.currentProject.rootPath;

    const entries = await tauriReadDir(targetPath);
    const names: string[] = [];
    for (const entry of entries) {
      if (entry.name) {
        names.push(entry.name);
      }
    }
    return names;
  }

  private joinPath(root: string, rel: string): string {
    const cleanRoot = root.replace(/[/\\]+$/, '');
    const cleanRel = rel.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
    return `${cleanRoot}/${cleanRel}`;
  }
}
