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

  /** Remove an uploaded URI (after deletion) */
  removeUploadedUri: (id: string) => void;
}

export const useHeaderBackgroundStore = create<HeaderBackgroundState>((set, get) => ({
  selections: {},
  uploadedUris: {},
  isLoaded: false,

  loadSelections: async (userId: string) => {
    try {
      const rows = await headerBackgroundRepository.getAllSelections(userId);
      const selections: Partial<Record<PageId, SelectionEntry>> = {};
      const uploadedUris = { ...get().uploadedUris };

      for (const row of rows) {
        selections[row.pageId] = { type: row.type, value: row.value };

        // If uploaded, pre-load the URI
        if (row.type === 'uploaded') {
          const uploads = await headerBackgroundRepository.getUploadedImages(userId, row.pageId);
          const shared = await headerBackgroundRepository.getSharedUploadedImages(row.pageId, userId);
          for (const u of [...uploads, ...shared]) {
            uploadedUris[u.id] = u.fileUri;
          }
        }
      }

      set({ selections, uploadedUris, isLoaded: true });
    } catch (error) {
      console.error('[HeaderBackgroundStore] Error loading selections:', error);
      set({ isLoaded: true });
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

  removeUploadedUri: (id: string) => {
    const updated = { ...get().uploadedUris };
    delete updated[id];
    set({ uploadedUris: updated });
  },
}));
