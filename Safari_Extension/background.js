// Background script for Harris County District Clerk Auto Clicker - Safari Version
console.log('HCDC Auto Clicker background script loaded (Safari)');

// Store case number for current download session
let currentCaseNumber = 'unknown_case';

// Track the current PDF tab to ensure only one is open at a time
let currentPDFTabId = null;

// Safari/WebKit compatible API detection
const runtime = (typeof browser !== 'undefined') ? browser.runtime : chrome.runtime;
const tabs = (typeof browser !== 'undefined') ? browser.tabs : chrome.tabs;
const downloads = (typeof browser !== 'undefined') ? browser.downloads : chrome.downloads;

// Function to close current PDF tab if one exists
function closeCurrentPDFTab() {
    return new Promise((resolve) => {
        if (currentPDFTabId && tabs && tabs.remove) {
            console.log('Closing current PDF tab:', currentPDFTabId);
            tabs.remove(currentPDFTabId, () => {
                currentPDFTabId = null;
                resolve();
            });
        } else {
            resolve();
        }
    });
}

// Listen for tab updates to handle ViewFilePage tabs
if (tabs && tabs.onUpdated) {
    tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete' && tab.url && tab.url.includes('ViewFilePage.aspx')) {
            console.log('ViewFilePage loaded:', tab.url);
            
            // Store this as the current PDF tab
            currentPDFTabId = tabId;
            
            // Inject script to handle PDF download
            if (tabs.executeScript) {
                tabs.executeScript(tabId, {
                    code: `
                        console.log('Safari PDF handler injected');
                        
                        // Check if this is a PDF viewer page
                        if (document.querySelector('pdf-viewer') || document.querySelector('embed[type="application/pdf"]') || document.querySelector('object[type="application/pdf"]')) {
                            console.log('PDF viewer detected - triggering download');
                            
                            // For Safari, we'll try to trigger the download via the browser's built-in functionality
                            // Safari handles PDF downloads differently than Chrome
                            
                            // Method 1: Try to find and click any download links
                            const downloadLinks = document.querySelectorAll('a[download], a[href*="download"]');
                            if (downloadLinks.length > 0) {
                                console.log('Found download link, clicking...');
                                downloadLinks[0].click();
                            }
                            
                            // Method 2: Try to access the PDF URL directly
                            const currentUrl = window.location.href;
                            if (currentUrl.includes('ViewFilePage.aspx')) {
                                console.log('Attempting direct download of PDF');
                                
                                // Create a download link
                                const link = document.createElement('a');
                                link.href = currentUrl;
                                link.download = 'hcdc_document_' + Date.now() + '.pdf';
                                link.style.display = 'none';
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                                
                                console.log('Download link created and clicked');
                            }
                            
                            // Close the tab after a delay
                            setTimeout(() => {
                                window.close();
                            }, 3000);
                        } else {
                            // Look for iframe with PDF
                            const iframes = document.querySelectorAll('iframe');
                            console.log('Found iframes:', iframes.length);
                            
                            for (const iframe of iframes) {
                                if (iframe.src && iframe.src.includes('ViewFilePage.aspx')) {
                                    console.log('Found ViewFilePage iframe, sending download message');
                                    
                                    // Send message to background script for download
                                    if (typeof browser !== 'undefined' && browser.runtime) {
                                        browser.runtime.sendMessage({
                                            action: 'downloadPDF',
                                            url: iframe.src
                                        });
                                    } else if (typeof chrome !== 'undefined' && chrome.runtime) {
                                        chrome.runtime.sendMessage({
                                            action: 'downloadPDF',
                                            url: iframe.src
                                        });
                                    }
                                    
                                    // Close this wrapper tab
                                    setTimeout(() => window.close(), 2000);
                                    break;
                                }
                            }
                        }
                    `
                }).catch(err => {
                    console.log('Failed to inject PDF handler script:', err);
                });
            }
        }
    });
}

// Listen for tab removal to clear tracking
if (tabs && tabs.onRemoved) {
    tabs.onRemoved.addListener((tabId, removeInfo) => {
        if (tabId === currentPDFTabId) {
            console.log('Current PDF tab closed:', tabId);
            currentPDFTabId = null;
        }
    });
}

// Handle messages from content script
if (runtime && runtime.onMessage) {
    runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'downloadPDF') {
            console.log('Downloading PDF from URL:', request.url);
            console.log('Case number:', currentCaseNumber);
            
            // Note: Safari extension has limited duplicate checking capabilities
            // Users should manually check for duplicate files in their Downloads folder
            console.log('Note: Safari extension cannot automatically check for duplicate files');
            
            // Safari download handling
            if (downloads && downloads.download) {
                // Use downloads API if available
                downloads.download({
                    url: request.url,
                    filename: `${currentCaseNumber}/hcdc_document_${Date.now()}.pdf`
                }).then(downloadId => {
                    console.log('Download started with ID:', downloadId);
                    sendResponse({success: true, downloadId: downloadId});
                }).catch(error => {
                    console.log('Download failed:', error);
                    sendResponse({success: false, error: error.message});
                });
            } else {
                // Fallback: open URL in new tab for manual download
                console.log('Downloads API not available, opening in new tab');
                if (tabs && tabs.create) {
                    tabs.create({
                        url: request.url,
                        active: false
                    }).then(tab => {
                        sendResponse({success: true, tabId: tab.id});
                    }).catch(error => {
                        sendResponse({success: false, error: error.message});
                    });
                } else {
                    sendResponse({success: false, error: 'No download method available'});
                }
            }
            
            return true; // Keep message channel open for async response
        } else if (request.action === 'setCaseNumber') {
            console.log('Setting case number:', request.caseNumber);
            currentCaseNumber = request.caseNumber;
            sendResponse({success: true});
            return true;
        } else if (request.action === 'openPDFTab') {
            console.log('Request to open PDF tab:', request.url);
            
            // Close current PDF tab first, then open new one
            closeCurrentPDFTab().then(() => {
                if (tabs && tabs.create) {
                    tabs.create({
                        url: request.url,
                        active: false
                    }).then(tab => {
                        currentPDFTabId = tab.id;
                        console.log('Opened new PDF tab:', tab.id);
                        sendResponse({success: true, tabId: tab.id});
                    }).catch(error => {
                        console.log('Failed to open PDF tab:', error);
                        sendResponse({success: false, error: error.message});
                    });
                } else {
                    sendResponse({success: false, error: 'Tabs API not available'});
                }
            });
            
            return true; // Keep message channel open for async response
        }
    });
}

// Listen for download events (if available)
if (downloads && downloads.onChanged) {
    downloads.onChanged.addListener((downloadDelta) => {
        if (downloadDelta.state && downloadDelta.state.current === 'complete') {
            console.log('Download completed:', downloadDelta.id);
        }
    });
}

console.log('Safari background script initialization complete'); 