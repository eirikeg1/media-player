import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { backIsWired, pressBack } from '@/test/helpers/modal-back';
import { AnimatedModal } from '../animated-modal';

/**
 * A visible Modal swallows the Android back key inside its own Dialog window,
 * so `onRequestClose` is the only route by which back can dismiss one.
 */
describe('AnimatedModal', () => {
  it('dismisses on Android back', async () => {
    const onClose = jest.fn();
    await render(
      <AnimatedModal visible onClose={onClose}>
        <Text>Body</Text>
      </AnimatedModal>
    );

    await pressBack();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('leaves back inert when the caller offers no dismissal', async () => {
    await render(
      <AnimatedModal visible>
        <Text>Body</Text>
      </AnimatedModal>
    );

    expect(backIsWired()).toBe(false);
  });
});
