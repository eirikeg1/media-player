// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolViewProps, SymbolWeight } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, TextStyle, type StyleProp } from 'react-native';
type IconMapping = Record<SymbolViewProps['name'], ComponentProps<typeof MaterialIcons>['name']>;
export type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  // Navigation & Basic
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  'chevron.left': 'chevron-left',
  'chevron.down': 'expand-more',
  'chevron.up': 'expand-less',
  'arrow.left': 'arrow-back',
  'arrow.right': 'arrow-forward',
  'arrow.up': 'arrow-upward',
  'arrow.down': 'arrow-downward',
  'xmark': 'close',
  'line.horizontal.3': 'menu',
  'magnifyingglass': 'search',

  // Settings & Actions
  'gearshape.fill': 'settings',
  'gearshape': 'settings',
  'plus': 'add',
  'plus.circle': 'add-circle',
  'plus.circle.fill': 'add-circle',
  'minus': 'remove',
  'minus.circle': 'remove-circle',
  'trash': 'delete',
  'trash.fill': 'delete',
  'pencil': 'edit',
  'arrow.clockwise': 'refresh',
  'arrow.counterclockwise': 'refresh',
  'square.and.arrow.up': 'share',
  'square.and.arrow.down': 'download',
  'arrow.down.circle': 'download',
  'arrow.up.circle': 'upload',

  // Media Controls
  'play': 'play-arrow',
  'play.fill': 'play-arrow',
  'play.circle': 'play-circle',
  'play.circle.fill': 'play-circle-filled',
  'pause': 'pause',
  'pause.fill': 'pause',
  'pause.circle': 'pause-circle',
  'pause.circle.fill': 'pause-circle-filled',
  'stop': 'stop',
  'stop.fill': 'stop',
  'stop.circle': 'stop-circle',
  'backward': 'skip-previous',
  'forward': 'skip-next',
  'backward.fill': 'skip-previous',
  'forward.fill': 'skip-next',
  'gobackward': 'replay',
  'goforward': 'forward',
  'speaker.wave.2': 'volume-up',
  'speaker.wave.2.fill': 'volume-up',
  'speaker.slash': 'volume-off',
  'speaker.slash.fill': 'volume-mute',
  'speaker': 'volume-down',

  // Media & Info
  'play.tv': 'live-tv',
  'play.tv.fill': 'live-tv',
  'tv': 'tv',
  'tv.fill': 'tv',
  'film': 'movie',
  'film.fill': 'movie',
  'video': 'videocam',
  'video.fill': 'videocam',
  'photo': 'image',
  'photo.fill': 'image',
  'music.note': 'music-note',
  'headphones': 'headset',
  'mic': 'mic',
  'mic.fill': 'mic',
  'mic.slash': 'mic-off',
  'video.slash': 'videocam-off',

  // Status & Feedback
  'checkmark': 'check',
  'checkmark.circle': 'check-circle',
  'checkmark.circle.fill': 'check-circle',
  'xmark.circle': 'cancel',
  'xmark.circle.fill': 'cancel',
  'exclamationmark.circle': 'error',
  'exclamationmark.circle.fill': 'error',
  'exclamationmark.triangle': 'warning',
  'exclamationmark.triangle.fill': 'warning',
  'info.circle': 'info',
  'info.circle.fill': 'info',
  'questionmark.circle': 'help',
  'questionmark.circle.fill': 'help',

  // Favorites & Social
  'heart': 'favorite-border',
  'heart.fill': 'favorite',
  'star': 'star-border',
  'star.fill': 'star',
  'star.leadinghalf.filled': 'star-half',
  'bookmark': 'bookmark-border',
  'bookmark.fill': 'bookmark',
  'hand.thumbsup': 'thumb-up',
  'hand.thumbsup.fill': 'thumb-up',
  'hand.thumbsdown': 'thumb-down',
  'hand.thumbsdown.fill': 'thumb-down',

  // Content & Organization
  'folder': 'folder',
  'folder.fill': 'folder',
  'folder.badge.plus': 'create-new-folder',
  'doc': 'description',
  'doc.fill': 'description',
  'list.bullet': 'list',
  'square.grid.2x2': 'grid-view',
  'square.grid.3x3': 'apps',
  'rectangle.stack': 'layers',
  'tray': 'inbox',
  'tray.fill': 'inbox',

  // Time & Calendar
  'clock': 'schedule',
  'clock.fill': 'schedule',
  'calendar': 'calendar-today',
  'timer': 'timer',
  'hourglass': 'hourglass-empty',

  // Security & Privacy
  'lock': 'lock',
  'lock.fill': 'lock',
  'lock.open': 'lock-open',
  'lock.open.fill': 'lock-open',
  'eye': 'visibility',
  'eye.fill': 'visibility',
  'eye.slash': 'visibility-off',
  'eye.slash.fill': 'visibility-off',
  'shield': 'security',
  'shield.fill': 'security',

  // System & Connectivity
  'wifi': 'wifi',
  'wifi.slash': 'wifi-off',
  'airplayvideo': 'airplay',
  'antenna.radiowaves.left.and.right': 'signal-cellular-alt',
  'bolt': 'flash-on',
  'bolt.fill': 'flash-on',
  'bolt.slash': 'flash-off',
  'battery.100': 'battery-full',
  'battery.50': 'battery-3-bar',
  'battery.25': 'battery-2-bar',
  'battery.0': 'battery-0-bar',
  'bell': 'notifications',
  'bell.fill': 'notifications',
  'bell.slash': 'notifications-off',

  // Display & Appearance
  'sun.max': 'wb-sunny',
  'sun.max.fill': 'wb-sunny',
  'moon': 'nightlight',
  'moon.fill': 'nightlight',
  'circle.lefthalf.fill': 'brightness-medium',
  'display': 'desktop-windows',
  'rectangle.fill.on.rectangle.fill': 'picture-in-picture',
  'arrow.up.left.and.arrow.down.right': 'fullscreen',
  'arrow.down.right.and.arrow.up.left': 'fullscreen-exit',

  // Miscellaneous
  'person': 'person',
  'person.fill': 'person',
  'person.circle': 'account-circle',
  'person.circle.fill': 'account-circle',
  'ellipsis': 'more-horiz',
  'ellipsis.circle': 'more-horiz',
  'slider.horizontal.3': 'tune',
  'paintbrush': 'palette',
  'wand.and.stars': 'auto-awesome',
  'link': 'link',
  'link.circle': 'link',
  'flag': 'flag',
  'flag.fill': 'flag',
  'arrow.up.arrow.down': 'swap-vert',
} as IconMapping;

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
