# Mini YouTube Player Chrome Extension

A persistent mini YouTube player that stays visible across all browser tabs, providing a Picture-in-Picture-like experience for YouTube videos.

## Features

- **Persistent Player**: Mini player overlay that appears on all tabs
- **YouTube Search**: Search and play YouTube videos directly from the extension
- **Keyboard Controls**: Full keyboard shortcut support for video control
- **Corner Positioning**: Player automatically cycles through screen corners on hover
- **Resizable**: Dynamic resizing with keyboard shortcuts
- **Cross-Tab Sync**: Video state synchronized across all open tabs

## Installation

1. **Get a YouTube API Key** (Required for search functionality):
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing one
   - Enable the YouTube Data API v3
   - Create credentials (API Key)
   - Copy your API key

2. **Configure the Extension**:
   - Open `background.js`
   - Replace `"YOUR_API_KEY"` with your actual YouTube API key

3. **Load the Extension in Chrome**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select this project folder
   - The extension should now appear in your extensions list

## Usage

### Basic Controls
- **Click the extension icon** in the toolbar to toggle the mini player on/off
- **Search**: Type in the search box and click "Go" or press Enter
- **Player appears** in the top-right corner by default

### Keyboard Shortcuts
All shortcuts require holding **Shift**:

- **Shift + Space**: Play/Pause toggle
- **Shift + ↑**: Previous video in search results
- **Shift + ↓**: Next video in search results
- **Shift + ←**: Rewind 5 seconds
- **Shift + →**: Forward 5 seconds
- **Shift + +** (or **Numpad +**): Increase player size
- **Shift + -** (or **Numpad -**): Decrease player size

### Player Behavior
- **Corner Cycling**: Hover over the video area to move the player to different screen corners
- **Cross-Tab**: Player appears on all tabs when toggled on
- **Persistent**: Player stays visible when navigating between tabs
- **Auto-Pause**: Video automatically pauses when player is hidden or tab becomes inactive
- **Smart Audio**: Only the active tab plays audio to prevent conflicts

## File Structure

```
YoutubeExtension/
├── manifest.json          # Extension configuration
├── background.js          # Service worker for global state
├── contentScript.js       # UI overlay and video player logic
├── contentStyles.css      # Styling for the mini player
├── icons/                 # Extension icons (placeholders)
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── README.md             # This file
```

## Customization

### Replacing Icons
The current icons are placeholders. To add proper icons:
1. Create icons in Illustrator (or any image editor)
2. Export as PNG files in sizes: 16x16, 32x32, 48x48, 128x128
3. Replace the placeholder files in the `icons/` folder
4. Reload the extension in Chrome

### Modifying Styling
Edit `contentStyles.css` to customize:
- Player colors and theme
- Corner positioning margins
- Player size and appearance
- Font and text styling

### Adding Features
The extension is built with a modular structure:
- **Background script**: Handles global state and YouTube API calls
- **Content script**: Manages UI and video player interactions
- **CSS**: Controls visual appearance and positioning

## Troubleshooting

### Extension Not Loading
- Ensure all files are present in the project folder
- Check that `manifest.json` is valid JSON
- Verify Developer mode is enabled in Chrome
- Make sure placeholder icon files exist in the `icons/` folder

### Search Not Working
- Confirm your YouTube API key is correctly set in `background.js`
- Check that the YouTube Data API v3 is enabled in Google Cloud Console
- Verify your API key has proper permissions
- Check browser console for API errors

### Player Not Appearing
- Try clicking the extension icon multiple times
- Check browser console for JavaScript errors
- Ensure the extension has proper permissions
- The player should automatically appear on new tabs if it was previously toggled on

### Keyboard Shortcuts Not Working
- Make sure the mini player is visible (toggled on)
- Ensure you're not typing in the search input (focus should be elsewhere)
- All shortcuts require holding the Shift key
- Try refreshing the page if shortcuts stop working

### Audio Issues
- Only the active tab will play audio (background tabs are automatically muted)
- If you hear multiple audio streams, check that only one tab is active
- The extension uses the Page Visibility API to manage audio streams

## Development Notes

- Built with Manifest V3 (latest Chrome extension standard)
- Uses YouTube IFrame Player API for video control
- Content script runs on all pages for cross-tab functionality
- Service worker handles global state and API communication
- State persistence using `chrome.storage.session` for reliability
- Page Visibility API prevents multiple audio streams
- Race condition handling for YouTube API initialization
- Proper state synchronization across tabs

## Future Enhancements

- Video playlist management
- Custom keyboard shortcut configuration
- Player theme customization
- Volume control
- Video quality settings
- Bookmark favorite videos

## License

This project is open source. Feel free to modify and distribute according to your needs.
