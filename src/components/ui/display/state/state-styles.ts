import { StyleSheet } from 'react-native';

/**
 * Shared metrics for the empty/error state blocks, so the two never drift apart.
 * These are the numbers the per-tab copies of this layout already used.
 */
export const stateStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    minHeight: 200,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  /** Paired with `ThemedText`'s `body` type, which sets the size and the line. */
  message: {
    textAlign: 'center',
  },
  /** Takes over the title's spacing when there is no title above the message. */
  untitledMessage: {
    marginTop: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  /** Error shown inside an existing card or table rather than on its own screen. */
  inlineContainer: {
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  inlineMessage: {
    opacity: 0.7,
    textAlign: 'center',
  },
});
