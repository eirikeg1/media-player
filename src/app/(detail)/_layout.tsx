import { Stack } from 'expo-router';

/**
 * The detail surfaces (movie, series, channel, match…) as real routes.
 *
 * They used to be React Native `Modal`s held in screen state, which put them
 * outside router history: starting playback from inside one replaced the whole
 * modal, so backing out of the player landed on the grid rather than on the
 * title the user came from. As a route group the player is simply pushed on top
 * and back walks the real stack.
 *
 * The group itself is presented modally — see the root layout, which is where
 * the presentation belongs: this stack's own first screen has nothing behind it
 * to be presented over. Pushes *within* the group (a match to a team, a team to
 * a league) are ordinary card pushes, which is what drilling down should look
 * like.
 */
export default function DetailLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
