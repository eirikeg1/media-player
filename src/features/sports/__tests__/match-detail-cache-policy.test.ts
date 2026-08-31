import type { Fixture } from 'expo-m3u-parser';

import {
  TTL_CONCLUDED_SECS,
  TTL_LIVE_SECS,
  TTL_PREVIEW_SECS,
  TTL_UPCOMING_SECS,
  matchDetailTtl,
  type MatchDetailSection,
} from '../match-detail-cache-policy';

const base: Fixture = {
  providerId: 1,
  provider: 'sofascore',
  competitionName: 'PL',
  homeTeam: 'A',
  awayTeam: 'B',
  kickoffTime: 1_700_000_000,
  status: 'scheduled',
};

const fixture = (status: string): Fixture => ({ ...base, status });

const IN_PLAY: MatchDetailSection[] = ['score', 'statistics', 'players', 'timeline'];

describe('matchDetailTtl', () => {
  const cases: [status: string, section: MatchDetailSection, ttl: number][] = [
    // A live match is the case the overlay polls for: always reach the provider.
    ...IN_PLAY.map((section): [string, MatchDetailSection, number] => [
      'in_progress',
      section,
      TTL_LIVE_SECS,
    ]),
    ['paused', 'statistics', TTL_LIVE_SECS],
    // Nothing about a played match changes again.
    ...IN_PLAY.map((section): [string, MatchDetailSection, number] => [
      'finished',
      section,
      TTL_CONCLUDED_SECS,
    ]),
    ['finished', 'preview', TTL_CONCLUDED_SECS],
    ['postponed', 'timeline', TTL_CONCLUDED_SECS],
    ['cancelled', 'preview', TTL_CONCLUDED_SECS],
    // Before kickoff the in-play sections fill up slowly.
    ...IN_PLAY.map((section): [string, MatchDetailSection, number] => [
      'scheduled',
      section,
      TTL_UPCOMING_SECS,
    ]),
    // Form and H2H are settled history until the match is played.
    ['scheduled', 'preview', TTL_PREVIEW_SECS],
    ['in_progress', 'preview', TTL_PREVIEW_SECS],
  ];

  it.each(cases)('caches %s / %s for %i seconds', (status, section, ttl) => {
    expect(matchDetailTtl(fixture(status), section)).toBe(ttl);
  });

  it('reads the backend vocabulary case-insensitively', () => {
    expect(matchDetailTtl(fixture('IN_PROGRESS'), 'score')).toBe(TTL_LIVE_SECS);
    expect(matchDetailTtl(fixture('FINISHED'), 'score')).toBe(TTL_CONCLUDED_SECS);
  });

  it('treats an unknown status as not started', () => {
    expect(matchDetailTtl(fixture('interrupted'), 'statistics')).toBe(TTL_UPCOMING_SECS);
  });
});
