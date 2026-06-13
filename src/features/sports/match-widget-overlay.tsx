import { IconSymbol } from '@/components/ui/display/icon-symbol';
import type { Fixture } from 'expo-m3u-parser';
import { memo, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { buildMatchWidgetTabs, getFixtureScoreDisplay, isSofascoreUrl } from './match-widgets';

interface MatchWidgetOverlayProps {
  visible: boolean;
  fixture: Fixture;
  onClose: () => void;
}

/**
 * Full-screen overlay that floats SofaScore match widgets above the video.
 *
 * It is rendered as an absolute sibling of the `VideoView` (not a native
 * `Modal`) so the stream keeps playing and stays visible behind the dimmed
 * backdrop. When hidden it renders nothing, so the WebView is not created until
 * the user opens it.
 */
export const MatchWidgetOverlay = memo(function MatchWidgetOverlay({
  visible,
  fixture,
  onClose,
}: MatchWidgetOverlayProps) {
  const insets = useSafeAreaInsets();
  const tabs = useMemo(() => buildMatchWidgetTabs(fixture), [fixture]);
  const score = useMemo(() => getFixtureScoreDisplay(fixture), [fixture]);
  const [activeKey, setActiveKey] = useState(tabs[0]?.key);
  const [isLoading, setIsLoading] = useState(true);

  const activeTab = tabs.find((tab) => tab.key === activeKey) ?? tabs[0];

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

  return (
    <View style={styles.root} pointerEvents="box-none">
      {/* Dim backdrop — tap to dismiss. */}
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close match info"
      />

      <View
        style={[
          styles.card,
          { marginTop: insets.top + 12, marginBottom: insets.bottom + 12 },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.titleBlock}>
            <ThemedTitle home={score.home} away={score.away} />
            <View style={styles.scoreRow}>
              {score.score && (
                <ThemedScore value={score.score} color={score.statusColor} />
              )}
              <ThemedStatus value={score.status} color={score.statusColor} live={score.isLive} />
            </View>
          </View>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
          >
            <IconSymbol name="xmark" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.tabStrip}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabStripContent}
          >
            {tabs.map((tab) => {
              const selected = tab.key === activeTab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.tab, selected && styles.tabSelected]}
                  onPress={() => {
                    if (tab.key !== activeKey) {
                      setIsLoading(true);
                      setActiveKey(tab.key);
                    }
                  }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                >
                  <ThemedTabLabel value={tab.label} selected={selected} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.webviewContainer}>
          <WebView
            key={activeTab.key}
            source={{ uri: activeTab.url }}
            style={styles.webview}
            originWhitelist={['https://*']}
            onLoadStart={() => setIsLoading(true)}
            onLoadEnd={() => setIsLoading(false)}
            javaScriptEnabled
            domStorageEnabled
            // Keep navigation within SofaScore (the widget and its assets/APIs
            // all live on *.sofascore.com / *.sofascore.app); block taps that
            // would navigate the embed away to an unrelated site.
            onShouldStartLoadWithRequest={isSofascoreUrl}
          />
          {isLoading && (
            <View style={styles.loadingOverlay} pointerEvents="none">
              <ActivityIndicator size="large" color="#FFFFFF" />
            </View>
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

function ThemedTabLabel({ value, selected }: { value: string; selected: boolean }) {
  return (
    <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]} numberOfLines={1}>
      {value}
    </Text>
  );
}

const CARD_BACKGROUND = '#141417';

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  card: {
    width: '100%',
    maxWidth: 720,
    flex: 1,
    backgroundColor: CARD_BACKGROUND,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.12)',
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
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabStrip: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.12)',
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
  webviewContainer: {
    flex: 1,
    backgroundColor: CARD_BACKGROUND,
  },
  webview: {
    flex: 1,
    backgroundColor: CARD_BACKGROUND,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: CARD_BACKGROUND,
  },
});
