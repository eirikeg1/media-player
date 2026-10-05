/**
 * Asset bootstrap for the recommendation taste model: materialize the bundled
 * artifact once per launch and hand its path to the Rust engine.
 */
import {
  __resetRecommendationModelLoad,
  ensureRecommendationModelLoaded,
} from '@/services/recommendation-model';
import { getRustDatabase } from '@/services/rust-channel-service';
import { Database as M3uDatabaseFake } from '@/test/fakes/m3u-database-fake';
import { resetTestDatabases } from '@/test/helpers';
import { Asset } from 'expo-asset';

jest.mock('expo-asset', () => ({
  Asset: { fromModule: jest.fn() },
}));

type FakeDb = InstanceType<typeof M3uDatabaseFake>;

const MODEL_URI = 'file:///data/user/0/app/cache/recs-model.bin';

const fromModule = jest.mocked(Asset.fromModule);
let downloadAsync: jest.Mock;
let db: FakeDb;

/** Stand in for the bundled asset, resolving to `localUri` after download. */
function stubAsset(overrides: Partial<{ localUri: string | null; uri: string }> = {}) {
  downloadAsync = jest.fn().mockResolvedValue(undefined);
  fromModule.mockReturnValue({
    downloadAsync,
    localUri: MODEL_URI,
    uri: 'asset:/recs-model.bin',
    ...overrides,
  } as unknown as Asset);
}

beforeEach(async () => {
  await resetTestDatabases();
  __resetRecommendationModelLoad();
  stubAsset();
  db = (await getRustDatabase()) as unknown as FakeDb;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ensureRecommendationModelLoaded', () => {
  it('downloads the bundled artifact and loads it into the engine', async () => {
    await expect(ensureRecommendationModelLoaded()).resolves.toBe(true);

    expect(downloadAsync).toHaveBeenCalledTimes(1);
    expect(db.__recommendationModelPath).toBe(MODEL_URI);
    await expect(db.isRecommendationModelLoaded()).resolves.toBe(true);
  });

  it('loads once per launch no matter how many callers ask', async () => {
    const [first, second] = await Promise.all([
      ensureRecommendationModelLoaded(),
      ensureRecommendationModelLoaded(),
    ]);
    await ensureRecommendationModelLoaded();

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(downloadAsync).toHaveBeenCalledTimes(1);
  });

  it('falls back to the bundled uri when the asset has no local copy', async () => {
    stubAsset({ localUri: null });

    await expect(ensureRecommendationModelLoaded()).resolves.toBe(true);
    expect(db.__recommendationModelPath).toBe('asset:/recs-model.bin');
  });

  it('reports failure instead of throwing, leaving the engine model-less', async () => {
    stubAsset();
    downloadAsync.mockRejectedValue(new Error('no space left on device'));

    await expect(ensureRecommendationModelLoaded()).resolves.toBe(false);
    await expect(db.isRecommendationModelLoaded()).resolves.toBe(false);
  });
});
