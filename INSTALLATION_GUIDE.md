# Harris County District Clerk Auto Clicker - Installation Guide

This extension automatically downloads PDF documents from the Harris County District Clerk website. Follow the instructions below for your web browser.

## What This Extension Does

- Automatically finds and downloads PDF documents from Harris County District Clerk case pages
- Organizes downloads by case number in folders
- Names files with document numbers and titles
- Handles pagination to download from multiple pages
- Works in debug mode (downloads first and last document) or full mode (downloads all documents)

## Installation Instructions

### For Google Chrome (Windows & macOS)

1. **Download the extension files**
   - Unzip the downloaded package
   - Locate the `Chrome_Plugin_HCDC` folder

2. **Open Chrome Extensions page**
   - Open Google Chrome
   - Type `chrome://extensions` in the address bar and press Enter
   - OR click the three dots menu → More tools → Extensions

3. **Enable Developer Mode**
   - Look for "Developer mode" toggle in the top-right corner
   - Click to turn it ON (the toggle should be blue)

4. **Install the extension**
   - Click the "Load unpacked" button that appears
   - Browse to and select the `Chrome_Plugin_HCDC` folder
   - Click "Select Folder" (Windows) or "Open" (macOS)

5. **Verify installation**
   - You should see the extension appear in your extensions list
   - Look for a new icon in your Chrome toolbar

### For Safari (macOS only)

**Requirements:** macOS 14 (Sonoma) or newer

1. **Download the extension files**
   - Unzip the downloaded package
   - Locate the `Safari_Extension` folder

2. **Open Safari Extension Builder**
   - Open Safari
   - Go to Safari menu → Settings → Extensions
   - Click the three dots "•••" button
   - Select "Developer" → "Show Extension Builder"

3. **Add the extension**
   - In Extension Builder, click the "+" button
   - Select "Add Extension"
   - Browse to and select the `Safari_Extension` folder
   - Click "Open"

4. **Build and install**
   - Click "Build" or "Run" in Extension Builder
   - macOS will show a security dialog - click "Allow"
   - Return to Safari → Settings → Extensions
   - Find "Harris County District Clerk Auto Clicker" and check the box to enable it

### For Firefox (Windows & macOS)

**Note:** This will install temporarily (until Firefox restart)

1. **Download the extension files**
   - Unzip the downloaded package
   - Locate the `Firefox_Extension` folder

2. **Open Firefox Developer Tools**
   - Open Firefox
   - Type `about:debugging` in the address bar and press Enter
   - Click "This Firefox" on the left side

3. **Load the extension**
   - Click "Load Temporary Add-on..." button
   - Browse to the `Firefox_Extension` folder
   - Select the `manifest.json` file
   - Click "Open"

4. **Verify installation**
   - The extension should appear in the temporary extensions list
   - Look for a new icon in your Firefox toolbar

## How to Use

1. **Navigate to Harris County District Clerk website**
   - Go to a case details page that shows document images

2. **Open the extension**
   - Click the extension icon in your browser toolbar
   - A popup window will appear

3. **Choose your mode**
   - **Debug Mode**: Downloads only the first and last document (for testing)
   - **Full Mode**: Downloads all documents on all pages

4. **Start the process**
   - Click "Start Auto Click"
   - The extension will automatically:
     - Find all document links on the page
     - Download each PDF file
     - Organize files in folders by case number
     - Move to the next page (if any) and repeat

5. **Monitor progress**
   - Watch the console output in the popup for status updates
   - Downloads will appear in your browser's download folder

## File Organization

Downloaded files are saved as:
```
Downloads/
└── [Case Number]/
    ├── [Document Number] [Document Title].pdf
    ├── [Document Number] [Document Title].pdf
    └── ...
```

Example:
```
Downloads/
└── 1837151/
    ├── 121114223 ADDITIONAL ORDERS.pdf
    ├── 118516925 STATE'S MOTION TO CUMULATE SENTENCE.pdf
    └── ...
```

## Troubleshooting

### Extension won't load
- Make sure you selected the correct folder (not a file)
- Ensure Developer Mode is enabled (Chrome)
- Try refreshing the extensions page

### No documents found
- Make sure you're on a case details page with document images
- Check that the page has fully loaded before starting
- Try refreshing the page and starting again

### Downloads not working
- Check your browser's download settings
- Make sure downloads aren't being blocked
- Verify you have write permissions to your Downloads folder

### Extension stops working
- Check browser console for errors (F12 → Console tab)
- Try disabling and re-enabling the extension
- Reload the Harris County District Clerk page

## Support

If you encounter issues:
1. Check this guide first
2. Try the troubleshooting steps above
3. Make sure you're using a supported browser version
4. Disable other extensions temporarily to test for conflicts

## Privacy & Security

This extension:
- Only works on Harris County District Clerk websites
- Does not collect or transmit any personal data
- Only downloads files you have access to view
- Uses standard browser download functionality 