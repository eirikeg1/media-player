import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from '../button';

describe('Button', () => {
  it('renders its title', async () => {
    await render(<Button title="Save" />);

    expect(screen.getByText('Save')).toBeOnTheScreen();
  });

  it('exposes an accessible button role with the title as default label', async () => {
    await render(<Button title="Save" />);

    expect(screen.getByRole('button', { name: 'Save' })).toBeOnTheScreen();
  });

  it('prefers an explicit accessibilityLabel over the title', async () => {
    await render(<Button title="Save" accessibilityLabel="Save playlist" />);

    expect(screen.getByRole('button', { name: 'Save playlist' })).toBeOnTheScreen();
  });

  it('calls onPress when pressed', async () => {
    const onPress = jest.fn();
    await render(<Button title="Save" onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', async () => {
    const onPress = jest.fn();
    await render(<Button title="Save" onPress={onPress} disabled />);

    await fireEvent.press(screen.getByRole('button'));

    expect(onPress).not.toHaveBeenCalled();
  });

  it('is reported as disabled to accessibility when disabled', async () => {
    await render(<Button title="Save" disabled />);

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it.each([
    ['primary', '#007AFF'],
    ['danger', '#FF3B30'],
    ['ghost', 'transparent'],
  ] as const)('applies the %s variant background color', async (variant, backgroundColor) => {
    await render(<Button title="Save" variant={variant} />);

    expect(screen.getByRole('button')).toHaveStyle({ backgroundColor });
  });

  it('stretches to full width when fullWidth is set', async () => {
    await render(<Button title="Save" fullWidth />);

    expect(screen.getByRole('button')).toHaveStyle({ alignSelf: 'stretch' });
  });
});
