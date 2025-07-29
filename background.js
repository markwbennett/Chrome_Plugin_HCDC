// Background service worker for Harris County District Clerk Auto Clicker
const manifest = chrome.runtime.getManifest();
console.log(`HCDC Auto Clicker v${manifest.version} background script loaded at:`, new Date().toISOString());

// Store case number for current download session
let currentCaseNumber = 'unknown_case';

// Track downloaded files in current session to prevent duplicates
let sessionDownloads = new Set();

// Track the current PDF tab to ensure only one is open at a time
let currentPDFTabId = null;

// Store response callbacks for tabs waiting for download completion (removed - now respond immediately)

// Store document information for each tab
let tabDocumentInfo = {};

// Track plugin-initiated vs manual PDF tab opens
let pluginInitiatedTabs = new Set();

// Function to generate session key for duplicate checking
function generateSessionKey(caseNumber, docNumber, docTitle) {
    return `${caseNumber}_${docNumber}_${docTitle}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

// Listen for tab updates to handle ViewFilePage tabs
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status) {
        console.log(`DEBUG [${new Date().toISOString()}]: Tab updated: ${tabId}, status: ${changeInfo.status}, URL: ${tab.url?.substring(0, 100) + '...'}`);
    }
    
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('ViewFilePage.aspx')) {
        console.log(`DEBUG [${new Date().toISOString()}]: ViewFilePage loaded for tab: ${tabId}`);
        console.log(`DEBUG [${new Date().toISOString()}]: ViewFilePage URL: ${tab.url?.substring(0, 100) + '...'}`);
        
        // Check if this tab was initiated by the plugin
        const isPluginInitiated = pluginInitiatedTabs.has(tabId);
        console.log(`DEBUG [${new Date().toISOString()}]: Tab ${tabId} plugin-initiated: ${isPluginInitiated}`);
        
        if (!isPluginInitiated) {
            console.log(`DEBUG [${new Date().toISOString()}]: Skipping auto-download for manually opened PDF viewer tab: ${tabId}`);
            return;
        }
        
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
    
    // Clean up stored document info
    if (tabDocumentInfo[tabId]) {
        console.log('DEBUG: Cleaning up document info for tab:', tabId);
        delete tabDocumentInfo[tabId];
    }
    
    // Clean up plugin-initiated tab tracking
    if (pluginInitiatedTabs.has(tabId)) {
        console.log('DEBUG: Cleaning up plugin-initiated tab tracking for:', tabId);
        pluginInitiatedTabs.delete(tabId);
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

/**
 * Extracts the direct PDF URL from the District Clerk ViewFilePage and triggers a download.
 * Executed as an injected script inside the newly opened viewer tab.
 * After locating the PDF resource, the function messages the background script with
 * action 'downloadPDF' and closes the tab.
 *
 * @param {number} tabId - Identifier of the tab where extraction occurs.
 */
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
async function checkExistingFiles(filename, docNumber = null) {
    return new Promise((resolve) => {
        // If we have a document number, check for any files starting with that 9-digit number
        if (docNumber && docNumber.length >= 9) {
            const searchPattern = docNumber.substring(0, 9);
            console.log(`DEBUG [${new Date().toISOString()}]: Checking for existing files with document number: ${searchPattern}`);
            
            // Search all completed downloads and filter by document number pattern
            chrome.downloads.search({
                state: 'complete'
            }, (allResults) => {
                const matchingFiles = allResults.filter(result => {
                    if (!result.filename) return false;
                    
                    // Extract just the filename from the full path
                    const fileName = result.filename.split('/').pop() || result.filename;
                    
                    // Check if filename starts with the 9-digit document number
                    const fileStartsWith9Digits = fileName.match(/^(\d{9})/);
                    if (fileStartsWith9Digits && fileStartsWith9Digits[1] === searchPattern) {
                        console.log(`DEBUG [${new Date().toISOString()}]: Found existing file with same document number: ${fileName}`);
                        return true;
                    }
                    return false;
                });
                
                console.log(`DEBUG [${new Date().toISOString()}]: Found ${matchingFiles.length} existing files with document number ${searchPattern}`);
                resolve(matchingFiles);
            });
        } else {
            // Fallback to exact filename check
            chrome.downloads.search({
                filename: filename,
                state: 'complete'
            }, (results) => {
                console.log(`DEBUG [${new Date().toISOString()}]: Checked for existing file "${filename}":`, results.length, 'matches');
                resolve(results);
            });
        }
    });
}

// Listen for download events to ensure proper file naming and location
chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
    console.log(`DEBUG [${new Date().toISOString()}]: onDeterminingFilename called for:`, downloadItem.url);
    
    // Check if this is from the District Clerk site
    if (downloadItem.url && downloadItem.url.includes('hcdistrictclerk.com')) {
        console.log('District Clerk download detected:', downloadItem.filename);
        console.log('Original filename:', downloadItem.filename);
        console.log('Case number:', currentCaseNumber);
        console.log('Current PDF tab ID:', currentPDFTabId);
        
        // Find document info for current PDF tab
        let docInfo = null;
        if (currentPDFTabId && tabDocumentInfo[currentPDFTabId]) {
            docInfo = tabDocumentInfo[currentPDFTabId];
            console.log('DEBUG: Using document info for tab:', currentPDFTabId, docInfo);
        } else {
            console.log('DEBUG: No document info found. currentPDFTabId:', currentPDFTabId);
            console.log('DEBUG: Available tab document info:', Object.keys(tabDocumentInfo));
            console.log('DEBUG: Full tabDocumentInfo:', tabDocumentInfo);
        }
        
        // Ensure we have a case number
        if (!currentCaseNumber || currentCaseNumber === 'unknown_case') {
            console.log('DEBUG: Case number not set, using default');
            currentCaseNumber = 'unknown_case';
        }
        console.log('DEBUG: Final case number for filename:', currentCaseNumber);
        
        // Create filename with document number and title
        let filename;
        console.log('DEBUG: About to create filename with docInfo:', docInfo);
        console.log('DEBUG: DocInfo validation - number:', docInfo?.number, 'title:', docInfo?.title);
        
        if (docInfo && docInfo.number && docInfo.number !== 'unknown' && docInfo.title && docInfo.title !== 'document') {
            // Sanitize the title to remove invalid filename characters
            const sanitizedTitle = docInfo.title.replace(/[<>:"/\\|?*]/g, '_').trim();
            // Format: {caseNumber}/{number} {title}.pdf
            filename = `${currentCaseNumber}/${docInfo.number} ${sanitizedTitle}.pdf`;
            console.log('DEBUG: Using document-based filename:', filename);
        } else {
            // Fallback
            if (docInfo && docInfo.number && docInfo.number !== 'unknown') {
                filename = `${currentCaseNumber}/${docInfo.number} Document.pdf`;
            } else {
                filename = `${currentCaseNumber}/hcdc_document_${Date.now()}.pdf`;
            }
            console.log('DEBUG: Using fallback filename:', filename);
        }
        
        // Suggest filename immediately (must be synchronous)
        try {
            suggest({ filename: filename, conflictAction: 'uniquify' });
        } catch (e) {
            console.error('ERROR suggesting filename:', e);
        }
        
        // ---- Duplicate checks run asynchronously so we don't block suggest ----
        const sessionKey = generateSessionKey(currentCaseNumber, docInfo?.number || 'unknown', docInfo?.title || 'document');
        console.log(`DEBUG [${new Date().toISOString()}]: Async duplicate check. Key:`, sessionKey);
        
        if (sessionDownloads.has(sessionKey)) {
            console.log('Duplicate in session detected. Cancelling download:', filename);
            chrome.downloads.cancel(downloadItem.id);
            return;
        }
        
        checkExistingFiles(filename, docInfo?.number).then(existingFiles => {
            if (existingFiles.length > 0) {
                console.log('Document already exists on disk (by 9-digit number). Cancelling download:', filename);
                console.log('Existing files found:', existingFiles.map(f => f.filename));
                sessionDownloads.add(sessionKey);
                chrome.downloads.cancel(downloadItem.id);
            } else {
                sessionDownloads.add(sessionKey);
                console.log('Filename set and no duplicates found. Proceeding with download.');
            }
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
        
        // If case number changed or explicitly requested, clear session downloads
        if (currentCaseNumber !== request.caseNumber || request.clearSession) {
            console.log('Clearing session downloads:', request.clearSession ? 'explicitly requested' : 'case number changed');
            console.log('Session downloads before clearing:', Array.from(sessionDownloads));
            sessionDownloads.clear();
            console.log('Session downloads after clearing:', Array.from(sessionDownloads));
        } else {
            console.log('NOT clearing session downloads. Current case:', currentCaseNumber, 'Request case:', request.caseNumber, 'Clear requested:', request.clearSession);
        }
        
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
                
                // Mark this tab as plugin-initiated
                pluginInitiatedTabs.add(tab.id);
                console.log('DEBUG: Marked tab as plugin-initiated:', tab.id);
                
                callback({success: true, tabId: tab.id});
            }).catch(error => {
                console.log('DEBUG: Failed to create PDF tab:', error);
                callback({success: false, error: error.message});
            });
        }
        
        return true; // Keep message channel open for async response
    } else if (request.action === 'openPDFTabWithCallback') {
        const requestStartTime = Date.now();
        console.log(`DEBUG [${new Date().toISOString()}]: *** RECEIVED openPDFTabWithCallback request ***`);
        console.log(`DEBUG [${new Date().toISOString()}]: Request URL:`, request.url?.substring(0, 100) + '...');
        console.log(`DEBUG [${new Date().toISOString()}]: Document info:`, request.documentNumber, request.documentTitle);
        console.log(`DEBUG [${new Date().toISOString()}]: Case number:`, request.caseNumber);
        
        // Validate URL
        if (!request.url || !request.url.startsWith('http')) {
            console.log(`DEBUG [${new Date().toISOString()}]: Invalid URL for tab:`, request.url);
            sendResponse({success: false, error: 'Invalid URL'});
            return true;
        }
        
        // Close current PDF tab first, then open new one (one tab at a time)
        console.log(`DEBUG [${new Date().toISOString()}]: Closing current PDF tab (if any)...`);
        
        closeCurrentPDFTab().then(() => {
            console.log(`DEBUG [${new Date().toISOString()}]: Current PDF tab closed, creating new tab...`);
            
            chrome.tabs.create({
                url: request.url,
                active: false
            }).then(tab => {
                currentPDFTabId = tab.id;
                console.log(`DEBUG [${new Date().toISOString()}]: Successfully opened new PDF tab: ${tab.id}`);
                
                // Mark this tab as plugin-initiated
                pluginInitiatedTabs.add(tab.id);
                console.log(`DEBUG [${new Date().toISOString()}]: Marked tab as plugin-initiated: ${tab.id}`);
                
                // Store document information for this tab
                tabDocumentInfo[tab.id] = {
                    number: request.documentNumber || 'unknown',
                    title: request.documentTitle || 'document',
                    callback: sendResponse, // Store the callback to respond when download completes
                    requestTime: requestStartTime
                };
                console.log(`DEBUG [${new Date().toISOString()}]: Stored document info for tab ${tab.id}:`, tabDocumentInfo[tab.id]);
                
                // Update case number if provided
                if (request.caseNumber && request.caseNumber !== currentCaseNumber) {
                    console.log(`DEBUG [${new Date().toISOString()}]: Updating case number from ${currentCaseNumber} to ${request.caseNumber}`);
                    currentCaseNumber = request.caseNumber;
                }
                
                // Don't respond immediately - wait for PDF processing to complete
                console.log(`DEBUG [${new Date().toISOString()}]: Waiting for PDF processing to complete for tab ${tab.id}...`);
                
                // Set a timeout to respond if PDF processing takes too long
                setTimeout(() => {
                    const docInfo = tabDocumentInfo[tab.id];
                    if (docInfo && docInfo.callback) {
                        console.log(`DEBUG [${new Date().toISOString()}]: PDF processing timeout for tab ${tab.id}, responding anyway`);
                        docInfo.callback({
                            success: false,
                            tabId: tab.id,
                            downloadSuccess: false,
                            error: 'Processing timeout',
                            processingTime: Date.now() - docInfo.requestTime
                        });
                        delete tabDocumentInfo[tab.id];
                    }
                }, 30000); // 30 second timeout
                
            }).catch(error => {
                console.log(`DEBUG [${new Date().toISOString()}]: Failed to create PDF tab:`, error);
                sendResponse({success: false, error: error.message});
            });
        }).catch(error => {
            console.log(`DEBUG [${new Date().toISOString()}]: Failed to close current PDF tab:`, error);
            sendResponse({success: false, error: error.message});
        });
        
        return true; // Keep message channel open for async response
    } else if (request.action === 'checkDocumentExists') {
        console.log(`DEBUG [${new Date().toISOString()}]: Checking if document exists:`, request.documentNumber);
        
        // Validate document number
        if (!request.documentNumber || request.documentNumber.length < 9) {
            console.log(`DEBUG [${new Date().toISOString()}]: Invalid document number for check:`, request.documentNumber);
            sendResponse({exists: false, error: 'Invalid document number'});
            return true;
        }
        
        // Use the enhanced checkExistingFiles function
        checkExistingFiles(null, request.documentNumber).then(existingFiles => {
            const exists = existingFiles.length > 0;
            console.log(`DEBUG [${new Date().toISOString()}]: Document ${request.documentNumber} exists:`, exists);
            if (exists) {
                console.log(`DEBUG [${new Date().toISOString()}]: Existing files:`, existingFiles.map(f => f.filename));
            }
            sendResponse({exists: exists, existingFiles: existingFiles.map(f => f.filename)});
        }).catch(error => {
            console.log(`DEBUG [${new Date().toISOString()}]: Error checking document existence:`, error);
            sendResponse({exists: false, error: error.message});
        });
        
        return true; // Keep message channel open for async response
    } else if (request.action === 'notifyPDFProcessed') {
        console.log(`DEBUG [${new Date().toISOString()}]: PDF processing completed for tab: ${request.tabId}`);
        console.log(`DEBUG [${new Date().toISOString()}]: PDF processing result:`, {
            success: request.success,
            downloadId: request.downloadId,
            error: request.error
        });
        
        // Find the stored callback for this tab and respond to the original content script request
        const docInfo = tabDocumentInfo[request.tabId];
        if (docInfo && docInfo.callback) {
            console.log(`DEBUG [${new Date().toISOString()}]: Calling stored callback for tab ${request.tabId}`);
            const processingTime = Date.now() - docInfo.requestTime;
            console.log(`DEBUG [${new Date().toISOString()}]: Processing took ${processingTime}ms`);
            
            docInfo.callback({
                success: true,
                tabId: request.tabId,
                downloadSuccess: request.success,
                downloadId: request.downloadId,
                error: request.error,
                processingTime: processingTime
            });
            
            // Clean up the stored callback
            delete tabDocumentInfo[request.tabId];
        } else {
            console.log(`DEBUG [${new Date().toISOString()}]: No callback found for tab ${request.tabId}`);
        }
        
        sendResponse({success: true});
        return true;
    }
}); 