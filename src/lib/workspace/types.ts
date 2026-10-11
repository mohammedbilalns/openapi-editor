export interface WorkspaceProject {
  /** The root directory path on desktop, or a virtual project identifier in web mode */
  rootPath: string;
  /** Relative path from rootPath to the entry OpenAPI specification file (e.g. "openapi.yaml") */
  entryFile: string;
  /** Display title/name of the project or root file */
  name: string;
}

export interface WorkspaceAdapter {
  readonly isNative: boolean;
  /** Prompt the user to select an OpenAPI project directory */
  openProject(): Promise<WorkspaceProject | null>;
  /** Prompt the user to select an individual OpenAPI file */
  openFile(): Promise<WorkspaceProject | null>;
  /** Read file content by path (relative to current project's rootPath) */
  readFile(relativePath: string): Promise<string>;
  /** Write file content by path (relative to current project's rootPath) */
  writeFile(relativePath: string, content: string): Promise<void>;
  /** List files/entries in a directory relative to project root */
  readDir?(relativePath?: string): Promise<string[]>;
}
