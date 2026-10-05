/**
 * The Sports tab no longer holds the open match, competition or team in its own
 * state. Pressing one is a navigation, carrying what it is about in the route
 * parameters — which is what keeps the day list mounted behind it, and what
 * lets a match opened from a competition sit *on top of* it rather than in its
 * place.
 *
 * The day's data is stubbed: what is under test is the handoff, not the query
 * that fills the list.
 */
import SportsScreen from '@/app/(tabs)/sports';
import { startOfLocalDay } from '@/features/sports/date-utils';
import { fixtureRouteParam } from '@/features/sports/fixture-param';
import { leagueRefParam } from '@/lib/route-params';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Fixture } from 'expo-m3u-parser';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

jest.mock('react-native/Libraries/Utilities/useColorScheme');

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useFocusEffect: () => {},
}));

jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));

// The tab bar's height comes from a navigator this screen is rendered without.
jest.mock('@/hooks/use-chrome-insets', () => ({ useChromeInsets: () => ({ bottom: 0 }) }));

// Paces provider requests behind the day list; nothing to do with navigation.
jest.mock('@/features/sports/hooks/use-favorite-match-prefetch', () => ({
  useFavoriteMatchPrefetch: jest.fn(),
}));

const mockUseDayFixtures = jest.fn();
jest.mock('@/features/sports/hooks/use-day-fixtures', () => ({
  useDayFixtures: (...args: unknown[]) => mockUseDayFixtures(...args),
}));

const SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const KICKOFF = Math.floor(Date.now() / 1000) + 3600;

const MATCH: Fixture = {
  providerId: 12345,
  provider: 'sofascore',
  competitionName: 'Premier League',
  competitionCountry: 'England',
  competitionId: 17,
  competitionEmblemUrl: 'https://img.example/pl.png',
  homeTeam: 'Arsenal',
  homeTeamId: 42,
  awayTeam: 'Chelsea',
  awayTeamId: 38,
  kickoffTime: KICKOFF,
  status: 'scheduled',
};

beforeEach(() => {
  (useColorScheme as jest.MockedFunction<typeof useColorScheme>).mockReturnValue('dark');
  mockUseDayFixtures.mockReturnValue({
    fixtures: [MATCH],
    isLoading: false,
    isRevalidating: false,
    error: null,
    refresh: jest.fn(),
  });
});

const renderScreen = () =>
  render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <SportsScreen />
    </SafeAreaProvider>
  );

describe('Sports tab navigation', () => {
  it('pushes the match detail route with the fixture encoded', async () => {
    await renderScreen();

    fireEvent.press(await screen.findByText('Arsenal'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/match',
      params: { fixture: fixtureRouteParam(MATCH) },
    });
  });

  it('pushes the competition route with the day it was opened from', async () => {
    await renderScreen();

    // The competition's name opens it on the table (see `LeagueHeader`).
    fireEvent.press(await screen.findByLabelText('Premier League table'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/league',
      params: {
        league: leagueRefParam.encode({
          key: 'league:17',
          competitionId: 17,
          title: 'Premier League',
          subtitle: 'England',
          logoUrl: 'https://img.example/pl.png',
          dateIso: startOfLocalDay(new Date()).toISOString(),
          tab: 'standings',
        }),
      },
    });
  });
});
