/**
 * Bootstrap for the personalized recommendation taste model.
 *
 * `recs-model.bin` ships as a bundled asset, so it has no filesystem path until
 * expo-asset materializes it. This module does that once per launch and hands
 * the resulting path to the Rust engine, which keeps the model process-global
 * (see docs/recommendations.md).
 *
 * Loading is best-effort: without a model the engine degrades to its random
 * recommender, so callers never have to special-case a failure.
 */
import { Asset } from 'expo-asset';

import { RustChannelService } from '@/services/rust-channel-service';

const MODEL_MODULE = require('../../assets/recs/recs-model.bin');

/**
 * Single-flight across the launch: the startup hook and the home page both ask
 * for the model, and neither should trigger a second 3 MB copy or a second
 * FFI load.
 */
let loadPromise: Promise<boolean> | null = null;

async function loadModel(): Promise<boolean> {
  const asset = Asset.fromModule(MODEL_MODULE);
  await asset.downloadAsync();

  const path = asset.localUri ?? asset.uri;
  if (!path) {
    console.warn('[RecommendationModel] Asset has no local path; skipping load');
    return false;
  }

  await RustChannelService.loadRecommendationModel(path);
  return true;
}

/**
 * Make the taste model available to the recommendation engine.
 *
 * @returns whether a model is loaded — `false` means recommendations fall back
 *   to the random recommender for this launch.
 */
export function ensureRecommendationModelLoaded(): Promise<boolean> {
  if (!loadPromise) {
    loadPromise = loadModel().catch((error) => {
      console.warn('[RecommendationModel] Failed to load taste model:', error);
      return false;
    });
  }
  return loadPromise;
}

/** Test-only: forget the memoized load so the next call runs again. */
export function __resetRecommendationModelLoad(): void {
  loadPromise = null;
}
