/**
 * Tests for the header-background repository and the store action that hydrates
 * from it: which uploads a user may display, and that deleting an upload leaves
 * no selection pointing at it.
 */
import { headerBackgroundRepository } from '@/db/header-background-repository';
import { executeQuery } from '@/db/sqlite-client';
import { userRepository } from '@/db/user-repository';
import { useHeaderBackgroundStore } from '@/stores/header-background';
import { resetStores, resetTestDatabases } from '@/test/helpers';
import type { User } from '@/types/user.types';

let alice: User;
let bob: User;

beforeEach(async () => {
  await resetTestDatabases();
  resetStores(useHeaderBackgroundStore);
  alice = await userRepository.createUser({ username: 'Alice' });
  bob = await userRepository.createUser({ username: 'Bob' });
});

describe('getAvailableUploads', () => {
  it('returns the user\'s own uploads and the shared ones, across pages', async () => {
    const own = await headerBackgroundRepository.addUploadedImage(alice.id, 'home', 'file:///a.jpg');
    const ownOtherPage = await headerBackgroundRepository.addUploadedImage(
      alice.id,
      'live',
      'file:///a-live.jpg',
    );
    const shared = await headerBackgroundRepository.addUploadedImage(bob.id, 'home', 'file:///b.jpg');

    const uploads = await headerBackgroundRepository.getAvailableUploads(alice.id);

    expect(uploads.map((upload) => upload.id).sort()).toEqual(
      [own, ownOtherPage, shared].sort(),
    );
  });

  it('hides the uploads of a user who turned sharing off', async () => {
    await userRepository.updateUserSettings(bob.id, { shareUploadedBackgrounds: false });
    const own = await headerBackgroundRepository.addUploadedImage(alice.id, 'home', 'file:///a.jpg');
    await headerBackgroundRepository.addUploadedImage(bob.id, 'home', 'file:///b.jpg');

    const uploads = await headerBackgroundRepository.getAvailableUploads(alice.id);

    expect(uploads.map((upload) => upload.id)).toEqual([own]);
  });
});

describe('loadSelections', () => {
  it('resolves the URI of every selected upload', async () => {
    const own = await headerBackgroundRepository.addUploadedImage(alice.id, 'home', 'file:///a.jpg');
    const shared = await headerBackgroundRepository.addUploadedImage(bob.id, 'live', 'file:///b.jpg');
    await headerBackgroundRepository.setSelection(alice.id, 'home', 'uploaded', own);
    await headerBackgroundRepository.setSelection(alice.id, 'live', 'uploaded', shared);
    await headerBackgroundRepository.setSelection(alice.id, 'movies', 'template', 'sunset');

    await useHeaderBackgroundStore.getState().loadSelections(alice.id);

    const state = useHeaderBackgroundStore.getState();
    expect(state.isLoaded).toBe(true);
    expect(state.selections).toEqual({
      home: { type: 'uploaded', value: own },
      live: { type: 'uploaded', value: shared },
      movies: { type: 'template', value: 'sunset' },
    });
    expect(state.uploadedUris[own]).toBe('file:///a.jpg');
    expect(state.uploadedUris[shared]).toBe('file:///b.jpg');
  });
});

describe('deleteUploadedImage', () => {
  it('removes the upload and every selection pointing at it', async () => {
    const uploadId = await headerBackgroundRepository.addUploadedImage(
      alice.id,
      'home',
      'file:///a.jpg',
    );
    await headerBackgroundRepository.setSelection(alice.id, 'home', 'uploaded', uploadId);
    await headerBackgroundRepository.setSelection(bob.id, 'home', 'uploaded', uploadId);

    await headerBackgroundRepository.deleteUploadedImage(uploadId);

    await expect(
      executeQuery('SELECT * FROM user_uploaded_backgrounds WHERE id = ?', [uploadId]),
    ).resolves.toEqual([]);
    // A selection left behind would render as a missing image for both users.
    await expect(executeQuery('SELECT * FROM user_header_selections')).resolves.toEqual([]);
  });

  it('is a no-op for an unknown id', async () => {
    await expect(
      headerBackgroundRepository.deleteUploadedImage('missing-id'),
    ).resolves.toBeUndefined();
  });
});
