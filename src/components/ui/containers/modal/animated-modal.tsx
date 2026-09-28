import { useColorScheme } from '@/hooks/use-color-scheme';
import { GlassColors } from '@/lib/theme';
import { BlurView } from 'expo-blur';
import { ReactNode, useEffect, useRef } from 'react';
import { Animated, Easing, Keyboard, Modal, Platform, StyleSheet, TouchableWithoutFeedback } from 'react-native';

interface AnimatedModalProps {
  children: ReactNode;
  visible: boolean;
  /** Dismissal the dialog's own controls don't cover: backdrop tap and Android
   *  back. Omitted (or momentarily undefined) means neither dismisses it. */
  onClose?: () => void;
}

/**
 * A reusable modal component with smooth entrance/exit animations and keyboard handling
 */
export function AnimatedModal({ children, visible, onClose }: AnimatedModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.8)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = visible
      ? // Entrance animation
        Animated.parallel([
          Animated.timing(backdropOpacity, {
            toValue: 1,
            duration: 300,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 400,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.spring(scale, {
            toValue: 1,
            tension: 100,
            friction: 8,
            useNativeDriver: true,
          }),
        ])
      : // Exit animation
        Animated.parallel([
          Animated.timing(backdropOpacity, {
            toValue: 0,
            duration: 200,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 200,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 0.9,
            duration: 200,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
        ]);

    animation.start();
    // A modal unmounted mid-transition (or reopened before one finished) would
    // otherwise leave the previous composition driving its values.
    return () => animation.stop();
  }, [visible, backdropOpacity, opacity, scale]);

  useEffect(() => {
    if (!visible) return;

    const keyboardWillShow = (event: any) => {
      const keyboardHeight = event.endCoordinates.height;
      Animated.spring(translateY, {
        toValue: -keyboardHeight / 3,
        tension: 80,
        friction: 8,
        useNativeDriver: true,
      }).start();
    };

    const keyboardWillHide = (event: any) => {
      Animated.spring(translateY, {
        toValue: 0,
        tension: 80,
        friction: 8,
        useNativeDriver: true,
      }).start();
    };

    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      keyboardWillShow
    );
    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      keyboardWillHide
    );

    return () => {
      showSubscription?.remove();
      hideSubscription?.remove();
    };
  }, [translateY, visible]);

  return (
    // A visible Modal consumes the Android back key inside its own Dialog
    // window, so no BackHandler listener in the app can see it: dismissing on
    // back has to go through onRequestClose, here.
    <Modal transparent visible={visible} statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        {/* A redundant dismiss target beside the dialog's own actions, so it is
            hidden from screen readers rather than announced as a nameless control. */}
        <TouchableWithoutFeedback onPress={onClose}>
          <BlurView
            intensity={isDark ? GlassColors.dark.backdropBlur : GlassColors.light.backdropBlur}
            tint={isDark ? 'dark' : 'light'}
            style={[styles.backdropTouchArea, {
              backgroundColor: isDark ? GlassColors.dark.backdrop : GlassColors.light.backdrop,
            }]}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </TouchableWithoutFeedback>
        <Animated.View
          style={[
            styles.modal,
            {
              backgroundColor: isDark ? 'rgba(14, 19, 32, 0.92)' : 'rgba(245, 246, 251, 0.92)',
              borderColor: isDark ? GlassColors.dark.border : GlassColors.light.border,
              borderWidth: 1,
              opacity,
              transform: [{ scale }, { translateY }]
            }
          ]}
        >
          {children}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  backdropTouchArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modal: {
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    minHeight: 200,
    maxHeight: '80%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 20,
  },
});