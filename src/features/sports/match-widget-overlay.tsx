import { IconSymbol } from '@/components/ui/display/icon-symbol';
import type { Fixture } from 'expo-m3u-parser';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MatchDetailContent } from './match-detail/match-detail-content';
import { buildMatchTabs, getFixtureScoreDisplay } from './match-widgets';

interface MatchWidgetOverlayProps {
  visible: boolean;
  fixture: Fixture;
  onClose: () => void;
}

/** The content's own orientation, toggled by the rotate button. Independent of
 * the device: the rotate button reorients only the card's content, never the
 * app or the video behind it. */
type ContentOrientation = 'landscape' | 'portrait';

/**
 * Full-screen overlay that floats SofaScore match info above the video.
 *
 * It is rendered as an absolute sibling of the `VideoView` (not a native
 * `Modal`) so the stream keeps playing and stays visible behind the dimmed
 * backdrop. When hidden it renders nothing, so the WebView is not created until
 * the user opens it.
 *
 * The card keeps the **same on-screen footprint** whether it is showing
 * landscape or portrait content — portrait simply lays the card out with its
 * width/height swapped and counter-rotates it 90° so it occupies the exact same
 * rectangle, just reoriented. Only the content rotates; the modal does not grow,
 * shrink, or go fullscreen.
 */
export const MatchWidgetOverlay = memo(function MatchWidgetOverlay({
  visible,
  fixture,
  onClose,
}: MatchWidgetOverlayProps) {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const tabs = useMemo(() => buildMatchTabs(fixture), [fixture]);
  // The `fixture` prop already carries the live-polled score (merged upstream in
  // the video player), so the header just reflects it.
  const score = useMemo(() => getFixtureScoreDisplay(fixture), [fixture]);
  const [activeKey, setActiveKey] = useState(tabs[0]?.key);
  const [orientation, setOrientation] = useState<ContentOrientation>('landscape');

  // The overlay stays mounted while hidden (so section caches survive), which
  // means `activeKey`'s initial value can predate kickoff. Re-derive the
  // default tab on each open — the fixture's status may have reordered the
  // tabs since — without touching the user's selection while it is open.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setActiveKey(tabs[0]?.key);
  }

  const activeTab = tabs.find((tab) => tab.key === activeKey) ?? tabs[0];
  const isLandscape = orientation === 'landscape';

  const toggleOrientation = useCallback(() => {
    setOrientation((current) => (current === 'landscape' ? 'portrait' : 'landscape'));
  }, []);

  // Hardware back closes the overlay first (listener is LIFO, so it runs before
  // the player's back handler) instead of leaving the stream.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  if (!visible || !activeTab) return null;

  const selectTab = (key: typeof activeKey) => setActiveKey(key);

  // The card's on-screen rectangle — identical in both orientations. Portrait
  // just swaps these and rotates, so the rotated footprint lands on the very
  // same rectangle (no resize, no clipping).
  const cardW = Math.min(winW - 32, 720);
  const cardH = Math.max(0, winH - insets.top - insets.bottom - 24);
  const cardSizeStyle = isLandscape
    ? { width: cardW, height: cardH }
    : {
        width: cardH,
        height: cardW,
        // -90° so that, turning the phone clockwise into portrait, the content's
        // bottom ends up at the bottom of the phone (not off to the side).
        transform: [{ rotate: '-90deg' as const }],
      };

  const content = (
    <MatchDetailContent
      fixture={fixture}
      activeKey={activeTab.key}
      homeLabel={score.home}
      awayLabel={score.away}
      compact={isLandscape}
    />
  );

  return (
    <View style={styles.root} pointerEvents="box-none">
      {/* Dim backdrop — tap to dismiss. */}
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close match info"
      />

      {/* Per-side safe-area padding: the card fills the padded area exactly
          (cardH subtracts both insets), so asymmetric insets can't push the
          header under a notch or status bar. */}
      <View
        style={[
          styles.cardArea,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 },
        ]}
        pointerEvents="box-none"
      >
        <View style={[styles.card, cardSizeStyle]}>
          <View style={styles.header}>
            <View style={styles.titleBlock}>
              <ThemedTitle home={score.home} away={score.away} />
              <View style={styles.scoreRow}>
                {score.score && <ThemedScore value={score.score} color={score.statusColor} />}
                <ThemedStatus value={score.status} color={score.statusColor} live={score.isLive} />
              </View>
            </View>
            <View style={styles.headerButtons}>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={toggleOrientation}
                accessibilityRole="button"
                accessibilityLabel={isLandscape ? 'Rotate to portrait' : 'Rotate to landscape'}
                hitSlop={8}
              >
                <IconSymbol name="rotate.right" size={20} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={8}
              >
                <IconSymbol name="xmark" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>

          {isLandscape ? (
            // Landscape: tabs move to a compact left sidebar, reclaiming the
            // vertical band the horizontal strip used and giving content full height.
            <View style={styles.bodyRow}>
              <View style={styles.sidebar}>
                {tabs.map((tab) => (
                  <TabButton
                    key={tab.key}
                    label={tab.label}
                    selected={tab.key === activeTab.key}
                    style={styles.sidebarTab}
                    onPress={() => selectTab(tab.key)}
                  />
                ))}
              </View>
              <View style={styles.contentContainer}>{content}</View>
            </View>
          ) : (
            <>
              <View style={styles.tabStrip}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.tabStripContent}
                >
                  {tabs.map((tab) => (
                    <TabButton
                      key={tab.key}
                      label={tab.label}
                      selected={tab.key === activeTab.key}
                      style={styles.tab}
                      onPress={() => selectTab(tab.key)}
                    />
                  ))}
                </ScrollView>
              </View>
              <View style={styles.contentContainer}>{content}</View>
            </>
          )}
        </View>
      </View>
    </View>
  );
});

// Small presentational pieces kept local to avoid pulling ThemedText (which is
// theme-aware); the overlay always sits on a dark card over the video.
function ThemedTitle({ home, away }: { home: string; away: string }) {
  return (
    <Text style={styles.title} numberOfLines={1}>
      {home} <Text style={styles.titleSeparator}>v</Text> {away}
    </Text>
  );
}

function ThemedScore({ value, color }: { value: string; color: string }) {
  return <Text style={[styles.score, { color }]}>{value}</Text>;
}

function ThemedStatus({ value, color, live }: { value: string; color: string; live: boolean }) {
  return (
    <View style={styles.statusPill}>
      {live && <View style={[styles.liveDot, { backgroundColor: color }]} />}
      <Text style={[styles.status, { color }]}>{value}</Text>
    </View>
  );
}

function TabButton({
  label,
  selected,
  style,
  onPress,
}: {
  label: string;
  selected: boolean;
  style: ViewStyle;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[style, selected && styles.tabSelected]}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const CARD_BACKGROUND = '#141417';
const FAINT_BORDER = 'rgba(255, 255, 255, 0.12)';

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  cardArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: CARD_BACKGROUND,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: FAINT_BORDER,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  titleBlock: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  titleSeparator: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '400',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  score: {
    fontSize: 15,
    fontWeight: '700',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  status: {
    fontSize: 12,
    fontWeight: '600',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bodyRow: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: 124,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 10,
    gap: 8,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: FAINT_BORDER,
  },
  sidebarTab: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  tabStrip: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: FAINT_BORDER,
  },
  tabStripContent: {
    paddingHorizontal: 12,
    gap: 8,
    paddingBottom: 10,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  tabSelected: {
    backgroundColor: '#FFFFFF',
  },
  tabLabel: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 140,
  },
  tabLabelSelected: {
    color: '#000000',
  },
  contentContainer: {
    flex: 1,
    backgroundColor: CARD_BACKGROUND,
  },
});
