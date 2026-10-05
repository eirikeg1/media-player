import type { PageId } from '@/config/header-backgrounds';
import { headerBackgroundRepository } from '@/db/header-background-repository';
import { create } from 'zustand';

interface SelectionEntry {
  type: 'template' | 'uploaded';
  value: string;
}

interface HeaderBackgroundState {
  /** Current selections keyed by pageId */
  selections: Partial<Record<PageId, SelectionEntry>>;
  /** Uploaded image URIs keyed by uploaded-background id */
  uploadedUris: Record<string, string>;
  isLoaded: boolean;

  /** Load all selections for a user from DB */
  loadSelections: (userId: string) => Promise<void>;

  /** Set a selection and persist to DB */
  setSelection: (userId: string, pageId: PageId, type: 'template' | 'uploaded', value: string) => Promise<void>;

  /** Reset a page to default (remove selection) */
  resetSelection: (userId: string, pageId: PageId) => Promise<void>;

  /** Register an uploaded URI (after upload or load) */
  registerUploadedUri: (id: string, uri: string) => void;

  /**
   * Delete an uploaded image from the shared pool and drop every reference to
   * it. The repository removes the selections of *all* users (the image is gone
   * for everyone it was shared with); this also clears them in memory so the
   * current user's pages fall back to their default immediately.
   */
  deleteUploadedImage: (id: string) => Promise<void>;
}

/**
 * Guards against a load for the user who is no longer current finishing last:
 * every `loadSelections` call takes the next token and only writes while it is
 * still the latest, so switching users quickly cannot leave the previous
 * profile's backgrounds on screen.
 */
let loadGeneration = 0;

export const useHeaderBackgroundStore = create<HeaderBackgroundState>((set, get) => ({
  selections: {},
  uploadedUris: {},
  isLoaded: false,

  loadSelections: async (userId: string) => {
    const generation = ++loadGeneration;
    try {
      // Two queries regardless of how many pages have a selection: the
      // selections, and the pool of uploads they can point at.
      const [rows, uploads] = await Promise.all([
        headerBackgroundRepository.getAllSelections(userId),
        headerBackgroundRepository.getAvailableUploads(userId),
      ]);

      if (generation !== loadGeneration) return;

      const selections: Partial<Record<PageId, SelectionEntry>> = {};
      for (const row of rows) {
        selections[row.pageId] = { type: row.type, value: row.value };
      }

      const uploadedUris = { ...get().uploadedUris };
      for (const upload of uploads) {
        uploadedUris[upload.id] = upload.fileUri;
      }

      set({ selections, uploadedUris, isLoaded: true });
    } catch (error) {
      console.error('[HeaderBackgroundStore] Error loading selections:', error);
      if (generation === loadGeneration) set({ isLoaded: true });
    }
  },

  setSelection: async (userId: string, pageId: PageId, type: 'template' | 'uploaded', value: string) => {
    try {
      await headerBackgroundRepository.setSelection(userId, pageId, type, value);
      set({
        selections: {
          ...get().selections,
          [pageId]: { type, value },
        },
      });
    } catch (error) {
      console.error('[HeaderBackgroundStore] Error setting selection:', error);
      throw error;
    }
  },

  resetSelection: async (userId: string, pageId: PageId) => {
    try {
      await headerBackgroundRepository.removeSelection(userId, pageId);
      const updated = { ...get().selections };
      delete updated[pageId];
      set({ selections: updated });
    } catch (error) {
      console.error('[HeaderBackgroundStore] Error resetting selection:', error);
      throw error;
    }
  },

  registerUploadedUri: (id: string, uri: string) => {
    if (get().uploadedUris[id] === uri) return;
    set({ uploadedUris: { ...get().uploadedUris, [id]: uri } });
  },

  deleteUploadedImage: async (id: string) => {
    try {
      await headerBackgroundRepository.deleteUploadedImage(id);
    } catch (error) {
      console.error('[HeaderBackgroundStore] Error deleting uploaded image:', error);
      throw error;
    }

    const uploadedUris = { ...get().uploadedUris };
    delete uploadedUris[id];

    const selections = { ...get().selections };
    for (const [pageId, selection] of Object.entries(selections) as [
      PageId,
      SelectionEntry,
    ][]) {
      if (selection.type === 'uploaded' && selection.value === id) {
        delete selections[pageId];
      }
    }

    set({ uploadedUris, selections });
  },
}));
