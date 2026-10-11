import type { WorkspaceAdapter, WorkspaceProject } from './types';

/**
 * Web workspace adapter for browser environments.
 * Manages files in memory and integrates with standard browser file dialogs.
 */
export class WebWorkspaceAdapter implements WorkspaceAdapter {
  readonly isNative = false;
  private currentProject: WorkspaceProject | null = null;
  private files = new Map<string, string>();

  constructor(initialFiles?: Record<string, string>, initialProject?: WorkspaceProject) {
    if (initialFiles) {
      for (const [path, content] of Object.entries(initialFiles)) {
        this.files.set(this.normalizePath(path), content);
      }
    }
    if (initialProject) {
      this.currentProject = initialProject;
    }
  }

  private normalizePath(path: string): string {
    return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
  }

  async openProject(): Promise<WorkspaceProject | null> {
    // In web mode, multi-file directory picking is not available via standard file inputs without webkitdirectory
    return this.currentProject;
  }

  async openFile(): Promise<WorkspaceProject | null> {
    return this.currentProject;
  }

  async readFile(relativePath: string): Promise<string> {
    const key = this.normalizePath(relativePath);
    const content = this.files.get(key);
    if (content === undefined) {
      throw new Error(`File not found in web workspace: ${relativePath}`);
    }
    return content;
  }

  async writeFile(relativePath: string, content: string): Promise<void> {
    const key = this.normalizePath(relativePath);
    this.files.set(key, content);
  }

  async readDir(relativePath = ''): Promise<string[]> {
    const prefix = this.normalizePath(relativePath);
    const results: string[] = [];
    for (const key of this.files.keys()) {
      if (!prefix || key.startsWith(`${prefix}/`)) {
        results.push(key);
      }
    }
    return results;
  }

  /** Set memory contents directly (useful for tests or imports) */
  setFile(relativePath: string, content: string): void {
    this.files.set(this.normalizePath(relativePath), content);
  }

  setCurrentProject(project: WorkspaceProject | null): void {
    this.currentProject = project;
  }

  hasFile(relativePath: string): boolean {
    return this.files.has(this.normalizePath(relativePath));
  }
}
