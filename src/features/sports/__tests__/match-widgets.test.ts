import type { Fixture } from 'expo-m3u-parser';

import {
  buildMatchWidgetTabs,
  getFixtureScoreDisplay,
  isSofascoreUrl,
  supportsMatchWidgets,
} from '../match-widgets';

function makeFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    providerId: 12436870,
    provider: 'sofascore',
    competitionName: 'Premier League',
    homeTeam: 'Arsenal',
    homeTeamId: 42,
    homeTeamShort: 'ARS',
    awayTeam: 'Chelsea',
    awayTeamId: 38,
    awayTeamShort: 'CHE',
    kickoffTime: 1_700_000_000,
    status: 'IN_PLAY',
    homeScore: 2,
    awayScore: 1,
    ...overrides,
  };
}

describe('supportsMatchWidgets', () => {
  it('accepts a SofaScore fixture with a positive event id', () => {
    expect(supportsMatchWidgets(makeFixture())).toBe(true);
  });

  it('rejects null / non-SofaScore / invalid ids', () => {
    expect(supportsMatchWidgets(null)).toBe(false);
    expect(supportsMatchWidgets(undefined)).toBe(false);
    expect(supportsMatchWidgets(makeFixture({ provider: 'football-data' }))).toBe(false);
    expect(supportsMatchWidgets(makeFixture({ providerId: 0 }))).toBe(false);
  });
});

describe('buildMatchWidgetTabs', () => {
  it('builds dark-themed lineups + momentum tabs keyed on the event id', () => {
    const tabs = buildMatchWidgetTabs(makeFixture());
    const lineups = tabs.find((t) => t.key === 'lineups');
    const momentum = tabs.find((t) => t.key === 'momentum');

    expect(lineups?.url).toBe(
      'https://widgets.sofascore.com/en/embed/lineups?id=12436870&widgetTheme=dark'
    );
    expect(momentum?.url).toBe(
      'https://widgets.sofascore.com/en/embed/attackMomentum?id=12436870&widgetTheme=dark'
    );
  });

  it('adds team tabs labelled with the short name when team ids exist', () => {
    const tabs = buildMatchWidgetTabs(makeFixture());
    const home = tabs.find((t) => t.key === 'home');
    const away = tabs.find((t) => t.key === 'away');

    expect(home).toMatchObject({
      label: 'ARS',
      url: 'https://widgets.sofascore.com/en/embed/team/42/info?widgetTheme=dark',
    });
    expect(away).toMatchObject({
      label: 'CHE',
      url: 'https://widgets.sofascore.com/en/embed/team/38/info?widgetTheme=dark',
    });
  });

  it('omits team tabs when team ids are missing', () => {
    const tabs = buildMatchWidgetTabs(
      makeFixture({ homeTeamId: undefined, awayTeamId: undefined })
    );
    expect(tabs.map((t) => t.key)).toEqual(['lineups', 'momentum']);
  });
});

describe('getFixtureScoreDisplay', () => {
  it('shows the score and LIVE for in-play matches', () => {
    const display = getFixtureScoreDisplay(makeFixture());
    expect(display).toMatchObject({ home: 'ARS', away: 'CHE', score: '2 - 1', status: 'LIVE', isLive: true });
  });

  it('shows FT for finished matches', () => {
    const display = getFixtureScoreDisplay(makeFixture({ status: 'FINISHED' }));
    expect(display).toMatchObject({ score: '2 - 1', status: 'FT', isLive: false });
  });

  it('shows kickoff time and no score before the match', () => {
    const display = getFixtureScoreDisplay(
      makeFixture({ status: 'SCHEDULED', homeScore: undefined, awayScore: undefined })
    );
    expect(display.score).toBeNull();
    expect(display.isLive).toBe(false);
    expect(display.status).toMatch(/\d/); // a formatted time
  });
});

describe('isSofascoreUrl', () => {
  it('allows SofaScore hosts and non-http bootstrap schemes', () => {
    expect(isSofascoreUrl({ url: 'https://widgets.sofascore.com/en/embed/lineups?id=1' })).toBe(true);
    expect(isSofascoreUrl({ url: 'https://api.sofascore.com/api/v1/event/1' })).toBe(true);
    expect(isSofascoreUrl({ url: 'https://img.sofascore.app/team/42' })).toBe(true);
    expect(isSofascoreUrl({ url: 'about:blank' })).toBe(true);
    expect(isSofascoreUrl({ url: 'data:text/html,<p>x</p>' })).toBe(true);
  });

  it('blocks unrelated and look-alike hosts', () => {
    expect(isSofascoreUrl({ url: 'https://example.com' })).toBe(false);
    expect(isSofascoreUrl({ url: 'https://sofascore.com.evil.com' })).toBe(false);
  });
});
