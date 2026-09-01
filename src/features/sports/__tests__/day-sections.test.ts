import type { Fixture } from 'expo-m3u-parser';

import { groupFixturesByDay } from '../day-sections';

const NOW = new Date(2026, 8, 1, 12, 0, 0); // Tue 1 Sep 2026, local time.

/** Unix seconds for a local wall-clock time relative to {@link NOW}. */
function at(dayOffset: number, hour: number): number {
  const date = new Date(NOW);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, 0, 0, 0);
  return Math.floor(date.getTime() / 1000);
}

function fixture(kickoffTime: number, overrides: Partial<Fixture> = {}): Fixture {
  return {
    providerId: kickoffTime,
    provider: 'sofascore',
    competitionName: 'Premier League',
    competitionId: 17,
    homeTeam: 'Arsenal',
    homeTeamId: 42,
    awayTeam: 'Chelsea',
    awayTeamId: 38,
    kickoffTime,
    status: 'scheduled',
    ...overrides,
  };
}

describe('groupFixturesByDay', () => {
  it('returns one section per local day, chronologically', () => {
    const sections = groupFixturesByDay(
      [fixture(at(6, 15)), fixture(at(0, 20)), fixture(at(1, 18))],
      NOW
    );

    expect(sections.map((s) => s.key)).toEqual(['2026-09-01', '2026-09-02', '2026-09-07']);
    // The far day is spelled by the device locale ("Mon 7 Sep" / "Mon, Sep 7").
    const farDay = new Date(at(6, 15) * 1000).toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    expect(sections.map((s) => s.label)).toEqual(['Today', 'Tomorrow', farDay]);
  });

  it('sorts the fixtures of a day by kickoff', () => {
    const late = fixture(at(1, 21));
    const early = fixture(at(1, 13));
    const middle = fixture(at(1, 18));

    const [section] = groupFixturesByDay([late, early, middle], NOW);

    expect(section.fixtures.map((f) => f.providerId)).toEqual([
      early.providerId,
      middle.providerId,
      late.providerId,
    ]);
  });

  it('keeps two kickoffs on the same local day in one section', () => {
    const sections = groupFixturesByDay([fixture(at(2, 13)), fixture(at(2, 21))], NOW);

    expect(sections).toHaveLength(1);
    expect(sections[0].fixtures).toHaveLength(2);
  });

  it('has no sections without fixtures', () => {
    expect(groupFixturesByDay([], NOW)).toEqual([]);
  });

  it('leaves the input untouched', () => {
    const fixtures = [fixture(at(1, 18)), fixture(at(0, 20))];

    groupFixturesByDay(fixtures, NOW);

    expect(fixtures.map((f) => f.kickoffTime)).toEqual([at(1, 18), at(0, 20)]);
  });
});
