/**
 * Which episode the series detail sheet offers to play: the one still in
 * progress, or the one after the last finished episode.
 */
import { userRepository } from '@/db/user-repository';
import { useSeriesContinueEpisode } from '@/features/videos/hooks/use-series-continue-episode';
import { RESUME_MIN_SECONDS } from '@/lib/viewing-progress';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { useUserStore } from '@/stores/user/user-store';
import { makeChannel } from '@/test/factories';
import { resetStores, resetTestDatabases } from '@/test/helpers';
import type { Channel } from '@/types/playlist.types';
import type { User } from '@/types/user.types';
import { renderHook, waitFor } from '@testing-library/react-native';

const PLAYLIST_ID = 'pl-1';

/** Three episodes, handed to the hook in a deliberately jumbled order. */
const EPISODES: Channel[] = [
  makeChannel({ name: 'Breaking Bad S01E03', tvg: { id: 'ep-3' } }),
  makeChannel({ name: 'Breaking Bad S01E01', tvg: { id: 'ep-1' } }),
  makeChannel({ name: 'Breaking Bad S01E02', tvg: { id: 'ep-2' } }),
];

let user: User;

/** Record a watch of one episode, ending at `endPosition` of `totalDuration`. */
async function watch(channelId: string, endPosition: number, totalDuration = 1200): Promise<void> {
  const sessionId = await userRepository.startViewingSession({
    userId: user.id,
    playlistId: PLAYLIST_ID,
    channelId,
    channelName: channelId,
    contentType: 'series',
    totalDuration,
  });
  await userRepository.endViewingSession(sessionId, endPosition, endPosition, false);
}

beforeEach(async () => {
  await resetTestDatabases();
  resetStores(useUserStore, usePlaylistStore);

  user = await userRepository.createUser({ username: 'Alice' });
  useUserStore.setState({ currentUser: user });

  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useSeriesContinueEpisode', () => {
  it('offers nothing for a series that has never been watched', async () => {
    const { result } = await renderHook(() => useSeriesContinueEpisode(PLAYLIST_ID, EPISODES));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.continueEpisode).toBeNull();
  });

  it('resumes the episode that is still in progress', async () => {
    await watch('ep-2', 300);

    const { result } = await renderHook(() => useSeriesContinueEpisode(PLAYLIST_ID, EPISODES));
    await waitFor(() => expect(result.current.continueEpisode).not.toBeNull());

    expect(result.current.continueEpisode).toMatchObject({ season: 1, episode: 2 });
  });

  it('offers the same episode again after a few seconds of playback', async () => {
    await watch('ep-2', RESUME_MIN_SECONDS - 1);

    const { result } = await renderHook(() => useSeriesContinueEpisode(PLAYLIST_ID, EPISODES));
    await waitFor(() => expect(result.current.continueEpisode).not.toBeNull());

    // Below the resume floor E2 counts as not started — which is a reason to
    // play it from the beginning, never to skip past it to E3.
    expect(result.current.continueEpisode).toMatchObject({ season: 1, episode: 2 });
  });

  it('moves on to the next episode once one is finished', async () => {
    await watch('ep-1', 1180);

    const { result } = await renderHook(() => useSeriesContinueEpisode(PLAYLIST_ID, EPISODES));
    await waitFor(() => expect(result.current.continueEpisode).not.toBeNull());

    // Episode order comes from the titles, not from the array order above.
    expect(result.current.continueEpisode).toMatchObject({ season: 1, episode: 2 });
  });

  it('offers nothing after the last episode', async () => {
    await watch('ep-3', 1180);

    const { result } = await renderHook(() => useSeriesContinueEpisode(PLAYLIST_ID, EPISODES));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.continueEpisode).toBeNull();
  });

  it('asks about this series\' episodes rather than paging through the history', async () => {
    const forChannels = jest.spyOn(userRepository, 'getWatchStatsForChannels');
    const recent = jest.spyOn(userRepository, 'getRecentlyWatched');
    await watch('ep-1', 1180);

    const { result } = await renderHook(() => useSeriesContinueEpisode(PLAYLIST_ID, EPISODES));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // A series last watched long ago must still be found, so the query names the
    // episodes instead of hoping they are recent enough to appear in a page.
    expect(forChannels).toHaveBeenCalledWith(user.id, PLAYLIST_ID, ['ep-1', 'ep-2', 'ep-3']);
    expect(recent).not.toHaveBeenCalled();
  });
});
