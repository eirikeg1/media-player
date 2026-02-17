import type { PageId } from '@/config/header-backgrounds';
import type { ImageSource } from 'expo-image';

export type { PageId };

/** A user-uploaded background image entity */
export interface UserUploadedBackground {
  id: string;
  userId: string;
  pageId: PageId;
  fileUri: string;
  createdAt: string;
}

/** Current selection for a user on a specific page */
export interface UserHeaderSelection {
  userId: string;
  pageId: PageId;
  type: 'template' | 'uploaded';
  value: string; // template key or uploaded id
  updatedAt: string;
}

/** A single option shown in the customize-theme UI */
export interface HeaderBackgroundOption {
  type: 'template' | 'uploaded';
  key: string; // template key or uploaded id
  label: string;
  source: ImageSource;
  ownerId?: string; // only for uploaded images
}
