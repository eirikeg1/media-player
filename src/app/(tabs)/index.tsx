import { Image } from 'expo-image';
import { Platform, StyleSheet, View } from 'react-native';

import ParallaxScrollView from '@/components/ui/containers/parallax-scroll-view';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { VideoPreviewCarousel } from '@/features/general-placeholder-components/preview-components/preview-carousel';
import { VideoPreviewGrid } from '@/features/general-placeholder-components/preview-components/preview-grid';
import { VideoGridItem } from '@/features/general-placeholder-components/preview-components/video-grid-item';
import { Link } from 'expo-router';
import { useMemo } from 'react';

export default function HomeScreen() {
  const data = useMemo(() => Array.from({ length: 25 }, (_, i) => i), []);


  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#2D2D2D', dark: '#1A1A1A' }}
      padding={0}
      showsVerticalScrollIndicator={false}
      headerImage={
        <View style={styles.headerContainer}>
          <Image
            source={require('../../../assets/images/parallax-headers/movies/rick-and-morty-colorful.jpg')}
            style={styles.headerBackground}
            contentFit="cover"
          />
          {/* <Image
            source={require('../../../assets/images/football-scene-horizontal.png')}
            style={styles.headerOverlay}
            contentFit="contain"
          /> */}
        </View>
      }
    >
      <VideoPreviewCarousel title="Recommended" data={data} />
      <VideoPreviewGrid title="All Videos">
        {data.map((item) => (
          <VideoGridItem key={item} displayIndex={item + 1} />
        ))}
      </VideoPreviewGrid>
      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">Step 1: Try it</ThemedText>
        <ThemedText>
          Edit <ThemedText type="defaultSemiBold">app/(tabs)/index.tsx</ThemedText> to see changes.
          Press{' '}
          <ThemedText type="defaultSemiBold">
            {Platform.select({
              ios: 'cmd + d',
              android: 'cmd + m',
              web: 'F12',
            })}
          </ThemedText>{' '}
          to open developer tools.
        </ThemedText>
      </ThemedView>
      <ThemedView style={styles.stepContainer}>
        <Link href="/modal">
          <Link.Trigger>
            <ThemedText type="subtitle">Step 2: Explore</ThemedText>
          </Link.Trigger>
          <Link.Preview />
          <Link.Menu>
            <Link.MenuAction title="Action" icon="cube" onPress={() => alert('Action pressed')} />
            <Link.MenuAction
              title="Share"
              icon="square.and.arrow.up"
              onPress={() => alert('Share pressed')}
            />
            <Link.Menu title="More" icon="ellipsis">
              <Link.MenuAction
                title="Delete"
                icon="trash"
                destructive
                onPress={() => alert('Delete pressed')}
              />
            </Link.Menu>
          </Link.Menu>
        </Link>

        <ThemedText>
          {`Tap the Explore tab to learn more about what's included in this starter app.`}
        </ThemedText>
      </ThemedView>
      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">Step 3: Get a fresh start</ThemedText>
        <ThemedText>
          {`When you're ready, run `}
          <ThemedText type="defaultSemiBold">npm run reset-project</ThemedText> to get a fresh{' '}
          <ThemedText type="defaultSemiBold">app</ThemedText> directory. This will move the current{' '}
          <ThemedText type="defaultSemiBold">app</ThemedText> to{' '}
          <ThemedText type="defaultSemiBold">app-example</ThemedText>.
        </ThemedText>
      </ThemedView>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 8,
  },
  headerContainer: {
    width: '100%',
    height: '100%',
  },
  headerBackground: {
    width: '100%',
    height: '100%',
  },
  headerOverlay: {
    height: 140,
    width: 230,
    bottom: 2,
    left: -5,
    position: 'absolute',
  },
});
