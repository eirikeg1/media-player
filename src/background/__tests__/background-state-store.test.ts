import { backgroundStateStore } from '../background-state-store';

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('reads as off when nothing was ever saved', async () => {
  // The file-system mock reports no file, as on a first wake after install.
  await expect(backgroundStateStore.getSyncOnMobileData()).resolves.toBe(false);
});

it('serves what this process last saved, even when the write could not land', async () => {
  // The mock cannot write; the in-memory copy must still agree with the user.
  await backgroundStateStore.setSyncOnMobileData(true);

  await expect(backgroundStateStore.getSyncOnMobileData()).resolves.toBe(true);
});
