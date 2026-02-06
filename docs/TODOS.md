# Future Tasks

## Architecture
- Resolve folder structure inconsistency (video domain vs other domains)
- Decide on feature-based vs layer-based organization for the full codebase

## Features
- **EPG Guide** — Electronic Program Guide with schedule data. Should include filtering, search, etc.
- **VOD Library** — Separate Movie and Series browsing with genre filtering, search, season/episode grouping
- **Sports/Football Schedule** — Match schedules and dedicated sports tracking
- **Catch-up TV** — Watch previously aired content
- **User Show Tracking** — Track watch progress per show/movie
- **Favorite Sports Team Tracking** — Track schedule, results and channels for favorite team
- **Likes & Recommendations** — User likes feed recommendations for shows, movies, and sports
- **Multi-user Profiles** — Expand existing partial implementation

## React Native App
- VOD UI for movies and TV series browsing
- EPG grid/timeline component
- Sports schedule views

## Rust Backend
- Infinite scroll: evict old items when exceeding window size
- Pagination and advanced filtering on playlists
- Recommendation engine
- EPG data ingestion and storage
- VOD catalog indexing (movies, series, seasons, episodes)

## Both
- Recommendations fetched from backend, displayed to the user
- Watch history sync between app and backend