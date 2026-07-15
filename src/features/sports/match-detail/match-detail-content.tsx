import type { Fixture } from 'expo-m3u-parser';
import { memo } from 'react';

import {
  LIVE_REFRESH_MS,
  useMatchPlayers,
  useMatchPreview,
  useMatchStatistics,
  useMatchTimeline,
} from '../hooks/use-match-detail';
import { isMatchLive, type MatchTabKind } from '../match-widgets';
import { MatchLineupsTab } from './match-lineups-tab';
import { MatchPlayersTab } from './match-players-tab';
import { MatchPreviewTab } from './match-preview-tab';
import { MatchStatsTab } from './match-stats-tab';
import { MatchTimelineTab } from './match-timeline-tab';

interface MatchDetailContentProps {
  fixture: Fixture;
  /** The active tab. */
  activeKey: MatchTabKind;
  homeLabel: string;
  awayLabel: string;
  /** Landscape layout: tabs that benefit from the wider card render their
   * content in a denser, horizontally-compact arrangement. */
  compact?: boolean;
}

/**
 * Renders the active native tab. All four section hooks are called here (not in
 * the leaf tabs) so they stay mounted across tab switches: each fetches only
 * while its tab is active, and the cached result is shown instantly on return.
 */
export const MatchDetailContent = memo(function MatchDetailContent({
  fixture,
  activeKey,
  homeLabel,
  awayLabel,
  compact = false,
}: MatchDetailContentProps) {
  const eventId = fixture.providerId;
  // While the match is live the active section silently refreshes every minute;
  // finished/upcoming data is static, so it loads once.
  const pollMs = isMatchLive(fixture) ? LIVE_REFRESH_MS : 0;
  const statistics = useMatchStatistics(eventId, activeKey === 'stats', pollMs);
  // Lineups and Players are both built from the lineups payload, so one fetch
  // serves either tab.
  const players = useMatchPlayers(
    eventId,
    activeKey === 'players' || activeKey === 'lineups',
    pollMs
  );
  const timeline = useMatchTimeline(eventId, activeKey === 'timeline', pollMs);
  const preview = useMatchPreview(eventId, activeKey === 'preview');

  switch (activeKey) {
    case 'stats':
      return <MatchStatsTab state={statistics} homeLabel={homeLabel} awayLabel={awayLabel} />;
    case 'players':
      return (
        <MatchPlayersTab state={players} homeLabel={homeLabel} awayLabel={awayLabel} compact={compact} />
      );
    case 'lineups':
      return (
        <MatchLineupsTab state={players} homeLabel={homeLabel} awayLabel={awayLabel} compact={compact} />
      );
    case 'timeline':
      return <MatchTimelineTab state={timeline} compact={compact} />;
    case 'preview':
      return <MatchPreviewTab state={preview} homeLabel={homeLabel} awayLabel={awayLabel} />;
    default:
      return null;
  }
});
