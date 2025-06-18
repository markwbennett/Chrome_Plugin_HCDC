// Background service worker for Harris County District Clerk Auto Clicker
console.log('HCDC Auto Clicker background script loaded');

// Store case number for current download session
let currentCaseNumber = 'unknown_case';

// Listen for tab updates to handle ViewFilePage tabs
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('ViewFilePage.aspx')) {
        console.log('ViewFilePage loaded:', tab.url);
        
        // Inject script to extract the actual PDF URL
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: extractPDFUrl,
            args: [tabId]
        }).catch(err => {
            console.log('Failed to inject PDF extraction script:', err);
        });
    }
});

// Function to extract PDF URL from ViewFilePage (injected into tab)
function extractPDFUrl(tabId) {
    console.log('Extracting PDF URL from ViewFilePage...');
    console.log('Current URL:', window.location.href);
    
    // Check if this is Chrome's PDF viewer - skip download attempts since we handle it via API
    if (document.querySelector('pdf-viewer')) {
        console.log('This is Chrome PDF viewer - closing tab since download is handled by API');
        // Just close the tab since the download is already handled by chrome.downloads.download()
        setTimeout(() => {
            window.close();
        }, 2000);
        return;
    }
    
    // Look for PDF-related elements and URLs (for non-Chrome viewers)
    function findPDFUrl() {
        // Method 1: Look for iframe with ViewFilePage (this leads to the actual PDF)
        const iframes = document.querySelectorAll('iframe');
        console.log('Found iframes:', iframes.length);
        
        for (const iframe of iframes) {
            console.log('Iframe src:', iframe.src);
            if (iframe.src && iframe.src.includes('ViewFilePage.aspx')) {
                console.log('Found ViewFilePage iframe - downloading PDF directly');
                // Send message to background script to download the PDF
                chrome.runtime.sendMessage({
                    action: 'downloadPDF',
                    url: iframe.src
                });
                // Close this wrapper tab
                setTimeout(() => window.close(), 1000);
                return iframe.src;
            }
            if (iframe.src && (iframe.src.includes('.pdf') || iframe.src.includes('GetFile'))) {
                return iframe.src;
            }
        }
        
        // Method 2: Look for embed elements
        const embeds = document.querySelectorAll('embed');
        console.log('Found embeds:', embeds.length);
        
        for (const embed of embeds) {
            console.log('Embed src:', embed.src);
            if (embed.src && (embed.src.includes('.pdf') || embed.src.includes('GetFile'))) {
                return embed.src;
            }
        }
        
        // Method 3: Look for object elements
        const objects = document.querySelectorAll('object');
        console.log('Found objects:', objects.length);
        
        for (const obj of objects) {
            console.log('Object data:', obj.data);
            if (obj.data && (obj.data.includes('.pdf') || obj.data.includes('GetFile'))) {
                return obj.data;
            }
        }
        
        // Method 4: Look for links to PDF files
        const links = document.querySelectorAll('a[href*=".pdf"], a[href*="GetFile"]');
        console.log('Found PDF links:', links.length);
        
        if (links.length > 0) {
            return links[0].href;
        }
        
        // Method 5: Check page source for PDF URLs
        const pageHTML = document.documentElement.outerHTML;
        const pdfUrlMatch = pageHTML.match(/https?:\/\/[^"'\s]+\.pdf/i) || 
                           pageHTML.match(/https?:\/\/[^"'\s]+GetFile[^"'\s]*/i);
        
        if (pdfUrlMatch) {
            console.log('Found PDF URL in page source:', pdfUrlMatch[0]);
            return pdfUrlMatch[0];
        }
        
        console.log('No PDF URL found in page');
        return null;
    }
    
    // Wait for page to fully load
    function waitAndExtract() {
        const pdfUrl = findPDFUrl();
        
        if (pdfUrl) {
            console.log('Found PDF URL:', pdfUrl);
            console.log('Download handled by chrome.downloads.download() API');
            
            // Close this tab after a brief delay
            setTimeout(() => {
                window.close();
            }, 1000);
        } else {
            console.log('PDF URL not found, logging page structure...');
            console.log('Page HTML preview:', document.body.innerHTML.substring(0, 1000));
        }
    }
    
    // Wait a moment for any dynamic content to load
    setTimeout(waitAndExtract, 2000);
}

// Listen for download events to ensure proper file naming and location
chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
    // Check if this is from the District Clerk site
    if (downloadItem.url && downloadItem.url.includes('hcdistrictclerk.com')) {
        console.log('District Clerk download detected:', downloadItem.filename);
        
        // Don't override the filename since we set it in chrome.downloads.download()
        // Just ensure unique filenames if there are conflicts
        suggest({
            conflictAction: 'uniquify'
        });
    }
});

// Listen for download completion (for logging)
chrome.downloads.onChanged.addListener((downloadDelta) => {
    if (downloadDelta.state && downloadDelta.state.current === 'complete') {
        console.log('Download completed:', downloadDelta.id);
    }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'downloadPDF') {
        console.log('Downloading PDF from URL:', request.url);
        console.log('Case number:', currentCaseNumber);
        
        // Use Chrome's downloads API to download the PDF directly
        chrome.downloads.download({
            url: request.url,
            filename: `${currentCaseNumber}/hcdc_document_${Date.now()}.pdf`
        }).then(downloadId => {
            console.log('Download started with ID:', downloadId);
            sendResponse({success: true, downloadId: downloadId});
        }).catch(error => {
            console.log('Download failed:', error);
            sendResponse({success: false, error: error.message});
        });
        
        return true; // Keep message channel open for async response
    } else if (request.action === 'setCaseNumber') {
        console.log('Setting case number:', request.caseNumber);
        currentCaseNumber = request.caseNumber;
        sendResponse({success: true});
        return true;
    }
}); 