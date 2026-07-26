# Harris County District Clerk Auto Clicker

Browser extensions that automatically download PDFs from Harris County District Clerk case details pages.

**Available for:**
- 🌐 **Chrome/Chromium** - Full-featured version with Chrome downloads API
- 🧭 **Safari** - Safari Web Extension with native download handling

## Features

- Automatically detects and clicks on all document links with image numbers
- Automatically downloads PDFs when they open in new tabs
- Automatically closes PDF tabs after download completes
- Continues downloading after you leave the tab or switch apps (background-safe; v2.3+)
- Configurable delay between clicks (1-10 seconds)
- Visual status indicator and progress tracking
- Start/stop controls
- Works specifically on hcdistrictclerk.com pages
- Downloads are saved to your default Downloads folder

## Installation

### Chrome Extension

1. Download or clone this repository to your local machine
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the main folder containing the extension files
5. The extension should now appear in your Chrome toolbar

### Safari Extension

1. Navigate to the `Safari_Extension/` folder
2. Follow the installation instructions in `Safari_Extension/README.md`
3. Enable the extension in Safari → Preferences → Extensions

## Usage

1. Navigate to a Harris County District Clerk case details page (hcdistrictclerk.com)
2. Click on the extension icon in your Chrome toolbar
3. The popup will show:
   - Current status
   - Number of document links found on the page
   - Delay slider to adjust time between clicks
4. Click "Start Auto Click" to begin automatically clicking all document links
5. Click "Stop" to halt the process at any time

## How It Works

The extension:
1. Scans the page for links with class `dcoLink` that contain `OpenImageViewerConf` in their href
2. Opens each document’s ViewFilePage in a background tab, with rate-limited delays
3. The service worker extracts the PDF URL and starts the download (no need to focus the tab)
4. Closes the PDF tab after the download starts
5. Continues with the next document even if the case page is in the background
6. Provides real-time progress updates
7. Automatically stops when all links have been clicked

**Background-safe (v2.3+):** Delays and PDF extraction retries run in the extension service worker, not in page timers. Chrome throttles `setTimeout` in inactive tabs; without that change, leaving the tab would stall the queue. Keep the browser open and leave the case tab open (it may be unfocused). Do not close the case tab while a run is in progress.

## Files

- `manifest.json` - Extension configuration
- `content.js` - Main functionality that runs on the District Clerk pages
- `background.js` - Service worker that handles PDF downloads and tab management
- `popup.html` - User interface for the extension popup
- `popup.js` - Handles popup interactions and communication with content script

## Safety Features

- Only works on hcdistrictclerk.com domains
- Visual confirmation before starting
- Ability to stop the process at any time
- Status indicators to show current progress

## Notes

- Make sure you're logged into the District Clerk website before using
- The extension will only work on pages that contain document image links
- PDFs will be automatically downloaded to your Downloads folder
- PDF tabs will automatically close after downloading
- The extension uses a 3-second delay by default to allow time for downloads
- Use responsibly and in accordance with the website's terms of service 