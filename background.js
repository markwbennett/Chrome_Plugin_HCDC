// Background service worker for Harris County District Clerk Auto Clicker
const manifest = chrome.runtime.getManifest();
console.log(`HCDC Auto Clicker v${manifest.version} background script loaded at:`, new Date().toISOString());

// Store case number for current download session
let currentCaseNumber = 'unknown_case';

// Track the current PDF tab to ensure only one is open at a time
let currentPDFTabId = null;

// Store response callbacks for tabs waiting for download completion
let tabResponseCallbacks = {};

// Store document information for each tab
let tabDocumentInfo = {};

// Listen for tab updates to handle ViewFilePage tabs
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status) {
        console.log(`DEBUG [${new Date().toISOString()}]: Tab updated: ${tabId}, status: ${changeInfo.status}, URL: ${tab.url?.substring(0, 100) + '...'}`);
    }
    
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('ViewFilePage.aspx')) {
        console.log(`DEBUG [${new Date().toISOString()}]: ViewFilePage loaded for tab: ${tabId}`);
        console.log(`DEBUG [${new Date().toISOString()}]: ViewFilePage URL: ${tab.url?.substring(0, 100) + '...'}`);
        console.log(`DEBUG [${new Date().toISOString()}]: Injecting PDF extraction script into tab: ${tabId}`);
        
        // Store this as the current PDF tab
        currentPDFTabId = tabId;
        
        // Inject script to extract the actual PDF URL
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: extractPDFUrl,
            args: [tabId]
        }).then(() => {
            console.log('PDF extraction script injected successfully');
        }).catch(err => {
            console.log('Failed to inject PDF extraction script:', err);
            
            // If injection fails, notify that processing failed
            chrome.tabs.query({url: '*://www.hcdistrictclerk.com/Edocs/Public/CaseDetails.aspx*'}, (tabs) => {
                if (tabs.length > 0) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'pdfProcessingComplete',
                        success: false,
                        error: 'Script injection failed'
                    }).catch(err => {
                        console.log('Could not notify content script about injection failure:', err);
                    });
                }
            });
        });
    }
});

// Listen for tab removal to clear tracking
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (tabId === currentPDFTabId) {
        console.log('Current PDF tab closed:', tabId);
        currentPDFTabId = null;
    }
    
    // Clean up stored document info and callbacks
    if (tabDocumentInfo[tabId]) {
        console.log('DEBUG: Cleaning up document info for tab:', tabId);
        delete tabDocumentInfo[tabId];
    }
    if (tabResponseCallbacks[tabId]) {
        console.log('DEBUG: Cleaning up callback for tab:', tabId);
        delete tabResponseCallbacks[tabId];
    }
});

// Function to close current PDF tab if one exists
function closeCurrentPDFTab() {
    return new Promise((resolve) => {
        if (currentPDFTabId) {
            console.log('Closing current PDF tab:', currentPDFTabId);
            chrome.tabs.remove(currentPDFTabId, () => {
                currentPDFTabId = null;
                resolve();
            });
        } else {
            resolve();
        }
    });
}

// Function to extract PDF URL from ViewFilePage (injected into tab)
function extractPDFUrl(tabId) {
    const extractStartTime = Date.now();
    console.log(`DEBUG [${new Date().toISOString()}]: Starting PDF extraction from ViewFilePage`);
    console.log(`DEBUG [${new Date().toISOString()}]: Current URL: ${window.location.href}`);
    console.log(`DEBUG [${new Date().toISOString()}]: Tab ID: ${tabId}`);
    
    // Store tab ID for notifications
    window.currentTabId = tabId;
    
    // Check if this is Chrome's PDF viewer - skip download attempts since we handle it via API
    if (document.querySelector('pdf-viewer')) {
        console.log('This is Chrome PDF viewer - downloading directly from current URL');
        
        // For Chrome PDF viewer, the current URL is the PDF URL
        const pdfUrl = window.location.href;
        console.log('Chrome PDF viewer URL:', pdfUrl);
        
        // Send message to background script to download the PDF
        chrome.runtime.sendMessage({
            action: 'downloadPDF',
            url: pdfUrl
        }, (response) => {
            console.log('Chrome PDF viewer download response:', response);
            // Notify that PDF processing is complete
            chrome.runtime.sendMessage({
                action: 'notifyPDFProcessed',
                tabId: window.currentTabId,
                success: response?.success || false,
                downloadId: response?.downloadId
            });
        });
        
        // Close this tab after download
        setTimeout(() => {
            window.close();
        }, 2000);
        return;
    }
    
    // Also check for Chrome's PDF viewer in a different way
    if (document.contentType && document.contentType.includes('pdf')) {
        console.log('PDF content type detected - downloading directly from current URL');
        
        const pdfUrl = window.location.href;
        console.log('PDF content URL:', pdfUrl);
        
        chrome.runtime.sendMessage({
            action: 'downloadPDF',
            url: pdfUrl
        }, (response) => {
            console.log('PDF content download response:', response);
            chrome.runtime.sendMessage({
                action: 'notifyPDFProcessed',
                tabId: window.currentTabId,
                success: response?.success || false,
                downloadId: response?.downloadId
            });
        });
        
        setTimeout(() => {
            window.close();
        }, 2000);
        return;
    }
    
    // Look for PDF-related elements and URLs (for non-Chrome viewers)
    function findPDFUrl() {
        console.log('Searching for PDF URL...');
        console.log('Page title:', document.title);
        console.log('Page URL:', window.location.href);
        console.log('Document ready state:', document.readyState);
        
        // Log page structure for debugging
        console.log('Body innerHTML length:', document.body.innerHTML.length);
        console.log('Body text content preview:', document.body.textContent.substring(0, 200));
        
        // Method 1: Look for iframe with ViewFilePage (this leads to the actual PDF)
        const iframes = document.querySelectorAll('iframe');
        console.log('Found iframes:', iframes.length);
        
        for (let i = 0; i < iframes.length; i++) {
            const iframe = iframes[i];
            console.log(`Iframe ${i}:`, {
                src: iframe.src,
                id: iframe.id,
                className: iframe.className,
                width: iframe.width,
                height: iframe.height
            });
            
            if (iframe.src && iframe.src.includes('ViewFilePage.aspx')) {
                console.log('Found ViewFilePage iframe - downloading PDF directly');
                // Send message to background script to download the PDF
                chrome.runtime.sendMessage({
                    action: 'downloadPDF',
                    url: iframe.src
                }, (response) => {
                    console.log('Download response:', response);
                    // Notify that PDF processing is complete
                    chrome.runtime.sendMessage({
                        action: 'notifyPDFProcessed',
                        tabId: window.currentTabId,
                        success: response?.success || false,
                        downloadId: response?.downloadId
                    });
                });
                // Close this wrapper tab
                setTimeout(() => window.close(), 1500);
                return iframe.src;
            }
            if (iframe.src && (iframe.src.includes('.pdf') || iframe.src.includes('GetFile'))) {
                console.log('Found direct PDF iframe:', iframe.src);
                chrome.runtime.sendMessage({
                    action: 'downloadPDF',
                    url: iframe.src
                }, (response) => {
                    console.log('Download response:', response);
                    chrome.runtime.sendMessage({
                        action: 'notifyPDFProcessed',
                        tabId: window.currentTabId,
                        success: response?.success || false,
                        downloadId: response?.downloadId
                    });
                });
                setTimeout(() => window.close(), 1500);
                return iframe.src;
            }
        }
        
        // Method 2: Look for embed elements
        const embeds = document.querySelectorAll('embed');
        console.log('Found embeds:', embeds.length);
        
        for (let i = 0; i < embeds.length; i++) {
            const embed = embeds[i];
            console.log(`Embed ${i}:`, {
                src: embed.src,
                type: embed.type,
                width: embed.width,
                height: embed.height
            });
            
            if (embed.src && (embed.src.includes('.pdf') || embed.src.includes('GetFile'))) {
                console.log('Found PDF embed:', embed.src);
                chrome.runtime.sendMessage({
                    action: 'downloadPDF',
                    url: embed.src
                }, (response) => {
                    console.log('Download response:', response);
                    chrome.runtime.sendMessage({
                        action: 'notifyPDFProcessed',
                        tabId: window.currentTabId,
                        success: response?.success || false,
                        downloadId: response?.downloadId
                    });
                });
                setTimeout(() => window.close(), 1500);
                return embed.src;
            }
        }
        
        // Method 3: Look for object elements
        const objects = document.querySelectorAll('object');
        console.log('Found objects:', objects.length);
        
        for (let i = 0; i < objects.length; i++) {
            const obj = objects[i];
            console.log(`Object ${i}:`, {
                data: obj.data,
                type: obj.type,
                width: obj.width,
                height: obj.height
            });
            
            if (obj.data && (obj.data.includes('.pdf') || obj.data.includes('GetFile'))) {
                console.log('Found PDF object:', obj.data);
                chrome.runtime.sendMessage({
                    action: 'downloadPDF',
                    url: obj.data
                }, (response) => {
                    console.log('Download response:', response);
                    chrome.runtime.sendMessage({
                        action: 'notifyPDFProcessed',
                        tabId: window.currentTabId,
                        success: response?.success || false,
                        downloadId: response?.downloadId
                    });
                });
                setTimeout(() => window.close(), 1500);
                return obj.data;
            }
        }
        
        // Method 4: Look for links to PDF files
        const links = document.querySelectorAll('a[href*=".pdf"], a[href*="GetFile"]');
        console.log('Found PDF links:', links.length);
        
        if (links.length > 0) {
            console.log('Found PDF link:', links[0].href);
            chrome.runtime.sendMessage({
                action: 'downloadPDF',
                url: links[0].href
            }, (response) => {
                console.log('Download response:', response);
                chrome.runtime.sendMessage({
                    action: 'notifyPDFProcessed',
                    tabId: window.currentTabId,
                    success: response?.success || false,
                    downloadId: response?.downloadId
                });
            });
            setTimeout(() => window.close(), 1500);
            return links[0].href;
        }
        
        // Method 5: Check page source for PDF URLs
        const pageHTML = document.documentElement.outerHTML;
        console.log('Searching page HTML for PDF URLs...');
        const pdfUrlMatch = pageHTML.match(/https?:\/\/[^"'\s]+\.pdf/i) || 
                           pageHTML.match(/https?:\/\/[^"'\s]+GetFile[^"'\s]*/i);
        
        if (pdfUrlMatch) {
            console.log('Found PDF URL in page source:', pdfUrlMatch[0]);
            chrome.runtime.sendMessage({
                action: 'downloadPDF',
                url: pdfUrlMatch[0]
            }, (response) => {
                console.log('Download response:', response);
                chrome.runtime.sendMessage({
                    action: 'notifyPDFProcessed',
                    tabId: window.currentTabId,
                    success: response?.success || false,
                    downloadId: response?.downloadId
                });
            });
            setTimeout(() => window.close(), 1500);
            return pdfUrlMatch[0];
        }
        
        console.log('No PDF URL found in page');
        console.log('All iframe sources:', Array.from(document.querySelectorAll('iframe')).map(i => i.src));
        console.log('All embed sources:', Array.from(document.querySelectorAll('embed')).map(e => e.src));
        console.log('All object data:', Array.from(document.querySelectorAll('object')).map(o => o.data));
        
        return null;
    }
    
    // Improved waiting strategy with multiple attempts
    let attempts = 0;
    const maxAttempts = 5;
    
    function waitAndExtract() {
        attempts++;
        console.log(`PDF extraction attempt ${attempts}/${maxAttempts}`);
        
        const pdfUrl = findPDFUrl();
        
        if (pdfUrl) {
            console.log('Found PDF URL:', pdfUrl);
            return; // Success - message already sent to background
        } else if (attempts < maxAttempts) {
            console.log(`No PDF found on attempt ${attempts}, retrying in 2 seconds...`);
            setTimeout(waitAndExtract, 2000);
        } else {
            console.log('Failed to find PDF after all attempts');
            console.log('Page HTML preview:', document.body.innerHTML.substring(0, 1000));
            
            // Notify that PDF processing failed
            chrome.runtime.sendMessage({
                action: 'notifyPDFProcessed',
                tabId: window.currentTabId,
                success: false,
                error: 'No PDF found after all attempts'
            });
            
            // Still close the tab even if we couldn't find the PDF
            setTimeout(() => window.close(), 1000);
        }
    }
    
    // Start with initial delay to allow page to load
    setTimeout(waitAndExtract, 3000);
}

// Function to check if file already exists
async function checkExistingFiles(filename) {
    return new Promise((resolve) => {
        chrome.downloads.search({
            filename: filename,
            state: 'complete'
        }, (results) => {
            console.log(`DEBUG [${new Date().toISOString()}]: Checked for existing file "${filename}":`, results.length, 'matches');
            resolve(results);
        });
    });
}

// Listen for download events to ensure proper file naming and location
chrome.downloads.onDeterminingFilename.addListener(async (downloadItem, suggest) => {
    // Check if this is from the District Clerk site
    if (downloadItem.url && downloadItem.url.includes('hcdistrictclerk.com')) {
        console.log('District Clerk download detected:', downloadItem.filename);
        console.log('Original filename:', downloadItem.filename);
        console.log('Case number:', currentCaseNumber);
        
        // Find document info for current PDF tab
        let docInfo = null;
        if (currentPDFTabId && tabDocumentInfo[currentPDFTabId]) {
            docInfo = tabDocumentInfo[currentPDFTabId];
            console.log('DEBUG: Using document info for tab:', currentPDFTabId, docInfo);
        } else {
            console.log('DEBUG: No document info found. currentPDFTabId:', currentPDFTabId);
            console.log('DEBUG: Available tab document info:', Object.keys(tabDocumentInfo));
        }
        
        // Ensure we have a case number
        if (!currentCaseNumber || currentCaseNumber === 'unknown_case') {
            console.log('DEBUG: Case number not set, using default');
            currentCaseNumber = 'unknown_case';
        }
        
        // Create filename with document number and title
        let filename;
        if (docInfo && docInfo.number && docInfo.number !== 'unknown' && docInfo.title && docInfo.title !== 'document') {
            // Sanitize the title to remove invalid filename characters
            const sanitizedTitle = docInfo.title.replace(/[<>:"/\\|?*]/g, '_').trim();
            // Format: {caseNumber}/{number} {title}.pdf
            filename = `${currentCaseNumber}/${docInfo.number} ${sanitizedTitle}.pdf`;
            console.log('DEBUG: Using document-based filename:', filename);
        } else {
            // Fallback to timestamp-based naming
            const timestamp = Date.now();
            filename = `${currentCaseNumber}/hcdc_document_${timestamp}.pdf`;
            console.log('DEBUG: Using timestamp-based filename:', filename);
            console.log('DEBUG: Fallback reason - docInfo:', docInfo);
        }
        
        console.log(`DEBUG [${new Date().toISOString()}]: Checking if file already exists:`, filename);
        
        // TEMPORARILY DISABLED: Check if file already exists
        // TODO: Re-enable after testing basic functionality
        /*
        const existingFiles = await checkExistingFiles(filename);
        if (existingFiles.length > 0) {
            console.log(`DEBUG [${new Date().toISOString()}]: File already exists, cancelling download:`, filename);
            
            // Cancel the download
            suggest({
                filename: filename,
                conflictAction: 'overwrite' // This will be cancelled anyway
            });
            
            // Cancel the download immediately
            setTimeout(() => {
                chrome.downloads.cancel(downloadItem.id, () => {
                    console.log(`DEBUG [${new Date().toISOString()}]: Download cancelled for existing file:`, filename);
                    
                    // Notify content script that download was skipped
                    if (currentPDFTabId && tabResponseCallbacks[currentPDFTabId]) {
                        const callback = tabResponseCallbacks[currentPDFTabId];
                        callback({
                            success: true, 
                            tabId: currentPDFTabId, 
                            downloadSuccess: false, 
                            skipped: true,
                            reason: 'File already exists',
                            filename: filename
                        });
                        delete tabResponseCallbacks[currentPDFTabId];
                    }
                    
                    // Close the PDF tab
                    if (currentPDFTabId) {
                        chrome.tabs.remove(currentPDFTabId);
                        currentPDFTabId = null;
                    }
                });
            }, 100);
            
            return;
        }
        */
        
        console.log('Setting download filename:', filename);
        
        // Use the suggest callback to set the filename and handle conflicts
        suggest({
            filename: filename,
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
        
        // Validate URL before attempting download
        if (!request.url || !request.url.startsWith('http')) {
            console.log('Invalid URL for download:', request.url);
            sendResponse({success: false, error: 'Invalid URL'});
            return true;
        }
        
        // Use Chrome's downloads API to download the PDF directly
        // Note: We let onDeterminingFilename handle the folder creation
        chrome.downloads.download({
            url: request.url,
            saveAs: false // Don't prompt user, use automatic download
        }).then(downloadId => {
            console.log('Download started with ID:', downloadId);
            
            // Monitor this specific download
            const checkDownload = () => {
                chrome.downloads.search({id: downloadId}, (results) => {
                    if (results.length > 0) {
                        const download = results[0];
                        console.log('Download status:', download.state);
                        
                        if (download.state === 'complete') {
                            console.log('Download completed successfully:', download.filename);
                            sendResponse({success: true, downloadId: downloadId, filename: download.filename});
                        } else if (download.state === 'interrupted') {
                            console.log('Download failed:', download.error);
                            sendResponse({success: false, error: download.error});
                        } else {
                            // Still in progress, check again in 1 second
                            setTimeout(checkDownload, 1000);
                        }
                    }
                });
            };
            
            // Start monitoring
            setTimeout(checkDownload, 1000);
            
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
    } else if (request.action === 'openPDFTab') {
        console.log('DEBUG: Received openPDFTab request at:', new Date().toISOString());
        console.log('DEBUG: Request URL:', request.url?.substring(0, 100) + '...');
        console.log('DEBUG: Current PDF tab ID before:', currentPDFTabId);
        
        // Validate URL
        if (!request.url || !request.url.startsWith('http')) {
            console.log('DEBUG: Invalid URL for tab:', request.url);
            sendResponse({success: false, error: 'Invalid URL'});
            return true;
        }
        
        // Maintain limited concurrent tabs (max 3) to avoid security restrictions
        console.log('DEBUG: Creating new PDF tab (limited concurrent mode)...');
        
        // If we have too many PDF tabs open, wait for some to close
        chrome.tabs.query({url: '*://www.hcdistrictclerk.com/Edocs/Public/ViewFilePage.aspx*'}, (existingTabs) => {
            console.log('DEBUG: Current ViewFilePage tabs open:', existingTabs.length);
            
            if (existingTabs.length >= 3) {
                console.log('DEBUG: Too many tabs open, waiting 2 seconds before opening new tab...');
                setTimeout(() => {
                    createPDFTab(request.url, sendResponse);
                }, 2000);
            } else {
                createPDFTab(request.url, sendResponse);
            }
        });
        
        function createPDFTab(url, callback) {
            chrome.tabs.create({
                url: url,
                active: false
            }).then(tab => {
                console.log('DEBUG: Successfully opened new PDF tab:', tab.id);
                console.log('DEBUG: Tab URL:', tab.url?.substring(0, 100) + '...');
                
                callback({success: true, tabId: tab.id});
            }).catch(error => {
                console.log('DEBUG: Failed to create PDF tab:', error);
                callback({success: false, error: error.message});
            });
        }
        
        return true; // Keep message channel open for async response
    } else if (request.action === 'openPDFTabWithCallback') {
        const requestStartTime = Date.now();
        console.log(`DEBUG [${new Date().toISOString()}]: Received openPDFTabWithCallback request`);
        console.log(`DEBUG [${new Date().toISOString()}]: Request URL:`, request.url?.substring(0, 100) + '...');
        console.log(`DEBUG [${new Date().toISOString()}]: Document info:`, request.documentNumber, request.documentTitle);
        
        // Validate URL
        if (!request.url || !request.url.startsWith('http')) {
            console.log(`DEBUG [${new Date().toISOString()}]: Invalid URL for tab:`, request.url);
            sendResponse({success: false, error: 'Invalid URL'});
            return true;
        }
        
        // Close current PDF tab first, then open new one (one tab at a time)
        console.log(`DEBUG [${new Date().toISOString()}]: Closing current PDF tab (if any)...`);
        const closeStartTime = Date.now();
        
        closeCurrentPDFTab().then(() => {
            const closeEndTime = Date.now();
            const closeDuration = closeEndTime - closeStartTime;
            console.log(`DEBUG [${new Date().toISOString()}]: Current PDF tab closed (took ${closeDuration}ms), creating new tab...`);
            
            const createStartTime = Date.now();
            chrome.tabs.create({
                url: request.url,
                active: false
            }).then(tab => {
                const createEndTime = Date.now();
                const createDuration = createEndTime - createStartTime;
                const totalDuration = createEndTime - requestStartTime;
                
                currentPDFTabId = tab.id;
                console.log(`DEBUG [${new Date().toISOString()}]: Successfully opened new PDF tab: ${tab.id} (create: ${createDuration}ms, total: ${totalDuration}ms)`);
                
                // Store the response callback for this tab
                tabResponseCallbacks[tab.id] = sendResponse;
                
                // Store document information for this tab
                tabDocumentInfo[tab.id] = {
                    number: request.documentNumber || 'unknown',
                    title: request.documentTitle || 'document'
                };
                
                // Set timeout in case download never completes
                setTimeout(() => {
                    if (tabResponseCallbacks[tab.id]) {
                        console.log(`DEBUG [${new Date().toISOString()}]: Timeout waiting for download completion for tab: ${tab.id} (after 30s)`);
                        const callback = tabResponseCallbacks[tab.id];
                        callback({success: true, tabId: tab.id, downloadSuccess: false, error: 'Download timeout'});
                        delete tabResponseCallbacks[tab.id];
                    }
                }, 30000); // 30 second timeout
                
            }).catch(error => {
                const createEndTime = Date.now();
                const createDuration = createEndTime - createStartTime;
                console.log(`DEBUG [${new Date().toISOString()}]: Failed to create PDF tab (after ${createDuration}ms):`, error);
                sendResponse({success: false, error: error.message});
            });
        }).catch(error => {
            const closeEndTime = Date.now();
            const closeDuration = closeEndTime - closeStartTime;
            console.log(`DEBUG [${new Date().toISOString()}]: Failed to close current PDF tab (after ${closeDuration}ms):`, error);
            sendResponse({success: false, error: error.message});
        });
        
        return true; // Keep message channel open for async response
    } else if (request.action === 'notifyPDFProcessed') {
        console.log(`DEBUG [${new Date().toISOString()}]: PDF processing completed for tab: ${request.tabId}`);
        console.log(`DEBUG [${new Date().toISOString()}]: PDF processing result:`, {
            success: request.success,
            downloadId: request.downloadId,
            error: request.error
        });
        
        // Check if we have a callback waiting for this tab
        if (tabResponseCallbacks[request.tabId]) {
            console.log(`DEBUG [${new Date().toISOString()}]: Calling stored callback for tab: ${request.tabId}`);
            const callback = tabResponseCallbacks[request.tabId];
            callback({
                success: true, 
                tabId: request.tabId, 
                downloadSuccess: request.success, 
                downloadId: request.downloadId
            });
            
            // Clean up the callback
            delete tabResponseCallbacks[request.tabId];
        }
        
        sendResponse({success: true});
        return true;
    }
}); 