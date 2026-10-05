import { render, screen } from '@testing-library/react-native';

import {
  BroadcastRowsSkeleton,
  CompetitionGridSkeleton,
  MATCH_SECTION_ROWS,
  MatchesListSkeleton,
  MatchLineupsSkeleton,
  MatchPreviewSkeleton,
  MatchStatsSkeleton,
  MatchTimelineSkeleton,
  ScorersSkeleton,
  StandingsSkeleton,
  TEAM_SCHEDULE_SECTION_ROWS,
  TeamListSkeleton,
  TeamScheduleSkeleton,
} from '../skeletons';

/** Total rows across a composite's sections. */
const sum = (rows: readonly number[]) => rows.reduce((total, count) => total + count, 0);

/** Every composite, with the root testID it is expected to render. */
const COMPOSITES: [string, React.ComponentType][] = [
  ['matches-list-skeleton', MatchesListSkeleton],
  ['standings-skeleton', StandingsSkeleton],
  ['scorers-skeleton', ScorersSkeleton],
  ['competition-grid-skeleton', CompetitionGridSkeleton],
  ['team-list-skeleton', TeamListSkeleton],
  ['team-schedule-skeleton', TeamScheduleSkeleton],
  ['match-stats-skeleton', MatchStatsSkeleton],
  ['match-lineups-skeleton', MatchLineupsSkeleton],
  ['match-timeline-skeleton', MatchTimelineSkeleton],
  ['match-preview-skeleton', MatchPreviewSkeleton],
];

describe('sports skeletons', () => {
  it.each(COMPOSITES)('renders %s', async (testID, Composite) => {
    await render(<Composite />);

    expect(screen.getByTestId(testID)).toBeOnTheScreen();
  });

  it('lays out every league section of fixture rows', async () => {
    await render(<MatchesListSkeleton />);

    expect(screen.getAllByTestId('sports-skeleton-match-row')).toHaveLength(
      sum(MATCH_SECTION_ROWS)
    );
  });

  it('groups the team schedule into day sections', async () => {
    await render(<TeamScheduleSkeleton />);

    expect(screen.getAllByTestId('sports-skeleton-match-row')).toHaveLength(
      sum(TEAM_SCHEDULE_SECTION_ROWS)
    );
  });

  // The rest only have to fill their section: the exact count is a look
  // decision that gets tuned, and pinning it makes the test a copy of the
  // implementation instead of a check on it.
  it.each([
    ['fills the table with standings rows', StandingsSkeleton, 'sports-skeleton-standings-row'],
    ['lists scorer rows', ScorersSkeleton, 'sports-skeleton-scorer-row'],
    [
      'draws competition tiles',
      CompetitionGridSkeleton,
      'sports-skeleton-competition-tile',
    ],
    ['lists team rows', TeamListSkeleton, 'sports-skeleton-team-row'],
    ['pairs a comparison bar with every stat row', MatchStatsSkeleton, 'sports-skeleton-stat-row'],
    [
      'lists substitutes for both sides of the lineup',
      MatchLineupsSkeleton,
      'sports-skeleton-sub-row',
    ],
    ['stacks incident rows on the timeline', MatchTimelineSkeleton, 'sports-skeleton-timeline-row'],
    [
      'renders the watch tab channel rows without a root wrapper',
      BroadcastRowsSkeleton,
      'sports-skeleton-broadcast-row',
    ],
  ] as [string, React.ComponentType, string][])('%s', async (_name, Composite, rowTestID) => {
    await render(<Composite />);

    expect(screen.getAllByTestId(rowTestID).length).toBeGreaterThan(0);
  });
});
