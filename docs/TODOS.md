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
* Catch-up from the live EPG programme list (play any past programme, not just matches — football catch-up is done, see `docs/catchup.md`)
* **Multi-user Profiles** - Expand existing partial home page
* Skip intro/recap/trailer
* Playback-speed control
* Catch up feature; show highlights/similar if starting to what from middle of game

## React Native App
* Add profile picture support
* Enhance error messages in GUI
* Select colors for theme
* Make more advanced parallax scroll functionalty, will randomly generated collages of video images
* Custom bitrate (quality)
* Subtitles
* Show all movie images cropped in carousel component in info modal. Click to enlarge uncropped

## Rust Backend
* Infinite scroll: evict old items when exceeding window size
* Advanced filtering

## Both
* Watch history sync between app and backend
