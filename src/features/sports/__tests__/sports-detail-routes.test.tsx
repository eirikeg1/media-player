/**
 * The `(detail)` routes for a match, a team and a competition.
 *
 * They live in `src/app`, but their tests cannot: every `.tsx` under the app
 * directory becomes a route, so a `__tests__` folder there would show up in the
 * router as one.
 *
 * Two things are worth pinning down. The parameter contract — a route parameter
 * survives a process restart and hand-edited deep links, so an unreadable one
 * has to become an error state with a way out rather than a crash inside the
 * surface. And the competition surface's day: it is handed the competition and
 * a date, not a list of matches, and reads that day for itself so its rows keep
 * following the poll while it is open.
 */
import LeagueDetailRoute from '@/app/(detail)/league';
import MatchDetailRoute from '@/app/(detail)/match';
import TeamDetailRoute from '@/app/(detail)/team';
import { startOfLocalDay } from '@/features/sports/date-utils';
import { fixtureRouteParam } from '@/features/sports/fixture-param';
import { leagueRefParam, teamRefParam, type LeagueRef } from '@/lib/route-params';
import { render, screen, userEvent } from '@testing-library/react-native';
import type { Fixture } from 'expo-m3u-parser';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

jest.mock('react-native/Libraries/Utilities/useColorScheme');

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn();
const mockPush = jest.fn();
const mockUseLocalSearchParams = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
  useFocusEffect: () => {},
}));

// The competition surface polls only while it is the screen on show.
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));

const mockUseDayFixtures = jest.fn();
jest.mock('@/features/sports/hooks/use-day-fixtures', () => ({
  useDayFixtures: (...args: unknown[]) => mockUseDayFixtures(...args),
}));

// The match and team surfaces have their own tests; here they only have to
// prove they were handed the decoded value. The competition surface is left
// real — resolving its day is what is under test.
jest.mock('@/features/sports/match-detail/match-detail', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    MatchDetail: ({ fixture }: { fixture: Fixture }) => (
      <Text>{`match:${fixture.homeTeam} v ${fixture.awayTeam}`}</Text>
    ),
  };
});

jest.mock('@/features/sports/team-detail', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    TeamDetail: ({ team }: { team: { name: string; providerId: number } }) => (
      <Text>{`team:${team.name}#${team.providerId}`}</Text>
    ),
  };
});

const SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderRoute = (element: React.ReactElement) =>
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
    awayTeam: 'Chelsea',
    awayTeamId: 38,
    kickoffTime: 1_700_000_000,
    status: 'scheduled',
    ...overrides,
  };
}

const PREMIER_LEAGUE: LeagueRef = {
  key: 'league:17',
  competitionId: 17,
  title: 'Premier League',
  subtitle: 'England',
  dateIso: '2026-06-12T00:00:00.000Z',
  tab: 'matches',
};

function dayFixtures(fixtures: Fixture[], isLoading = false) {
  mockUseDayFixtures.mockReturnValue({
    fixtures,
    isLoading,
    isRevalidating: false,
    error: null,
    refresh: jest.fn(),
  });
}

// `clearMocks` clears calls but keeps implementations, so the fallback case
// below would otherwise leak into every later test.
beforeEach(() => {
  mockCanGoBack.mockReturnValue(true);
  (useColorScheme as jest.MockedFunction<typeof useColorScheme>).mockReturnValue('dark');
  dayFixtures([]);
});

describe('match detail route', () => {
  it('renders the match carried in the route parameters', async () => {
    mockUseLocalSearchParams.mockReturnValue({ fixture: fixtureRouteParam(fixture()) });

    await renderRoute(<MatchDetailRoute />);

    expect(screen.getByText('match:Arsenal v Chelsea')).toBeTruthy();
  });

  it('shows a recoverable error for an unreadable parameter', async () => {
    mockUseLocalSearchParams.mockReturnValue({ fixture: 'not json' });

    await renderRoute(<MatchDetailRoute />);

    expect(screen.getByText("Can't Open This Match")).toBeTruthy();
    await userEvent.press(screen.getByText('Go Back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('falls back to the sports tab when the route is the whole stack', async () => {
    // A deep link straight into the detail route has nothing to pop, and
    // `back()` would leave a close button that does not close.
    mockCanGoBack.mockReturnValue(false);
    mockUseLocalSearchParams.mockReturnValue({ fixture: '{}' });

    await renderRoute(<MatchDetailRoute />);
    await userEvent.press(screen.getByText('Go Back'));

    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/sports');
  });
});

describe('team detail route', () => {
  it('renders the team carried in the route parameters', async () => {
    mockUseLocalSearchParams.mockReturnValue({
      team: teamRefParam.encode({ provider: 'sofascore', providerId: 42, name: 'Arsenal' }),
    });

    await renderRoute(<TeamDetailRoute />);

    expect(screen.getByText('team:Arsenal#42')).toBeTruthy();
  });

  it('shows a recoverable error for a team with no id to look matches up by', async () => {
    mockUseLocalSearchParams.mockReturnValue({ team: '{"name":"Arsenal"}' });

    await renderRoute(<TeamDetailRoute />);

    expect(screen.getByText("Can't Open This Team")).toBeTruthy();
    await userEvent.press(screen.getByText('Go Back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

describe('competition detail route', () => {
  it('lists the day fixtures of the competition it was opened for', async () => {
    dayFixtures([
      fixture(),
      // A second competition on the same day: the surface follows its own key.
      fixture({
        providerId: 999,
        competitionId: 140,
        competitionName: 'La Liga',
        homeTeam: 'Sevilla',
        awayTeam: 'Valencia',
      }),
    ]);
    mockUseLocalSearchParams.mockReturnValue({ league: leagueRefParam.encode(PREMIER_LEAGUE) });

    await renderRoute(<LeagueDetailRoute />);

    expect(screen.getAllByText('Premier League').length).toBeGreaterThan(0);
    expect(screen.getByText('Arsenal')).toBeTruthy();
    expect(screen.queryByText('Sevilla')).toBeNull();
    // The day it was opened from, not today's.
    expect(mockUseDayFixtures.mock.calls[0][0]).toEqual(
      startOfLocalDay(new Date(PREMIER_LEAGUE.dateIso))
    );
  });

  it('says the day is still loading rather than that it is empty', async () => {
    dayFixtures([], true);
    mockUseLocalSearchParams.mockReturnValue({ league: leagueRefParam.encode(PREMIER_LEAGUE) });

    await renderRoute(<LeagueDetailRoute />);

    expect(screen.getByTestId('league-matches-skeleton')).toBeTruthy();
    expect(screen.queryByText('No matches on this day')).toBeNull();
  });

  it('shows a recoverable error for a day that cannot be read back', async () => {
    mockUseLocalSearchParams.mockReturnValue({
      league: JSON.stringify({ ...PREMIER_LEAGUE, dateIso: 'the twelfth' }),
    });

    await renderRoute(<LeagueDetailRoute />);

    expect(screen.getByText("Can't Open This Competition")).toBeTruthy();
    await userEvent.press(screen.getByText('Go Back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
