import {
  SkeletonBlock,
  useSkeletonPulse,
  type SkeletonPulse,
} from '@/components/ui/display/skeleton';
import { StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';

import { FAINT } from './match-detail/match-detail-shared';
import { useSportsPalette, type SportsPalette } from './sports-theme';

/**
 * Loading placeholders for the sports surfaces. Each composite mirrors the
 * component it stands in for — same paddings, row heights and column widths —
 * so the swap from skeleton to content doesn't move anything on screen.
 *
 * Every composite raises a single pulse and hands it to its blocks, so a list
 * of rows still animates off one shared value.
 */

/**
 * `ThemedText`'s default `lineHeight`. The sports styles override `fontSize`
 * only, so every themed text line on these screens is 24pt tall whatever its
 * font size — placeholder bars sit in a box of that height so the rows keep
 * their real geometry.
 */
const TEXT_LINE = 24;

interface SportsSkeletonTheme {
  palette: SportsPalette;
  /** Block colour that reads on either scheme's card and background. */
  color: string;
  pulse: SkeletonPulse;
}

/** Everything a theme-aware sports skeleton needs: colours and one pulse. */
function useSportsSkeletonTheme(): SportsSkeletonTheme {
  const palette = useSportsPalette();
  const pulse = useSkeletonPulse();
  return { palette, color: palette.border, pulse };
}

/**
 * Block colour on the match sheet's fixed dark card. The shared `FAINT` (10%
 * white) all but vanishes once the pulse dips to 0.3, so blocks use a stronger
 * fixed grey instead.
 */
const DARK_BLOCK = '#33333A';

interface LineProps {
  width: number;
  /** Bar thickness; the box around it keeps the text line's height. */
  height?: number;
  line?: number;
  color: string;
  pulse: SkeletonPulse;
  style?: StyleProp<ViewStyle>;
}

/** A placeholder bar centred in a box the height of the real text line. */
function TextLine({ width, height = 10, line = TEXT_LINE, color, pulse, style }: LineProps) {
  return (
    <View style={[styles.lineBox, { height: line }, style]}>
      <SkeletonBlock width={width} height={height} color={color} pulse={pulse} />
    </View>
  );
}

// =====================================================================
// Matches list (matches-list.tsx / league-header.tsx / match-row.tsx)
// =====================================================================

/** Fixtures per league section, matching a typical day's grouping. */
const MATCH_SECTION_ROWS = [3, 2];

/** Name-bar widths cycled through the team lines so rows don't look stamped. */
const TEAM_NAME_WIDTHS = [132, 104, 118, 96];

function MatchRowSkeleton({
  theme,
  showDivider,
  seed,
}: {
  theme: SportsSkeletonTheme;
  showDivider: boolean;
  /** Varies the team-name bar widths from row to row. */
  seed: number;
}) {
  const { color, palette, pulse } = theme;
  return (
    <View
      testID="sports-skeleton-match-row"
      style={[
        styles.matchRow,
        showDivider && {
          borderBottomColor: palette.border,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
      ]}
    >
      <View style={styles.matchStatus}>
        <SkeletonBlock width={30} height={10} color={color} pulse={pulse} />
      </View>
      <View style={styles.matchTeams}>
        <MatchTeamLine width={TEAM_NAME_WIDTHS[(seed * 2) % TEAM_NAME_WIDTHS.length]} theme={theme} />
        <MatchTeamLine width={TEAM_NAME_WIDTHS[(seed * 2 + 1) % TEAM_NAME_WIDTHS.length]} theme={theme} />
      </View>
      <View style={styles.matchTrailing}>
        <SkeletonBlock width={14} height={14} borderRadius={7} color={color} pulse={pulse} />
      </View>
    </View>
  );
}

function MatchTeamLine({ width, theme }: { width: number; theme: SportsSkeletonTheme }) {
  const { color, pulse } = theme;
  return (
    <View style={styles.matchTeamLine}>
      <SkeletonBlock width={20} height={20} borderRadius={10} color={color} pulse={pulse} />
      <View style={styles.matchTeamName}>
        <SkeletonBlock width={width} height={10} color={color} pulse={pulse} />
      </View>
      <SkeletonBlock width={10} height={12} color={color} pulse={pulse} />
    </View>
  );
}

function LeagueHeaderSkeleton({ theme }: { theme: SportsSkeletonTheme }) {
  const { color, palette, pulse } = theme;
  return (
    <View style={styles.leagueHeaderContainer}>
      <View style={[styles.leagueHeader, { backgroundColor: palette.faint }]}>
        <SkeletonBlock width={24} height={24} borderRadius={6} color={color} pulse={pulse} />
        <View style={styles.leagueHeaderTitles}>
          <TextLine width={136} height={11} color={color} pulse={pulse} />
          <TextLine
            width={84}
            height={9}
            color={color}
            pulse={pulse}
            style={styles.leagueHeaderSubtitle}
          />
        </View>
        <SkeletonBlock width={16} height={16} color={color} pulse={pulse} />
      </View>
    </View>
  );
}

/** The day's matches: two league sections of grouped fixture rows. */
export function MatchesListSkeleton() {
  const theme = useSportsSkeletonTheme();

  return (
    <View testID="matches-list-skeleton">
      {MATCH_SECTION_ROWS.map((rows, section) => (
        <View key={section}>
          <LeagueHeaderSkeleton theme={theme} />
          <View style={[styles.matchCard, { backgroundColor: theme.palette.card }]}>
            {Array.from({ length: rows }, (_, index) => (
              <MatchRowSkeleton
                key={index}
                theme={theme}
                showDivider={index < rows - 1}
                seed={section * 3 + index}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

// =====================================================================
// Competition sheet (standings-table.tsx / scorers-list.tsx)
// =====================================================================

const STANDINGS_ROWS = 10;
/** P, W, D, L, GD, Pts — the numeric columns of a standings row. */
const STANDINGS_STAT_COLUMNS = 6;

/**
 * The league table: the column header over the ranked team rows. Rendered
 * inside `StandingsTable`'s own container, so it adds no padding of its own.
 */
export function StandingsSkeleton() {
  const theme = useSportsSkeletonTheme();

  return (
    <View testID="standings-skeleton">
      <View style={[styles.standingsHeaderRow, { borderBottomColor: theme.palette.border }]}>
        <StandingsCells theme={theme} statWidth={10} />
      </View>
      {Array.from({ length: STANDINGS_ROWS }, (_, index) => (
        <View
          key={index}
          testID="sports-skeleton-standings-row"
          style={[styles.standingsRow, { borderBottomColor: theme.palette.border }]}
        >
          <StandingsCells theme={theme} statWidth={14} />
        </View>
      ))}
    </View>
  );
}

/** Position, crest + name, then the numeric columns — one standings grid line. */
function StandingsCells({ theme, statWidth }: { theme: SportsSkeletonTheme; statWidth: number }) {
  const { color, pulse } = theme;
  return (
    <>
      <View style={styles.standingsPosition}>
        <SkeletonBlock width={12} height={10} color={color} pulse={pulse} />
      </View>
      <View style={styles.standingsTeam}>
        <SkeletonBlock width={20} height={20} borderRadius={10} color={color} pulse={pulse} />
        <SkeletonBlock width={96} height={10} color={color} pulse={pulse} />
      </View>
      {Array.from({ length: STANDINGS_STAT_COLUMNS }, (_, index) => (
        <View key={index} style={styles.standingsStat}>
          <SkeletonBlock width={statWidth} height={10} color={color} pulse={pulse} />
        </View>
      ))}
    </>
  );
}

const SCORER_ROWS = 8;

/**
 * The competition's top scorers. Rendered inside `ScorersList`'s own container,
 * so it adds no padding of its own.
 */
export function ScorersSkeleton() {
  const { color, palette, pulse } = useSportsSkeletonTheme();

  return (
    <View testID="scorers-skeleton">
      {Array.from({ length: SCORER_ROWS }, (_, index) => (
        <View
          key={index}
          testID="sports-skeleton-scorer-row"
          style={[styles.scorerRow, { borderBottomColor: palette.border }]}
        >
          <View style={styles.scorerRank}>
            <SkeletonBlock width={12} height={10} color={color} pulse={pulse} />
          </View>
          <View style={styles.scorerInfo}>
            <TextLine width={index % 2 === 0 ? 148 : 124} height={11} color={color} pulse={pulse} />
            <View style={styles.scorerTeamRow}>
              <SkeletonBlock width={16} height={16} borderRadius={8} color={color} pulse={pulse} />
              <SkeletonBlock width={88} height={9} color={color} pulse={pulse} />
            </View>
          </View>
          <View style={styles.scorerStats}>
            <TextLine width={18} height={14} color={color} pulse={pulse} />
            <TextLine width={44} height={9} color={color} pulse={pulse} />
          </View>
        </View>
      ))}
    </View>
  );
}

// =====================================================================
// Favourites modal (competition-grid.tsx / team-search-modal.tsx)
// =====================================================================

/** Mirrors `competition-grid.tsx`'s layout maths. */
const GRID_COLUMNS = 3;
const GRID_HORIZONTAL_PADDING = 16;
const GRID_GAP = 8;
/** Border + 10pt padding + 40pt emblem + 6pt gap + one text line + 10 + border. */
const GRID_TILE_HEIGHT = 92;
/** Border + 10pt padding + one text line + 10 + border. */
const ALL_CHIP_HEIGHT = 46;
const GRID_TOP_TILES = 6;
const GRID_INTERNATIONAL_TILES = 3;

/** The competition picker: the "All" chip over the two tile sections. */
export function CompetitionGridSkeleton() {
  const { color, pulse } = useSportsSkeletonTheme();
  const { width: screenWidth } = useWindowDimensions();
  const tileWidth =
    (screenWidth - GRID_HORIZONTAL_PADDING * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

  const tileRow = (count: number) => (
    <View style={styles.grid}>
      {Array.from({ length: count }, (_, index) => (
        <SkeletonBlock
          key={index}
          testID="sports-skeleton-competition-tile"
          width={tileWidth}
          height={GRID_TILE_HEIGHT}
          borderRadius={12}
          color={color}
          pulse={pulse}
        />
      ))}
    </View>
  );

  return (
    <View testID="competition-grid-skeleton" style={styles.gridContainer}>
      <SkeletonBlock
        width="100%"
        height={ALL_CHIP_HEIGHT}
        borderRadius={12}
        color={color}
        pulse={pulse}
      />
      {tileRow(GRID_TOP_TILES)}
      <TextLine width={84} height={9} color={color} pulse={pulse} style={styles.gridSectionLabel} />
      {tileRow(GRID_INTERNATIONAL_TILES)}
    </View>
  );
}

const TEAM_ROWS = 8;

/** The selectable team rows of the favourites modal. */
export function TeamListSkeleton() {
  const { color, palette, pulse } = useSportsSkeletonTheme();

  return (
    <View testID="team-list-skeleton">
      {Array.from({ length: TEAM_ROWS }, (_, index) => (
        <View
          key={index}
          testID="sports-skeleton-team-row"
          style={[styles.teamRow, { borderBottomColor: palette.border }]}
        >
          <SkeletonBlock width={32} height={32} borderRadius={16} color={color} pulse={pulse} />
          <TextLine width={index % 2 === 0 ? 168 : 132} height={11} color={color} pulse={pulse} />
        </View>
      ))}
    </View>
  );
}

// =====================================================================
// Team sheet (team-sheet.tsx)
// =====================================================================

/** Fixtures per day section of a team's schedule. */
const TEAM_SCHEDULE_SECTION_ROWS = [2, 3];

/**
 * A team's upcoming fixtures, grouped by day. Rendered into the team sheet's
 * scroll content, which supplies the top padding.
 */
export function TeamScheduleSkeleton() {
  const theme = useSportsSkeletonTheme();

  return (
    <View testID="team-schedule-skeleton">
      {TEAM_SCHEDULE_SECTION_ROWS.map((rows, section) => (
        <View key={section} style={styles.teamScheduleSection}>
          <TextLine
            width={104}
            height={9}
            color={theme.color}
            pulse={theme.pulse}
            style={styles.teamScheduleLabel}
          />
          <View style={[styles.matchCard, { backgroundColor: theme.palette.card }]}>
            {Array.from({ length: rows }, (_, index) => (
              <MatchRowSkeleton
                key={index}
                theme={theme}
                showDivider={index < rows - 1}
                seed={section * 3 + index}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

// =====================================================================
// Match sheet tabs — the fixed dark card (match-detail/*)
// =====================================================================

const STAT_ROWS = 8;

/** The stats tab: a group title over paired comparison bars. */
export function MatchStatsSkeleton() {
  const pulse = useSkeletonPulse();

  return (
    <View testID="match-stats-skeleton" style={styles.statsContent}>
      <SkeletonBlock width={104} height={12} color={DARK_BLOCK} pulse={pulse} />
      <View style={styles.statGroup}>
        {Array.from({ length: STAT_ROWS }, (_, index) => (
          <View key={index} testID="sports-skeleton-stat-row" style={styles.statRow}>
            <View style={styles.statValues}>
              <SkeletonBlock width={26} height={10} color={DARK_BLOCK} pulse={pulse} />
              <View style={styles.statLabel}>
                <SkeletonBlock
                  width={index % 2 === 0 ? 96 : 74}
                  height={10}
                  color={DARK_BLOCK}
                  pulse={pulse}
                />
              </View>
              <SkeletonBlock width={26} height={10} color={DARK_BLOCK} pulse={pulse} />
            </View>
            <View style={styles.statTrack}>
              <SkeletonBlock
                height={5}
                borderRadius={3}
                color={DARK_BLOCK}
                pulse={pulse}
                style={styles.fill}
              />
              <SkeletonBlock
                height={5}
                borderRadius={3}
                color={DARK_BLOCK}
                pulse={pulse}
                style={styles.fill}
              />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Substitutes listed per team once the lineups arrive. */
const SUB_ROWS = 7;

/** The lineups tab: the formation tags, the pitch and the substitute columns. */
export function MatchLineupsSkeleton({ compact = false }: { compact?: boolean }) {
  const pulse = useSkeletonPulse();

  return (
    <View testID="match-lineups-skeleton" style={styles.lineupsContent}>
      <View style={styles.formationRow}>
        <TeamTagSkeleton pulse={pulse} />
        <TeamTagSkeleton pulse={pulse} align="right" />
      </View>
      {/* The pitch keeps the tab's dominant block, and its landscape ratio. */}
      <SkeletonBlock
        width="100%"
        borderRadius={12}
        color={DARK_BLOCK}
        pulse={pulse}
        style={compact ? styles.pitchHorizontal : styles.pitchVertical}
      />
      <View style={styles.subs}>
        <SkeletonBlock width={92} height={12} color={DARK_BLOCK} pulse={pulse} />
        <View style={styles.subColumns}>
          <SubColumnSkeleton pulse={pulse} />
          <SubColumnSkeleton pulse={pulse} />
        </View>
      </View>
    </View>
  );
}

function TeamTagSkeleton({
  pulse,
  align = 'left',
}: {
  pulse: SkeletonPulse;
  align?: 'left' | 'right';
}) {
  return (
    <View style={[styles.teamTag, align === 'right' && styles.teamTagRight]}>
      <SkeletonBlock width={9} height={9} borderRadius={4.5} color={DARK_BLOCK} pulse={pulse} />
      <SkeletonBlock width={88} height={11} color={DARK_BLOCK} pulse={pulse} />
      <SkeletonBlock width={44} height={10} color={DARK_BLOCK} pulse={pulse} />
    </View>
  );
}

function SubColumnSkeleton({ pulse }: { pulse: SkeletonPulse }) {
  return (
    <View style={styles.subColumn}>
      <View style={styles.subTeamRow}>
        <SkeletonBlock width={9} height={9} borderRadius={4.5} color={DARK_BLOCK} pulse={pulse} />
        <SkeletonBlock width={72} height={10} color={DARK_BLOCK} pulse={pulse} />
      </View>
      {Array.from({ length: SUB_ROWS }, (_, index) => (
        <View key={index} testID="sports-skeleton-sub-row" style={styles.subRow}>
          <SkeletonBlock width={14} height={10} color={DARK_BLOCK} pulse={pulse} />
          <View style={styles.fill}>
            <SkeletonBlock
              width={index % 2 === 0 ? 92 : 76}
              height={10}
              color={DARK_BLOCK}
              pulse={pulse}
            />
          </View>
          <SkeletonBlock width={30} height={20} borderRadius={5} color={DARK_BLOCK} pulse={pulse} />
        </View>
      ))}
    </View>
  );
}

const TIMELINE_ROWS = 6;

/** The timeline tab: incident rows alternating either side of the centre rail. */
export function MatchTimelineSkeleton({ compact = false }: { compact?: boolean }) {
  const pulse = useSkeletonPulse();

  return (
    <View
      testID="match-timeline-skeleton"
      style={[styles.timelineContent, compact && styles.timelineCompact]}
    >
      {Array.from({ length: TIMELINE_ROWS }, (_, index) => {
        const onHomeSide = index % 2 === 0;
        const incident = (
          <>
            <SkeletonBlock width={112} height={11} color={DARK_BLOCK} pulse={pulse} />
            <SkeletonBlock
              width={72}
              height={9}
              color={DARK_BLOCK}
              pulse={pulse}
              style={styles.timelineSubLine}
            />
          </>
        );
        return (
          <View key={index} testID="sports-skeleton-timeline-row" style={styles.timelineRow}>
            <View style={[styles.timelineSide, styles.timelineSideLeft]}>
              {onHomeSide ? incident : null}
            </View>
            <View style={styles.timelineCenter}>
              <View style={styles.timelineRail} />
              <SkeletonBlock
                width={28}
                height={28}
                borderRadius={14}
                color={DARK_BLOCK}
                pulse={pulse}
              />
              <SkeletonBlock
                width={22}
                height={9}
                color={DARK_BLOCK}
                pulse={pulse}
                style={styles.timelineMinute}
              />
            </View>
            <View style={[styles.timelineSide, styles.timelineSideRight]}>
              {onHomeSide ? null : incident}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const FORM_PILLS = 5;
const H2H_ALIGNMENTS = ['flex-start', 'center', 'flex-end'] as const;

/** The preview tab: the head-to-head block over the two form columns. */
export function MatchPreviewSkeleton() {
  const pulse = useSkeletonPulse();

  return (
    <View testID="match-preview-skeleton" style={styles.previewContent}>
      <View style={styles.previewBlock}>
        <SkeletonBlock width={112} height={12} color={DARK_BLOCK} pulse={pulse} />
        <View style={styles.h2hCard}>
          <View style={styles.h2hCounts}>
            {H2H_ALIGNMENTS.map((align) => (
              <View key={align} style={[styles.h2hCount, { alignItems: align }]}>
                <SkeletonBlock width={26} height={22} color={DARK_BLOCK} pulse={pulse} />
                <SkeletonBlock width={38} height={9} color={DARK_BLOCK} pulse={pulse} />
              </View>
            ))}
          </View>
          <SkeletonBlock
            width="100%"
            height={8}
            borderRadius={4}
            color={DARK_BLOCK}
            pulse={pulse}
          />
          <View style={styles.h2hTeams}>
            <SkeletonBlock width={84} height={10} color={DARK_BLOCK} pulse={pulse} />
            <SkeletonBlock width={68} height={10} color={DARK_BLOCK} pulse={pulse} />
          </View>
        </View>
      </View>

      <View style={styles.previewBlock}>
        <SkeletonBlock width={96} height={12} color={DARK_BLOCK} pulse={pulse} />
        <View style={styles.formColumns}>
          <FormColumnSkeleton pulse={pulse} />
          <FormColumnSkeleton pulse={pulse} align="right" />
        </View>
      </View>
    </View>
  );
}

function FormColumnSkeleton({
  pulse,
  align = 'left',
}: {
  pulse: SkeletonPulse;
  align?: 'left' | 'right';
}) {
  return (
    <View
      style={[styles.formColumn, { alignItems: align === 'right' ? 'flex-end' : 'flex-start' }]}
    >
      <View style={styles.formTeamRow}>
        <SkeletonBlock width={9} height={9} borderRadius={4.5} color={DARK_BLOCK} pulse={pulse} />
        <SkeletonBlock width={84} height={11} color={DARK_BLOCK} pulse={pulse} />
      </View>
      <View style={styles.formPills}>
        {Array.from({ length: FORM_PILLS }, (_, index) => (
          <SkeletonBlock
            key={index}
            width={20}
            height={20}
            borderRadius={5}
            color={DARK_BLOCK}
            pulse={pulse}
          />
        ))}
      </View>
      <View style={styles.formMeta}>
        <SkeletonBlock width={116} height={9} color={DARK_BLOCK} pulse={pulse} />
        <SkeletonBlock width={92} height={9} color={DARK_BLOCK} pulse={pulse} />
      </View>
    </View>
  );
}

const BROADCAST_ROWS = 2;

/** Channel rows on the watch tab, below the country picker and mode toggle. */
export function BroadcastRowsSkeleton() {
  const pulse = useSkeletonPulse();

  return (
    <>
      {Array.from({ length: BROADCAST_ROWS }, (_, index) => (
        <View key={index} testID="sports-skeleton-broadcast-row" style={styles.broadcastRow}>
          <SkeletonBlock width={32} height={32} borderRadius={6} color={DARK_BLOCK} pulse={pulse} />
          <View style={styles.broadcastInfo}>
            <SkeletonBlock
              width={index === 0 ? 132 : 108}
              height={12}
              color={DARK_BLOCK}
              pulse={pulse}
            />
            <SkeletonBlock
              width={index === 0 ? 96 : 84}
              height={10}
              color={DARK_BLOCK}
              pulse={pulse}
            />
          </View>
          <SkeletonBlock width={26} height={26} borderRadius={13} color={DARK_BLOCK} pulse={pulse} />
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  lineBox: {
    justifyContent: 'center',
  },
  fill: {
    flex: 1,
  },

  // matches-list.tsx / team-sheet.tsx grouped rows
  matchCard: {
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  // match-row.tsx `row`
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingRight: 12,
    minHeight: 64,
  },
  matchStatus: {
    width: 64,
    alignItems: 'center',
  },
  matchTeams: {
    flex: 1,
    gap: 6,
  },
  matchTeamLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: TEXT_LINE,
  },
  matchTeamName: {
    flex: 1,
  },
  matchTrailing: {
    width: 24,
    alignItems: 'flex-end',
    marginLeft: 4,
  },

  // league-header.tsx
  leagueHeaderContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  leagueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  leagueHeaderTitles: {
    flex: 1,
  },
  leagueHeaderSubtitle: {
    marginTop: 1,
  },

  // standings-table.tsx / scorers-list.tsx rows
  standingsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  standingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  standingsPosition: {
    width: 28,
    height: TEXT_LINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  standingsTeam: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 140,
    height: TEXT_LINE,
    gap: 6,
  },
  standingsStat: {
    width: 32,
    height: TEXT_LINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scorerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scorerRank: {
    width: 28,
    height: TEXT_LINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scorerInfo: {
    flex: 1,
    gap: 2,
  },
  scorerTeamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: TEXT_LINE,
  },
  scorerStats: {
    alignItems: 'flex-end',
    minWidth: 40,
  },

  // competition-grid.tsx
  gridContainer: {
    gap: GRID_GAP,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  gridSectionLabel: {
    marginTop: 4,
  },

  // team-search-modal.tsx `resultRow`
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  // team-sheet.tsx
  teamScheduleSection: {
    paddingTop: 8,
  },
  teamScheduleLabel: {
    paddingHorizontal: 20,
    paddingBottom: 6,
  },

  // match-stats-tab.tsx
  statsContent: {
    padding: 16,
    paddingBottom: 28,
    gap: 20,
  },
  statGroup: {
    gap: 14,
  },
  statRow: {
    gap: 6,
  },
  statValues: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 16,
  },
  statLabel: {
    flex: 1,
    alignItems: 'center',
  },
  statTrack: {
    flexDirection: 'row',
    gap: 4,
    height: 5,
  },

  // match-lineups-tab.tsx
  lineupsContent: {
    padding: 16,
    paddingBottom: 28,
    gap: 16,
  },
  formationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  teamTag: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  teamTagRight: {
    justifyContent: 'flex-end',
  },
  pitchVertical: {
    aspectRatio: 0.66,
  },
  pitchHorizontal: {
    aspectRatio: 1.85,
  },
  subs: {
    gap: 8,
  },
  subColumns: {
    flexDirection: 'row',
    gap: 16,
  },
  subColumn: {
    flex: 1,
    gap: 4,
  },
  subTeamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 3,
    height: 22,
  },

  // match-timeline-tab.tsx
  timelineContent: {
    padding: 16,
    paddingBottom: 28,
  },
  timelineCompact: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 52,
  },
  timelineSide: {
    flex: 1,
    justifyContent: 'center',
  },
  timelineSideLeft: {
    alignItems: 'flex-end',
    paddingRight: 10,
  },
  timelineSideRight: {
    alignItems: 'flex-start',
    paddingLeft: 10,
  },
  timelineSubLine: {
    marginTop: 3,
  },
  timelineCenter: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 4,
  },
  timelineRail: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: FAINT,
  },
  timelineMinute: {
    marginTop: 3,
  },

  // match-preview-tab.tsx
  previewContent: {
    padding: 16,
    paddingBottom: 28,
    gap: 22,
  },
  previewBlock: {
    gap: 12,
  },
  h2hCard: {
    gap: 10,
  },
  h2hCounts: {
    flexDirection: 'row',
  },
  h2hCount: {
    flex: 1,
    gap: 2,
  },
  h2hTeams: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  formColumns: {
    flexDirection: 'row',
    gap: 12,
  },
  formColumn: {
    flex: 1,
    gap: 10,
  },
  formTeamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  formPills: {
    flexDirection: 'row',
    gap: 4,
  },
  formMeta: {
    gap: 3,
  },

  // match-watch-tab.tsx `channelRow`
  broadcastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: FAINT,
  },
  broadcastInfo: {
    flex: 1,
    gap: 2,
  },
});
