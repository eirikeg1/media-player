import type { PageId } from '@/config/header-backgrounds';
import type { UserHeaderSelection, UserUploadedBackground } from '@/types/theme.types';
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import { executeQuery, executeQuerySingle, executeStatement, executeTransaction } from './sqlite-client';

// ── Row types ──

interface SelectionRow {
  userId: string;
  pageId: string;
  type: string;
  value: string;
  updatedAt: string;
}

interface UploadedRow {
  id: string;
  userId: string;
  pageId: string;
  fileUri: string;
  createdAt: string;
}

// ── Conversions ──

function rowToSelection(row: SelectionRow): UserHeaderSelection {
  return {
    userId: row.userId,
    pageId: row.pageId as PageId,
    type: row.type as 'template' | 'uploaded',
    value: row.value,
    updatedAt: row.updatedAt,
  };
}

function rowToUploaded(row: UploadedRow): UserUploadedBackground {
  return {
    id: row.id,
    userId: row.userId,
    pageId: row.pageId as PageId,
    fileUri: row.fileUri,
    createdAt: row.createdAt,
  };
}

// ── Repository ──

class HeaderBackgroundRepository {
  /** Get the current selection for a user on a page */
  async getSelection(userId: string, pageId: PageId): Promise<UserHeaderSelection | null> {
    const row = await executeQuerySingle<SelectionRow>(
      'SELECT * FROM user_header_selections WHERE userId = ? AND pageId = ?',
      [userId, pageId],
    );
    return row ? rowToSelection(row) : null;
  }

  /** Get all selections for a user */
  async getAllSelections(userId: string): Promise<UserHeaderSelection[]> {
    const rows = await executeQuery<SelectionRow>(
      'SELECT * FROM user_header_selections WHERE userId = ?',
      [userId],
    );
    return rows.map(rowToSelection);
  }

  /** Upsert a selection */
  async setSelection(userId: string, pageId: PageId, type: 'template' | 'uploaded', value: string): Promise<void> {
    const now = new Date().toISOString();
    await executeStatement(
      `INSERT INTO user_header_selections (userId, pageId, type, value, updatedAt)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(userId, pageId) DO UPDATE SET type = ?, value = ?, updatedAt = ?`,
      [userId, pageId, type, value, now, type, value, now],
    );
  }

  /** Remove a selection (reset to default) */
  async removeSelection(userId: string, pageId: PageId): Promise<void> {
    await executeStatement(
      'DELETE FROM user_header_selections WHERE userId = ? AND pageId = ?',
      [userId, pageId],
    );
  }

  /** Add an uploaded image to the pool */
  async addUploadedImage(userId: string, pageId: PageId, fileUri: string): Promise<string> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await executeStatement(
      'INSERT INTO user_uploaded_backgrounds (id, userId, pageId, fileUri, createdAt) VALUES (?, ?, ?, ?, ?)',
      [id, userId, pageId, fileUri, now],
    );
    return id;
  }

  /** Get a user's own uploads for a page */
  async getUploadedImages(userId: string, pageId: PageId): Promise<UserUploadedBackground[]> {
    const rows = await executeQuery<UploadedRow>(
      'SELECT * FROM user_uploaded_backgrounds WHERE userId = ? AND pageId = ? ORDER BY createdAt DESC',
      [userId, pageId],
    );
    return rows.map(rowToUploaded);
  }

  /** Get shared uploads from other users for a page */
  async getSharedUploadedImages(pageId: PageId, excludeUserId: string): Promise<UserUploadedBackground[]> {
    const rows = await executeQuery<UploadedRow>(
      `SELECT ub.* FROM user_uploaded_backgrounds ub
       INNER JOIN user_settings us ON ub.userId = us.userId
       WHERE ub.pageId = ? AND ub.userId != ? AND us.shareUploadedBackgrounds = 1
       ORDER BY ub.createdAt DESC`,
      [pageId, excludeUserId],
    );
    return rows.map(rowToUploaded);
  }

  /**
   * Every upload a user may display: their own, plus the uploads of users who
   * share theirs. One query for the whole pool, so hydrating the header
   * selections at boot does not fan out per page.
   */
  async getAvailableUploads(userId: string): Promise<UserUploadedBackground[]> {
    const rows = await executeQuery<UploadedRow>(
      `SELECT ub.* FROM user_uploaded_backgrounds ub
       LEFT JOIN user_settings us ON ub.userId = us.userId
       WHERE ub.userId = ? OR us.shareUploadedBackgrounds = 1
       ORDER BY ub.createdAt DESC`,
      [userId],
    );
    return rows.map(rowToUploaded);
  }

  /** Delete an uploaded image from pool + filesystem */
  async deleteUploadedImage(id: string): Promise<void> {
    // Get the file URI before deleting the record
    const row = await executeQuerySingle<UploadedRow>(
      'SELECT * FROM user_uploaded_backgrounds WHERE id = ?',
      [id],
    );
    if (!row) return;

    // One transaction: an upload must never survive as a dangling selection,
    // and a selection must never point at an upload that is gone.
    await executeTransaction(async (tx) => {
      await tx.runAsync(
        "DELETE FROM user_header_selections WHERE type = 'uploaded' AND value = ?",
        [id],
      );
      await tx.runAsync('DELETE FROM user_uploaded_backgrounds WHERE id = ?', [id]);
    });

    // Filesystem work stays outside the transaction; a leftover file is
    // harmless, a committed-but-unreferenced row is not.
    try {
      const file = new File(row.fileUri);
      if (file.exists) {
        file.delete();
      }
    } catch (error) {
      console.warn('[HeaderBackgroundRepository] Could not delete file:', row.fileUri, error);
    }
  }
}

export const headerBackgroundRepository = new HeaderBackgroundRepository();
