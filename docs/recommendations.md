# Personalized recommendations (experimental)

Movie/series recommendations for the home page, driven by the user's likes,
dislikes, favorites and what they finished watching. Replaces the random
"Discover" selection with a taste model, while keeping the exact same delivery
pipeline (`cached` table → FFI → service → `DiscoverRow`).

## How it works

### The taste model

"Find users with a similar taste" is implemented without scraping anyone:
a matrix-factorization model is trained offline (dev-time) on the MovieLens
25M dataset — 25 million ratings by 162k real users. Training embeds every
movie into a 64-dimensional *taste space* whose geometry is literally the
structure of those users' tastes: two movies are close iff the same kinds of
people like them. Scoring the user's likes against it is equivalent to
aggregating the opinions of users who rate like they do, at a fraction of the
compute of runtime user-matching.

- Trainer: `native/rust-backend/crates/recs-train` (dev binary, not shipped).
  Input: MovieLens CSVs (`tmp/movielens/`, gitignored). ALS with per-user mean
  centering; per-iteration held-out RMSE; nearest-neighbour sanity listings.
- Artifact: `recs-model.bin` — quantized int8 factors (per-item scale), plus
  per movie: TMDB id, IMDb id, year, genre bits, popularity (log-scaled rating
  count), mean rating, and a normalized title for catalog matching. Format v1
  is defined in `native/rust-backend/crates/recs-model` (single source of
  truth for reader and writer).
- Runtime: `recs-model` loads the artifact, maps catalog items to model items
  (TMDB id → IMDb id → normalized title+year → unique title), folds the user's
  reactions into a taste vector (ridge fold-in), and scores candidates with
  dot products. Scoring the whole model is a few million int8 MACs —
  sub-millisecond; generation end to end is dominated by SQLite reads.

### Signals

Collected app-side (the per-user DB) and passed across the FFI as JSON at
generation time, since the Rust catalog DB has no user concept:

- **Reactions** (`user_content_reactions`): like = +1.0, dislike = −1.0.
- **Favorites**: +0.6 (a weaker "I like this" than an explicit like).
- **Watched**: +0.3 — a movie the user finished (≥90%), or a series they
  finished at least three episodes of. Nobody said they liked it; the engine is
  guessing from the fact that they stuck with it.
- **Seen set**: watched channel ids / series names from `channel_watch_stats`,
  plus everything reacted or favorited. Never recommended. Series names are
  derived app-side by running the TS port of `strip_episode_info` over the
  watched episode titles: the app DB stores episode titles, not series names,
  and resolving each one through the catalogue would cost one FFI round trip
  per watched episode on the startup path. The derivation is exact unless a
  channel's `tvg_name` differs from its title — in that case the name simply
  fails to match and a watched-but-unreacted series can recur (a reacted or
  favorited one is still excluded engine-side).

| Signal   | Weight | Stated by the user? |
| -------- | ------ | ------------------- |
| Like     | +1.0   | yes                 |
| Dislike  | −1.0   | yes                 |
| Favorite | +0.6   | yes                 |
| Watched  | +0.3   | no — inferred       |

A stated opinion **supersedes** the guess entirely: a watch adds its 0.3 only
where the same id carries no reaction and is not a favorite of the same kind. A
disliked title the user nonetheless finished stays at −1.0 rather than being
softened to −0.7, and a favorite stays at 0.6. Reactions and favorites keep
summing with each other (liked *and* favorited = 1.6). Every id carrying any
signal — watched included — is excluded from the batch it helped produce.

Movies drive the factor model directly. Series (not covered by MovieLens) are
scored by genre affinity: the signed, weight-summed genre distribution of
everything the user rated, matched against each series' metadata genres, with
the provider rating as a prior.

### The recommendation mix

How far a batch may be personalised is decided per generation from the
*resolved* signals — ids the catalogue could not resolve never count, so a
stale watch history cannot promote a user past what the engine actually knows
about them:

| Tier         | Earned by                                          | Movie slots            |
| ------------ | -------------------------------------------------- | ---------------------- |
| **Explicit** | ≥1 resolved reaction or favorite                   | 60% taste / 25% crowd  |
| **Implicit** | no stated opinion, but ≥4 resolved watched signals | 35% taste / 40% crowd  |
| **Popular**  | everything else                                    | 75% crowd, no taste    |

The slots themselves:

- **taste matches**: highest taste-score unseen movies.
- **crowd favorites**: taste matches additionally gated on high global
  popularity + mean rating in the model ("things both you and everyone like").
- **new & popular** (the remainder): recent releases (metadata release date)
  with high model popularity, softly filtered by taste. When a TMDB API key is
  configured this slot upgrades to TMDB's now-playing/popular lists (matched
  into the catalog); without a key it degrades to the panel-local variant.

The implicit tier's split says what it thinks of its own guess: inferred taste
is worth using, but a guessed-taste user leans harder on what everyone likes.

The **popular** tier has no taste vector at all, so it has no taste slot. Its
crowd slot ranks every candidate the model knows and rates ≥ 3.6 by
`popularity/255 + 0.25 · mean_rating/5` — popularity is the ranking key rather
than a gate — and the new & popular slot keeps its recency filter but drops the
taste factor, ranking on popularity alone (provider rating for titles the model
does not know). Series in this tier rank on `rating/10 + 0.15 if recent`. It is
otherwise an ordinary generation: same `user_recommendations` rows, same
rotation, same tie noise, same exclusions.

Diversity: generation receives the previously shown ids and penalizes them, so
consecutive batches rotate instead of repeating; scores get a small temperature
jitter so ties don't produce identical lists. This holds in every tier, so
consecutive popular batches rotate like any other.

Cold start is therefore the popular tier, not a random list. The legacy
random-with-valid-poster path remains only for the two cases where the engine
cannot run at all: no model loaded, or a zero-item request.

### Lifecycle (compute placement)

- **First run**: the home page's read call finds no cached batch and generates
  one synchronously — this happens behind the existing splash/loading screen.
- **Every subsequent show**: the read returns the stored batch instantly; the
  app then fire-and-forgets a regeneration of the *next* batch (same pattern
  the random recommender used). Restarting the app or pull-to-refresh
  therefore always reveals a fresh batch generated in the background earlier.

### Storage

New Rust-side table `user_recommendations` keyed by
`(user_key, playlist_id, content_type, exclude_adult)`, holding the current
item-id batch, the recently-shown id history (for rotation), and
`generated_at`. `user_key` is an opaque string (the app's user id) — the Rust
DB stays user-agnostic. The legacy `cached_recommendations` random path is
kept as the cold-start fallback.

### Model asset delivery

The artifact ships with the app (`assets/recs/recs-model.bin`, with `bin`
registered as a metro asset extension), is materialized to a real file path by
expo-asset, and is loaded into the FFI once per process
(`loadRecommendationModel(path)`). Size budget 3–25 MB.

`src/services/recommendation-model.ts` owns that bootstrap and memoizes it
per launch. Startup kicks it off without awaiting it; the home page awaits the
same promise before its first read, so the first batch is personalized rather
than randomly falling back. A failure is warned about and reported as "no
model", which is exactly the engine's random fallback.

## FFI surface (phase 2)

```
loadRecommendationModel(path: string): Promise<void>
isRecommendationModelLoaded(): Promise<boolean>
getPersonalizedMovieRecommendations(playlistId, userKey, excludeAdult,
    limit, signalsJson): Promise<Channel[]>       // read-or-generate
regeneratePersonalizedMovieRecommendations(...same): Promise<void>
getPersonalizedSeriesRecommendations(...): Promise<SeriesInfo[]>
regeneratePersonalizedSeriesRecommendations(...): Promise<void>
```

The TypeScript wrappers on `Database` take a typed `RecommendationSignals`
object and stringify it, so the app never builds the JSON by hand. The model is
process-global: one `loadRecommendationModel` per launch serves every database
handle, and loading again replaces it.

`signalsJson`:

```json
{
  "reactions":  [{ "id": "<channelId or seriesName>", "kind": "movie|series", "weight": 1.0 }],
  "favorites":  [{ "id": "...", "kind": "movie|series" }],
  "watched":    [{ "id": "...", "kind": "movie|series" }],
  "seenChannelIds": ["..."],
  "seenSeriesNames": ["..."],
  "shownChannelIds": ["..."],
  "shownSeriesNames": ["..."]
}
```

Rust resolves each id to title/year/tmdb via `channels` + `channel_metadata`
internally, so the app never needs bulk metadata reads for this.

## Scoring, as built

- **Movies matched into the model**:
  `score = dot(taste, item) * confidence + 0.02 * popularity/255`, where
  `confidence = clamp(sqrt(popularity/255), 0.35, 1.0)`. The confidence term
  damps the model's weakly determined low-popularity tail — a deliberate trade
  of tail quality for catalogue coverage.
- **Movies the model does not know** are barred from the taste and crowd slots
  entirely. They can only reach the new & popular slot, ranked on
  `pop · max(dot, 0.1 · genre-affinity-cosine)`, where `pop` falls back to the
  provider's own rating (0..10) since there is no model popularity.
- **Crowd favorites** gate on model `popularity ≥ 192` *and* `mean_rating ≥ 3.6`.
  In the popular tier only the rating half is a gate; popularity moves into the
  ranking key (`popularity/255 + 0.25 · mean_rating/5`), which is also what
  backfills a short popular batch, the taste ranking being empty there.
- **Series**: `cosine(genre affinity, ±1 genre vector) + 0.1 · rating/10`, or
  `rating/10 + 0.15 if recent` in the popular tier.
  Provider genres are mapped onto the model's MovieLens genre names by
  normalised substring match plus a small alias table ("Sci-Fi" ↔ "Science
  Fiction", "Children" ↔ "Family"/"Kids", "Musical" ↔ "Music").
- **Genre affinity** is fed by every signal: titles the model recognises through
  its own genre bits, everything else (unrecognised movies, and all series)
  through the provider's genre strings.
- **Rotation**: `shown_ids` holds up to three batches' worth of recently shown
  ids, most recent first. They are excluded outright while at least `3 × limit`
  candidates survive without them, and merely penalised (−0.15) below that, so a
  thin playlist degrades instead of starving.
- **Tie noise**: ±2% of the score spread, from a hash of `(generated_at, id)`.
  `generated_at` is also the "now" of the recency window, so a stored batch is
  exactly reproducible from what is stored beside it.

## Status

- Phase 1 — like/dislike reactions (app DB, store, detail-modal UI): this
  feature's commit.
- Phase 2 — Rust engine (`recs-model` integration in `m3u-ffi/src/recs.rs`,
  generation, `user_recommendations` persistence, Kotlin/TS bindings): this
  feature's commit.
- Phase 3 — home-page wiring, asset bootstrap, background regeneration: done.
  `usePersonalizedContent` replaces the random discover hook, gathers signals
  from the user store plus `getWatchedContent`, and titles the rows "For You" /
  "Series For You" when a model is loaded *and* the user has taste signals.
- TMDB "new & popular" upgrade: dormant until a TMDB API key is configured
  (none exists in the app today); the panel-local variant runs meanwhile.
