import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { backIsWired, pressBack } from '@/test/helpers/modal-back';
import { ConfirmDialog } from '../confirm-dialog';

describe('ConfirmDialog', () => {
  it('treats Android back as the dialog’s single plain action', async () => {
    const cancel = jest.fn();
    const confirm = jest.fn();
    await render(
      <ConfirmDialog
        visible
        title="Delete Playlist"
        message="Are you sure?"
        actions={[
          { title: 'Cancel', onPress: cancel },
          { title: 'Delete', variant: 'danger', onPress: confirm },
        ]}
      />
    );

    await pressBack();

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('prefers an explicit onCancel over the derived action', async () => {
    const onCancel = jest.fn();
    const fromBeginning = jest.fn();
    await render(
      <ConfirmDialog
        visible
        title="Resume Playback"
        message="Continue where you left off?"
        onCancel={onCancel}
        actions={[
          { title: 'From Beginning', onPress: fromBeginning },
          { title: 'Continue', variant: 'primary', onPress: jest.fn() },
        ]}
      />
    );

    await pressBack();

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(fromBeginning).not.toHaveBeenCalled();
  });

  it('offers no way out when no single action is the plain one', async () => {
    await render(
      <ConfirmDialog
        visible
        title="Pick one"
        message="Both choices are deliberate."
        actions={[
          { title: 'Left', onPress: jest.fn() },
          { title: 'Right', onPress: jest.fn() },
        ]}
      />
    );

    expect(backIsWired()).toBe(false);
  });

  it('withdraws back while an action is running, and restores it after', async () => {
    let finishClearing = () => {};
    const clear = jest.fn(() => new Promise<void>((resolve) => (finishClearing = resolve)));
    const cancel = jest.fn();
    await render(
      <ConfirmDialog
        visible
        title="Clear Viewing History"
        message="This cannot be undone."
        actions={[
          { title: 'Cancel', onPress: cancel },
          { title: 'Clear', variant: 'danger', onPress: clear },
        ]}
      />
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(backIsWired()).toBe(false));

    await pressBack();
    expect(cancel).not.toHaveBeenCalled();

    finishClearing();
    await waitFor(() => expect(backIsWired()).toBe(true));

    await pressBack();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
