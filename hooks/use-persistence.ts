"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { getRepository, type StoredProject, type ProjectMetadata } from "@/lib/storage";
import type { ApiDocument } from "@/lib/openapi/types";

const DEFAULT_PROJECT_ID = "default";
const DEFAULT_PROJECT_NAME = "Untitled API";
const DEBOUNCE_MS = 1000;

interface UsePersistenceOptions {
  /** Debounce delay in milliseconds */
  debounceMs?: number;
}

interface UsePersistenceReturn {
  /** Whether the initial load is in progress */
  isLoading: boolean;
  /** Whether a save is in progress */
  isSaving: boolean;
  /** Last saved timestamp */
  lastSaved: number | null;
  /** Current project metadata */
  projectMetadata: ProjectMetadata | null;
  /** Error if any operation failed */
  error: Error | null;
  /** Manually trigger a save */
  saveNow: () => Promise<void>;
}

/**
 * Hook for persisting API document to IndexedDB
 * Automatically saves on changes with debouncing
 * Uses documentVersion to track changes efficiently
 */
export function usePersistence(
  document: ApiDocument | null,
  documentVersion: number,
  options: UsePersistenceOptions = {}
): UsePersistenceReturn {
  const { debounceMs = DEBOUNCE_MS } = options;

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [projectMetadata, setProjectMetadata] = useState<ProjectMetadata | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const documentRef = useRef(document);
  const metadataRef = useRef(projectMetadata);
  const initialLoadDoneRef = useRef(false);
  const lastSavedVersionRef = useRef(-1);

  // Keep refs updated
  documentRef.current = document;
  metadataRef.current = projectMetadata;

  /**
   * Save the current document to IndexedDB
   */
  const saveDocument = useCallback(async () => {
    const doc = documentRef.current;
    if (!doc) return;

    setIsSaving(true);
    setError(null);

    try {
      const repository = getRepository();
      const now = Date.now();

      // Get or create project metadata
      let metadata = metadataRef.current;
      if (!metadata) {
        metadata = {
          id: DEFAULT_PROJECT_ID,
          name: doc.info.title || DEFAULT_PROJECT_NAME,
          createdAt: now,
          updatedAt: now,
        };
      } else {
        metadata = {
          ...metadata,
          name: doc.info.title || DEFAULT_PROJECT_NAME,
          updatedAt: now,
        };
      }

      const project: StoredProject = {
        metadata,
        document: doc,
      };

      await repository.saveProject(project);
      await repository.setActiveProjectId(metadata.id);

      setProjectMetadata(metadata);
      setLastSaved(now);
      lastSavedVersionRef.current = documentVersion;
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to save"));
    } finally {
      setIsSaving(false);
    }
  }, [documentVersion]);

  /**
   * Manually trigger a save (bypasses debounce)
   */
  const saveNow = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    await saveDocument();
  }, [saveDocument]);

  /**
   * Debounced save - called when document changes
   */
  const debouncedSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveDocument();
      saveTimeoutRef.current = null;
    }, debounceMs);
  }, [saveDocument, debounceMs]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Auto-save when documentVersion changes (after initial load)
  useEffect(() => {
    if (!initialLoadDoneRef.current) return;
    if (documentVersion <= lastSavedVersionRef.current) return;
    debouncedSave();
  }, [documentVersion, debouncedSave]);

  // Mark initial load as done after first render
  useEffect(() => {
    if (!initialLoadDoneRef.current) {
      // Small delay to avoid saving immediately on load
      const timer = setTimeout(() => {
        initialLoadDoneRef.current = true;
        setIsLoading(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, []);

  return {
    isLoading,
    isSaving,
    lastSaved,
    projectMetadata,
    error,
    saveNow,
  };
}

/**
 * Hook to load the active project on mount
 * Returns the loaded document or null if none exists
 */
export function useLoadProject(): {
  document: ApiDocument | null;
  isLoading: boolean;
  error: Error | null;
} {
  const [document, setDocument] = useState<ApiDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProject() {
      try {
        const repository = getRepository();

        // Try to get the active project
        let projectId = await repository.getActiveProjectId();

        // If no active project, try to get the default one
        if (!projectId) {
          projectId = DEFAULT_PROJECT_ID;
        }

        const project = await repository.getProject(projectId);

        if (!cancelled) {
          if (project) {
            setDocument(project.document);
          }
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error("Failed to load project"));
          setIsLoading(false);
        }
      }
    }

    loadProject();

    return () => {
      cancelled = true;
    };
  }, []);

  return { document, isLoading, error };
}
