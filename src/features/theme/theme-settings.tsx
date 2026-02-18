import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { memo, useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CustomizeThemeModal } from './customize-theme-modal';

export const ThemeSettings = memo(function ThemeSettings() {
  const [modalVisible, setModalVisible] = useState(false);
  const tintColor = useThemeColor({}, 'tint');

  const handleOpen = useCallback(() => setModalVisible(true), []);
  const handleClose = useCallback(() => setModalVisible(false), []);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <ThemedText type="subtitle" style={styles.header}>
          Customize Theme
        </ThemedText>

        <Pressable style={styles.preferenceRow} onPress={handleOpen}>
          <View style={styles.labelContainer}>
            <ThemedText style={styles.label}>Page Header Backgrounds</ThemedText>
          </View>
          <IconSymbol name="chevron.right" size={32} color={tintColor} />
        </Pressable>
      </View>

      <CustomizeThemeModal visible={modalVisible} onClose={handleClose} />
    </ThemedView>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 0,
  },
  header: {
    marginBottom: 8,
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  labelContainer: {
    flex: 1,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
  },
});
