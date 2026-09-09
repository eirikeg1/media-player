import { render, screen } from '@testing-library/react-native';

import {
  BroadcastRowsSkeleton,
  CompetitionGridSkeleton,
  MatchesListSkeleton,
  MatchLineupsSkeleton,
  MatchPreviewSkeleton,
  MatchStatsSkeleton,
  MatchTimelineSkeleton,
  ScorersSkeleton,
  StandingsSkeleton,
  TeamListSkeleton,
  TeamScheduleSkeleton,
} from '../skeletons';

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

  it('lays out two league sections of fixture rows', async () => {
    await render(<MatchesListSkeleton />);

    // 3 + 2 rows, matching a typical day's grouping.
    expect(screen.getAllByTestId('sports-skeleton-match-row')).toHaveLength(5);
  });

  it('fills the table with a full set of standings rows', async () => {
    await render(<StandingsSkeleton />);

    expect(screen.getAllByTestId('sports-skeleton-standings-row')).toHaveLength(10);
  });

  it('lists a screenful of scorer rows', async () => {
    await render(<ScorersSkeleton />);

    expect(screen.getAllByTestId('sports-skeleton-scorer-row')).toHaveLength(8);
  });

  it('draws the competition tiles in both grid sections', async () => {
    await render(<CompetitionGridSkeleton />);

    expect(screen.getAllByTestId('sports-skeleton-competition-tile')).toHaveLength(9);
  });

  it('lists a screenful of team rows', async () => {
    await render(<TeamListSkeleton />);

    expect(screen.getAllByTestId('sports-skeleton-team-row')).toHaveLength(8);
  });

  it('groups the team schedule into day sections', async () => {
    await render(<TeamScheduleSkeleton />);

    expect(screen.getAllByTestId('sports-skeleton-match-row')).toHaveLength(5);
  });

  it('pairs a comparison bar with every stat row', async () => {
    await render(<MatchStatsSkeleton />);

    expect(screen.getAllByTestId('sports-skeleton-stat-row')).toHaveLength(8);
  });

  it('lists substitutes for both sides of the lineup', async () => {
    await render(<MatchLineupsSkeleton />);

    expect(screen.getAllByTestId('sports-skeleton-sub-row')).toHaveLength(14);
  });

  it('stacks incident rows on the timeline', async () => {
    await render(<MatchTimelineSkeleton />);

    expect(screen.getAllByTestId('sports-skeleton-timeline-row')).toHaveLength(6);
  });

  it('renders the watch tab channel rows without a root wrapper', async () => {
    await render(<BroadcastRowsSkeleton />);

    expect(screen.getAllByTestId('sports-skeleton-broadcast-row')).toHaveLength(2);
  });
});
