# Harris County District Clerk Auto Clicker - Safari Extension

A Safari Web Extension that automatically downloads PDFs from Harris County District Clerk case details pages.

## Features

- 🔄 **Automatic Document Processing**: Clicks all document links sequentially
- 📁 **Case Number Organization**: Downloads are organized by case number (first 7 digits from page header)
- ⏱️ **Configurable Delays**: Adjustable timing between clicks (1-10 seconds)
- 📊 **Progress Tracking**: Real-time status and progress display
- 🛡️ **Safe Operation**: Only works on HCDC case details pages
- 🚫 **Duplicate Prevention**: Prevents downloading the same PDF multiple times

## Installation

### Method 1: Load Unpacked Extension (Developer Mode)

1. **Enable Safari Developer Mode**:
   - Open Safari → Preferences → Advanced
   - Check "Show Develop menu in menu bar"

2. **Load the Extension**:
   - Go to Develop → Allow Unsigned Extensions (for testing)
   - Go to Safari → Preferences → Extensions
   - Click "+" button and select the Safari_Extension folder

3. **Enable the Extension**:
   - Make sure the extension is enabled in Safari Extensions preferences
   - Grant necessary permissions when prompted

### Method 2: Using Xcode (Recommended for Distribution)

1. **Open in Xcode**:
   - Create a new Safari Web Extension project in Xcode
   - Replace the generated files with the files from this Safari_Extension folder

2. **Build and Run**:
   - Build the project in Xcode
   - The extension will be automatically installed in Safari

## Usage

1. **Navigate to a Case Details Page**:
   - Go to [Harris County District Clerk website](https://www.hcdistrictclerk.com)
   - Search for a case and open the Case Details page
   - The URL should contain `/Edocs/Public/CaseDetails.aspx`

2. **Open the Extension**:
   - Click the extension icon in Safari's toolbar
   - You should see the case number and number of document links detected

3. **Configure Settings** (Optional):
   - Adjust the click delay using the slider (default: 3 seconds)
   - This controls how long to wait between clicking each document link

4. **Start Auto-Clicking**:
   - Click the "Start Auto Click" button
   - The extension will process all document links sequentially
   - Progress will be shown in the popup

5. **Downloads**:
   - PDFs will be downloaded to your Downloads folder
   - Files are organized in subfolders by case number (e.g., `Downloads/1907647/`)
   - Each PDF gets a unique timestamp in the filename

## How It Works

1. **Link Detection**: Finds all document links with class `dcoLink` containing `OpenImageViewerConf`
2. **Direct URL Construction**: Extracts parameters and builds direct URLs to `ViewFilePage.aspx`
3. **PDF Download**: Opens PDF URLs and triggers downloads using Safari's built-in functionality
4. **Organization**: Creates case-specific folders based on the 7-digit case number

## Safari-Specific Considerations

- **Downloads API**: Safari's downloads API may have limitations compared to Chrome
- **PDF Handling**: Safari handles PDF downloads differently - some PDFs may open in viewer tabs
- **Permissions**: Safari requires explicit permission for each website
- **Security**: Safari's security model may require additional user interaction for downloads

## Troubleshooting

### Extension Not Working
- Check that you're on a valid HCDC case details page
- Ensure the extension has permission for the website
- Try refreshing the page and reopening the extension popup

### Downloads Not Starting
- Check Safari's download preferences
- Ensure downloads are allowed from the HCDC website
- Some PDFs may require manual download confirmation

### No Document Links Found
- Verify you're on the correct page type (Case Details)
- Try the "Test Link Detection" button to debug
- Check browser console for error messages

## Permissions Required

- **Active Tab**: To interact with the current webpage
- **Downloads**: To download PDF files
- **Host Permission**: Access to `www.hcdistrictclerk.com`

## Limitations

- Only works on Harris County District Clerk case details pages
- Requires Safari 14+ for Web Extensions support
- Some PDF downloads may require manual confirmation
- Download folder organization depends on Safari's download handling

## Development

To modify or enhance the extension:

1. Edit the relevant files in the Safari_Extension folder
2. Reload the extension in Safari's preferences
3. Test on HCDC case details pages

### File Structure
```
Safari_Extension/
├── manifest.json     # Extension configuration
├── content.js        # Main functionality
├── background.js     # Download handling
├── popup.html        # User interface
├── popup.js          # UI logic
└── README.md         # This file
```

## Support

For issues or questions:
1. Check the browser console for error messages
2. Verify you're using a supported Safari version
3. Test with the Chrome version to compare behavior

## License

This extension is provided as-is for educational and productivity purposes. 