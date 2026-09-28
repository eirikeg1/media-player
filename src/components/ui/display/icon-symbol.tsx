// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolViewProps, SymbolWeight } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, TextStyle, type StyleProp } from 'react-native';
type IconMapping = Partial<
  Record<SymbolViewProps['name'], ComponentProps<typeof MaterialIcons>['name']>
>;
export type IconSymbolName = keyof typeof MAPPING;

/**
 * SF Symbol → Material Icon, for the icons the app actually uses.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 *
 * `satisfies` (never a cast): it checks every key against the SF Symbol catalog
 * and every value against the Material Icons catalog while keeping the keys
 * literal, so an unmapped name is a type error at the call site instead of a
 * blank square on Android. Add the icon here before using it.
 */
const MAPPING = {
  // Navigation & Basic
  'house.fill': 'home',
  'chevron.right': 'chevron-right',
  'chevron.left': 'chevron-left',
  'chevron.down': 'expand-more',
  'chevron.up': 'expand-less',
  'arrow.up': 'arrow-upward',
  'arrow.down': 'arrow-downward',
  'xmark': 'close',
  'magnifyingglass': 'search',

  // Settings & Actions
  'gearshape.fill': 'settings',
  'plus': 'add',
  'plus.circle.fill': 'add-circle',
  'trash': 'delete',
  'pencil': 'edit',
  'arrow.clockwise': 'refresh',
  'arrow.triangle.2.circlepath': 'sync',
  'rotate.right': 'screen-rotation',
  'slider.horizontal.3': 'tune',
  'arrow.up.arrow.down': 'swap-vert',

  // Media Controls
  'play.fill': 'play-arrow',
  'play.circle': 'play-circle',
  'play.circle.fill': 'play-circle-filled',
  'pause.fill': 'pause',
  'stop': 'stop',
  'backward.end.fill': 'skip-previous',
  'forward.end.fill': 'skip-next',
  'gobackward': 'replay',
  'speaker.wave.2.fill': 'volume-up',

  // Media & Info
  'play.tv': 'live-tv',
  'tv': 'tv',
  'tv.fill': 'tv',
  'film.fill': 'movie',

  // Status & Feedback
  'checkmark': 'check',
  'checkmark.circle.fill': 'check-circle',
  'xmark.circle.fill': 'cancel',
  'exclamationmark.triangle': 'warning',

  // Favorites & Social
  'star': 'star-border',
  'star.fill': 'star',
  'star.leadinghalf.filled': 'star-half',
  'hand.thumbsup': 'thumb-up',
  'hand.thumbsup.fill': 'thumb-up',
  'hand.thumbsdown': 'thumb-down',
  'hand.thumbsdown.fill': 'thumb-down',

  // Content & Organization
  'folder': 'folder',
  'list.bullet': 'list',
  'flag': 'flag',
  'link': 'link',

  // Time & Calendar
  'clock': 'schedule',
  'calendar': 'calendar-today',

  // System & Connectivity
  'wifi': 'wifi',
  'airplayvideo': 'airplay',
  'sun.max.fill': 'wb-sunny',

  // People
  'person.2': 'people',
  'person.2.fill': 'people',

  // Sports
  'sportscourt.fill': 'sports-soccer',
} satisfies IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
