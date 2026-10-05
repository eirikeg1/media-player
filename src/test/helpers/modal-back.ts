import { fireEvent, screen } from '@testing-library/react-native';

/**
 * The `Modal` an `AnimatedModal`-based component renders — its root element.
 *
 * Android back reaches a visible Modal through its own Dialog window, so it
 * arrives as the Modal's `requestClose` event and never as a BackHandler press.
 */
function getModal() {
  const root = screen.root;
  if (!root || root.type !== 'Modal') {
    throw new Error(`Expected the rendered root to be a Modal, got ${root?.type ?? 'nothing'}`);
  }
  return root;
}

/** Whether Android back currently dismisses the modal at all. */
export function backIsWired(): boolean {
  return typeof getModal().props.onRequestClose === 'function';
}

/** Press the Android hardware back button on the modal. */
export async function pressBack(): Promise<void> {
  await fireEvent(getModal(), 'requestClose');
}
