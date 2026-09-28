// Automatic Jest mock: expo-video's module body reaches for the native player
// class at import time, so requiring the real one throws in Node — which any
// test that renders a surface reaching the playback session (directly, or
// through `useChromeInsets`) would otherwise hit.
//
// Deliberately minimal: a player object with the surface the app touches, and a
// view that renders nothing. Suites that assert on player behaviour mock the
// module themselves (see `playback-session-store.test.ts`).
import { View } from 'react-native';

export interface MockVideoPlayer {
  loop: boolean;
  muted: boolean;
  playing: boolean;
  timeUpdateEventInterval: number;
  play: jest.Mock;
  pause: jest.Mock;
  release: jest.Mock;
  replaceAsync: jest.Mock;
  addListener: jest.Mock;
}

export function createVideoPlayer(): MockVideoPlayer {
  return {
    loop: false,
    muted: false,
    playing: false,
    timeUpdateEventInterval: 0,
    play: jest.fn(),
    pause: jest.fn(),
    release: jest.fn(),
    replaceAsync: jest.fn().mockResolvedValue(undefined),
    addListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  };
}

export const useVideoPlayer = createVideoPlayer;

export const VideoView = View;
