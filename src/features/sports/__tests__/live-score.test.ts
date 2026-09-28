import type { Fixture, MatchScore } from 'expo-m3u-parser';

import { mergeLiveScore, sameLiveScore } from '../live-score';

const KICKOFF = 1_700_000_000;

function fixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    providerId: 1,
    provider: 'sofascore',
    competitionName: 'Premier League',
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    kickoffTime: KICKOFF,
    status: 'scheduled',
    ...overrides,
  };
}

function score(overrides: Partial<MatchScore> = {}): MatchScore {
  return { status: 'in_progress', live: true, ...overrides };
}

describe('mergeLiveScore', () => {
  it('leaves the fixture alone without a score', () => {
    const base = fixture();
    expect(mergeLiveScore(base, null)).toBe(base);
  });

  it('overlays the status and scores', () => {
    const merged = mergeLiveScore(
      fixture(),
      score({ homeScore: 2, awayScore: 1, periodStart: KICKOFF })
    );

    expect(merged.status).toBe('in_progress');
    expect(merged.homeScore).toBe(2);
    expect(merged.awayScore).toBe(1);
    // Everything the poll doesn't carry is still the launching screen's.
    expect(merged.homeTeam).toBe('Arsenal');
    expect(merged.competitionName).toBe('Premier League');
  });

  it('keeps the fixture scores a poll has no answer for', () => {
    const merged = mergeLiveScore(
      fixture({ homeScore: 1, awayScore: 0 }),
      score({ status: 'paused' })
    );

    expect(merged.homeScore).toBe(1);
    expect(merged.awayScore).toBe(0);
  });

  it('replaces the clock rather than merging it, so half time clears the minute', () => {
    const firstHalf = mergeLiveScore(
      fixture(),
      score({ periodStart: KICKOFF, periodInitialSecs: 0, periodMaxSecs: 2700 })
    );
    expect(firstHalf.periodStart).toBe(KICKOFF);

    // The backend sends the clock only while it runs, so its absence is the
    // signal that it stopped. `??`-merging left half time counting up forever.
    const halfTime = mergeLiveScore(firstHalf, score({ status: 'paused' }));
    expect(halfTime.periodStart).toBeUndefined();
    expect(halfTime.periodInitialSecs).toBeUndefined();
    expect(halfTime.periodMaxSecs).toBeUndefined();
  });

  it('keeps the fixture status when the poll carries none', () => {
    const merged = mergeLiveScore(fixture({ status: 'finished' }), score({ status: '' }));
    expect(merged.status).toBe('finished');
  });
});

describe('sameLiveScore', () => {
  it('treats an unchanged scoreline as interchangeable', () => {
    expect(sameLiveScore(score({ homeScore: 1 }), score({ homeScore: 1 }))).toBe(true);
  });

  it('sees a goal', () => {
    expect(sameLiveScore(score({ homeScore: 1 }), score({ homeScore: 2 }))).toBe(false);
  });

  it('sees the second half start at the half-time scoreline', () => {
    // Same 1-0 on both sides of the break: only the clock says the minute is
    // running again, and without it this poll was discarded and the header
    // stayed frozen on "HT".
    const halfTime = score({ status: 'paused', homeScore: 1, awayScore: 0 });
    const secondHalf = score({
      status: 'paused',
      homeScore: 1,
      awayScore: 0,
      periodStart: KICKOFF + 3600,
      periodInitialSecs: 2700,
      periodMaxSecs: 5400,
    });

    expect(sameLiveScore(halfTime, secondHalf)).toBe(false);
  });

  it('reads an absent clock the same whether it is null or missing', () => {
    const nulled = score({ periodStart: null, periodInitialSecs: null, periodMaxSecs: null });
    expect(sameLiveScore(nulled, score())).toBe(true);
  });
});
