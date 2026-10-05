import { playlistRepository } from '@/db/playlist-repository';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { useUserStore } from '@/stores/user/user-store';
import { makePlaylist } from '@/test/factories';
import { flushAsync, resetStores, resetTestDatabases } from '@/test/helpers';
import { DEFAULT_USER_SETTINGS, type User, type UserSettings } from '@/types/user.types';
import { act, renderHook } from '@testing-library/react-native';

import { backgroundStateStore } from '../background-state-store';
import { expoBackgroundScheduler } from '../expo-background-task';
import { useBackgroundTask } from '../use-background-task';

// The OS scheduler and the device-level file are the platform edges; what is
// under test is what the hook asks of them.
jest.mock('../expo-background-task', () => ({
  expoBackgroundScheduler: {
    isAvailable: jest.fn(async () => true),
    register: jest.fn(async () => undefined),
    unregister: jest.fn(async () => undefined),
  },
}));
jest.mock('../background-state-store', () => ({
  backgroundStateStore: {
    getSyncOnMobileData: jest.fn(async () => false),
    setSyncOnMobileData: jest.fn(async () => undefined),
  },
}));

const scheduler = jest.mocked(expoBackgroundScheduler);
const stateStore = jest.mocked(backgroundStateStore);

function user(settings: Partial<UserSettings> = {}): User {
  return {
    id: 'u1',
    username: 'Eirik',
    createdAt: new Date(0),
    updatedAt: new Date(0),
    settings: { ...DEFAULT_USER_SETTINGS, userId: 'u1', ...settings },
  };
}

beforeEach(async () => {
  await resetTestDatabases();
  resetStores(usePlaylistStore, useUserStore);
});

describe('the mobile-data mirror', () => {
  it('is not written before the user is loaded', async () => {
    renderHook(() => useBackgroundTask());
    await flushAsync();

    expect(stateStore.setSyncOnMobileData).not.toHaveBeenCalled();
  });

  it('follows the user setting, off by default', async () => {
    useUserStore.setState({ currentUser: user() });
    renderHook(() => useBackgroundTask());
    await flushAsync();
    expect(stateStore.setSyncOnMobileData).toHaveBeenLastCalledWith(false);

    await act(async () => {
      useUserStore.setState({ currentUser: user({ backgroundSyncOnMobileData: true }) });
    });
    expect(stateStore.setSyncOnMobileData).toHaveBeenLastCalledWith(true);
  });
});

describe('registration', () => {
  it('keeps the task registered for a playlist while the sports tab is hidden', async () => {
    const playlist = makePlaylist({ syncInterval: 360, epgSyncInterval: 1440 });
    await playlistRepository.create(playlist);
    useUserStore.setState({ currentUser: user({ showSportsTab: false }) });
    usePlaylistStore.setState({ playlists: [playlist], isInitialized: true });

    renderHook(() => useBackgroundTask());
    await flushAsync();

    expect(scheduler.register).toHaveBeenLastCalledWith(180);
    expect(scheduler.unregister).not.toHaveBeenCalled();
  });

  it('unregisters when no playlist syncs and the sports refresh is off', async () => {
    const playlist = makePlaylist({ syncInterval: 0, epgSyncInterval: 0 });
    await playlistRepository.create(playlist);
    useUserStore.setState({ currentUser: user({ showSportsTab: false }) });
    usePlaylistStore.setState({ playlists: [playlist], isInitialized: true });

    renderHook(() => useBackgroundTask());
    await flushAsync();

    expect(scheduler.unregister).toHaveBeenCalled();
    expect(scheduler.register).not.toHaveBeenCalled();
  });

  it('re-applies when an interval changes', async () => {
    const playlist = makePlaylist({ syncInterval: 0, epgSyncInterval: 0 });
    await playlistRepository.create(playlist);
    useUserStore.setState({ currentUser: user({ showSportsTab: false }) });
    usePlaylistStore.setState({ playlists: [playlist], isInitialized: true });
    renderHook(() => useBackgroundTask());
    await flushAsync();

    await act(async () => {
      await usePlaylistStore.getState().updatePlaylist(playlist.id, { syncInterval: 60 });
    });
    await flushAsync();

    expect(scheduler.register).toHaveBeenLastCalledWith(30);
  });
});
