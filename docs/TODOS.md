# Future Tasks*

## Investivate
* Does `expo-video` for IOS support mpeg ts streams? If not consider a native fmpeg solution

## Refactor video player gui architecture and features
* Layer based layout (names/terms might need some rework)
  * Base layout:
    * Allows attaching component groups in top left, top center, top right, etc.
    * Center can maybe have a customizable component, or be reserved for only play/pause (to be discussed)
  * Component group:
    * Can either be a list of smaller widgets, or some kind of slider
  * Components (overall group which includes the following types):
    * Widget: buttons or similar, user can interact with for a specific task (cast, resolution change, open video settings, toggle cc, etc.)
    * Slider: slider to configure some setting (e.g. slide finger up or down to change volume or brightness)
    * Other useful components?

## Features
* **EPG Guide** - Electronic Program Guide with schedule data. Should include filtering, search, etc.
* **VOD Library** - Separate Movie and Series browsing with genre filtering, search, season/episode grouping
* **Sports/Football Schedule** - Match schedules and dedicated sports tracking
* **Catch-up TV** - Watch previously aired content
* **User Show Tracking** - Track watch progress per show/movie
* **Favorite Sports Team Tracking** - Track schedule, results and channels for favorite team
* **Likes & Recommendations** - User likes feed recommendations for shows, movies, and sports
* **Multi-user Profiles** - Expand existing partial home page
* View history. For tv shows: show a "continue watching" link to next episode on
* When opening match stream through sports schedule: show lineups and match info on screen, either through gui button press, or as main view on phone while casting
* Skip intro/recap/trailer
* Playback-speed control and general playback control (choose where to play from a bottom bar/line which tells you where in the video you are)
* Catch up feature; show highlights/similar if starting to what from middle of game

## React Native App
* VOD UI for movies and TV series browsing
* EPG grid/timeline component
* Sports schedule views
* Add profile picture support
* Enhance error messages in GUI
* Allow data processing (playlist parsing etc.) happen in the background (perhaps show the status message the same place as the mini player?)
* Select colors for theme
* Make more advanced parallax scroll functionalty, will randomly generated collages of video images
* Custom bitrate (quality)
* Subtitles
* Show all movie images cropped in carousel component in info modal. Click to enlarge uncropped

## Rust Backend
* Infinite scroll: evict old items when exceeding window size
* Pagination and advanced filtering on playlists
* Recommendation engine
* EPG data ingestion and storage
* VOD catalog indexing (movies, series, seasons, episodes)
* Advanced filtering

## Both
* Recommendations fetched from backend, displayed to the user
* Watch history sync between app and backend




## Bugs
* When a video fails to load you get an error up, then an infinite loading spinner
