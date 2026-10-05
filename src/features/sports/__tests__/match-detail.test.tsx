/**
 * The match detail surface, as `/(detail)/match` renders it.
 *
 * It is a route body rather than a `Modal` now, which is what lets the two
 * steps that lead away from it — a side's schedule, and the player — be pushed
 * on top of it instead of replacing it. Those pushes are what this pins down,
 * along with the chrome the surface renders from the fixture it was handed.
 */
import { formatTime } from '@/lib/format-time';
import { THEME } from '@/lib/theme';
import { parseFixtureParam } from '@/features/sports/fixture-param';
import { teamRefParam } from '@/lib/route-params';
import { getSportsDatabase } from '@/services/sports-service';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { Fixture, MatchStatistics, RankedBroadcast, SportsDatabase } from 'expo-m3u-parser';
import type { ReactElement } from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { clearBroadcastCache } from '../broadcast-cache';
import { MatchDetail } from '../match-detail/match-detail';

jest.mock('react-native/Libraries/Utilities/useColorScheme');

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useFocusEffect: () => {},
}));

const mockedColorScheme = useColorScheme as jest.MockedFunction<typeof useColorScheme>;

/** The surface insets its header and body, which needs a provider. */
const SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderDetail = (element: ReactElement) =>
  render(<SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>{element}</SafeAreaProvider>);

function fixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    providerId: 12345,
    provider: 'sofascore',
    competitionName: 'Premier League',
    competitionCountry: 'England',
    competitionId: 17,
    homeTeam: 'Arsenal',
    homeTeamId: 42,
    homeTeamCrest: 'https://img.example/arsenal.png',
    awayTeam: 'Chelsea',
    awayTeamId: 38,
    kickoffTime: 1_700_000_000,
    status: 'scheduled',
    ...overrides,
  };
}

const noop = () => {};

/** The in-memory fake behind the `expo-m3u-parser` mock. */
type FakeSportsDatabase = SportsDatabase & {
  __seedMatchDetail: (
    eventId: number,
    sections: { statistics: MatchStatistics & { fetchedAt: number; stale: boolean } }
  ) => void;
};

function broadcast(overrides: Partial<RankedBroadcast> = {}): RankedBroadcast {
  return {
    channelId: 'channel-1',
    title: 'Sky Sports Main Event',
    url: 'http://panel.example/live/user/pass/1.ts',
    group: 'Sports',
    confidence: 0.9,
    source: 'sofascore',
    ...overrides,
  };
}

function detail(current: Fixture) {
  return <MatchDetail fixture={current} onClose={noop} />;
}

beforeEach(() => {
  // Matched channels are remembered for the length of a session, keyed by
  // playlist and fixture — which every test here shares.
  clearBroadcastCache();
  usePlaylistStore.setState({ activePlaylistId: 'playlist-1' });
  mockedColorScheme.mockReturnValue('dark');
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('MatchDetail', () => {
  it.each(['dark', 'light'] as const)('renders its chrome in the %s scheme', async (scheme) => {
    mockedColorScheme.mockReturnValue(scheme);

    await renderDetail(detail(fixture()));

    await waitFor(() => expect(screen.getByText('Arsenal')).toBeOnTheScreen());
    expect(screen.getByText('Chelsea')).toBeOnTheScreen();
    expect(screen.getAllByText('Premier League · England').length).toBeGreaterThan(0);
  });

  it.each(['dark', 'light'] as const)(
    'paints the tab body in the %s scheme rather than a fixed dark slab',
    async (scheme) => {
      mockedColorScheme.mockReturnValue(scheme);

      await renderDetail(detail(fixture()));

      await waitFor(() => expect(screen.getByText('Arsenal')).toBeOnTheScreen());
      // The tabs used to be fixed-dark whatever the chrome around them was, which
      // left a black slab under a light header.
      expect(screen.getByTestId('match-detail-body')).toHaveStyle({
        backgroundColor: THEME[scheme].background,
      });
    }
  );

  it('says how old a section is when the provider refused to refresh it', async () => {
    const db = (await getSportsDatabase()) as FakeSportsDatabase;
    const fetchedAt = 1_700_003_000;
    // A payload served from the native cache because the provider refused: the
    // numbers are real, so the tab shows them under a line saying how old.
    db.__seedMatchDetail(12345, {
      statistics: { available: true, facts: {}, groups: [], momentum: [], fetchedAt, stale: true },
    });

    await renderDetail(detail(fixture({ status: 'in_progress' })));
    fireEvent.press(await screen.findByText('Stats'));

    await waitFor(() =>
      expect(screen.getByText(`as of ${formatTime(fetchedAt)}`)).toBeOnTheScreen()
    );
    expect(screen.getByText('Retry')).toBeOnTheScreen();
  });

  it('pushes the team route for a side of the score line', async () => {
    await renderDetail(detail(fixture()));

    fireEvent.press(await screen.findByLabelText('Arsenal, upcoming matches'));

    // The side travels as the fixture knew it, so the team surface has a header
    // before its schedule arrives.
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/team',
      params: {
        team: teamRefParam.encode({
          provider: 'sofascore',
          providerId: 42,
          name: 'Arsenal',
          crest: 'https://img.example/arsenal.png',
        }),
      },
    });
  });

  it('pushes the player itself, carrying the match with it', async () => {
    const db = await getSportsDatabase();
    jest
      .spyOn(db, 'findPlayableChannelsForFixture')
      .mockResolvedValue([broadcast({ tvgName: 'Sky Main Event' })]);

    await renderDetail(detail(fixture()));
    fireEvent.press(await screen.findByText('Watch on Sky Main Event'));

    // Pushed from inside the route rather than by the screen two surfaces
    // below, so backing out of playback comes back to the match.
    expect(mockPush).toHaveBeenCalledTimes(1);
    const push = mockPush.mock.calls[0][0] as {
      pathname: string;
      params: Record<string, string>;
    };
    expect(push.pathname).toBe('/video-player');
    expect(push.params).toMatchObject({
      channelId: 'channel-1',
      playlistId: 'playlist-1',
      contentType: 'live',
    });
    // The player shows match widgets off this, and nothing about catch-up:
    // the button plays the live stream.
    expect(parseFixtureParam(push.params.fixture)).toMatchObject({
      providerId: 12345,
      homeTeam: 'Arsenal',
    });
    expect(push.params.catchupStart).toBeUndefined();
  });
});
