# IPTV Playlist Usage Guide

## Quick Start

The playlist management system is now integrated into your app. Users can access it through the **Settings** tab.

## User Flow

### 1. Adding a Playlist

1. Open the app and navigate to the **Settings** tab
2. Scroll to the "Playlist Management" section
3. Click the **"Add"** button
4. Fill in the form:
   - **Playlist Name**: Give your playlist a memorable name (e.g., "My IPTV")
   - **Playlist URL**: Enter the M3U playlist URL (e.g., `https://example.com/playlist.m3u`)
   - **Requires Authentication** (toggle): Turn on if your playlist requires login
     - **Username**: Your playlist service username
     - **Password**: Your playlist service password
5. Click **"Add Playlist"**
6. The app will fetch and parse the playlist automatically
7. Once successful, the playlist appears in the list and is automatically set as active

### 2. Managing Playlists

**Viewing Playlists**:
- All added playlists are displayed as cards
- Each card shows:
  - Playlist name
  - Domain/URL
  - Number of channels
  - Last updated time
  - Authentication status (if applicable)
  - Active badge (if it's the current playlist)

**Switching Active Playlist**:
- Tap on any playlist card to make it the active one
- The active playlist is marked with a blue "Active" badge

**Refreshing a Playlist**:
- Tap the **"Refresh"** button on a playlist card
- This re-fetches and re-parses the playlist from the URL
- Useful when the playlist provider updates their channel list

**Deleting a Playlist**:
- Tap the **"Delete"** button on a playlist card
- Confirm the deletion in the alert dialog
- The playlist is permanently removed

## Developer Usage

### Using the Playlist Store

```typescript
import { usePlaylistStore } from '@/states/playlist-store';

function MyComponent() {
  // Get all playlists
  const playlists = usePlaylistStore((state) => state.playlists);

  // Get active playlist
  const activePlaylist = usePlaylistStore((state) => state.getActivePlaylist());

  // Add a new playlist
  const addPlaylist = usePlaylistStore((state) => state.addPlaylist);

  const handleAdd = async () => {
    await addPlaylist({
      name: 'My Playlist',
      url: 'https://example.com/playlist.m3u',
      credentials: {
        username: 'user',
        password: 'pass',
      },
    });
  };

  // Access channels from active playlist
  const channels = activePlaylist?.parsedData?.items || [];

  return (
    // Your component JSX
  );
}
```

### Accessing Channel Data

```typescript
// Get the active playlist
const activePlaylist = usePlaylistStore.getState().getActivePlaylist();

if (activePlaylist?.parsedData) {
  // Access all channels
  const channels = activePlaylist.parsedData.items;

  // Each channel has:
  channels.forEach((channel) => {
    console.log('Name:', channel.name);
    console.log('URL:', channel.url);
    console.log('Logo:', channel.tvg?.logo);
    console.log('Group:', channel.group?.title);
    console.log('Language:', channel.tvg?.language);
  });

  // Get unique groups
  const groups = PlaylistService.getChannelGroups(activePlaylist.parsedData);
}
```

### Using the Service Layer Directly

```typescript
import { PlaylistService } from '@/services/playlist-service';

// Fetch and parse a playlist
const parsedData = await PlaylistService.fetchAndParsePlaylist(
  'https://example.com/playlist.m3u',
  { username: 'user', password: 'pass' }  // optional credentials
);

// Get channel count
const count = PlaylistService.getChannelCount(parsedData);

// Get unique groups
const groups = PlaylistService.getChannelGroups(parsedData);
```

## Example Playlist URLs

Here are some free IPTV playlist URLs you can use for testing:

```
# General free IPTV (example)
https://iptv-org.github.io/iptv/index.m3u

# Country-specific examples (these are sample URLs, verify availability)
https://iptv-org.github.io/iptv/countries/us.m3u
https://iptv-org.github.io/iptv/countries/uk.m3u
```

**Note**: Always verify that you have the right to use any IPTV playlist URL.

## Troubleshooting

### Playlist Won't Load

**Error: "Failed to fetch playlist: 404"**
- The URL is incorrect or the playlist no longer exists
- Verify the URL in a web browser

**Error: "No channels found in playlist"**
- The M3U file is empty or incorrectly formatted
- Try a different playlist URL

**Error: "Failed to fetch playlist: Network error"**
- Check your internet connection
- The server might be down or blocking your request

### Authentication Issues

**Error: "Failed to fetch playlist: 401" or "403"**
- Your credentials are incorrect
- The playlist provider might have changed authentication method
- Contact your playlist provider

### Performance Issues

If you have a large playlist (>1000 channels):
- The initial fetch and parse might take a few seconds
- Subsequent access is fast as data is cached
- Use the refresh button sparingly to avoid unnecessary re-fetches

## Next Steps

### Displaying Channels in Your App

Now that playlists are set up, you can use the active playlist's channel data throughout your app:

1. **Create a Channels Screen**: Display all channels from the active playlist
2. **Add Video Player**: Integrate a video player to play channel streams
3. **Implement EPG**: Show Electronic Program Guide if available
4. **Add Favorites**: Let users mark favorite channels
5. **Search & Filter**: Filter channels by group, language, country

### Example: Display Channels

```typescript
import { usePlaylistStore } from '@/states/playlist-store';
import { FlatList, View, Text } from 'react-native';

export function ChannelsScreen() {
  const activePlaylist = usePlaylistStore((state) => state.getActivePlaylist());
  const channels = activePlaylist?.parsedData?.items || [];

  return (
    <FlatList
      data={channels}
      keyExtractor={(item, index) => `${item.url}-${index}`}
      renderItem={({ item }) => (
        <View>
          <Text>{item.name}</Text>
          <Text>{item.group?.title}</Text>
        </View>
      )}
    />
  );
}
```

## Support

For architecture details and migration guides, see:
- `docs/PLAYLIST_ARCHITECTURE.md`

For issues or questions:
- Check the error messages in the UI
- Review the console logs for detailed error information
- Verify your playlist URL and credentials
