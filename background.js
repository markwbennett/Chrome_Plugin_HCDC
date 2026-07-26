// Background service worker for Harris County District Clerk Auto Clicker
// Timing/orchestration lives here so downloads continue when the case tab is
// backgrounded. Chrome throttles setTimeout in inactive tabs; the service
// worker is not subject to that throttle (and chrome.alarms survives SW sleep).
const manifest = chrome.runtime.getManifest();
console.log(`HCDC Auto Clicker v${manifest.version} background script loaded at:`, new Date().toISOString());

// Store case number for current download session
let currentCaseNumber = 'unknown_case';

// Track downloaded files in current session to prevent duplicates
let sessionDownloads = new Set();

// Track the current PDF tab to ensure only one is open at a time
let currentPDFTabId = null;

// Store response callbacks for tabs waiting for download completion
let pendingResponses = {};

// Store document information for each tab
let tabDocumentInfo = {};

// Track plugin-initiated vs manual PDF tab opens
let pluginInitiatedTabs = new Set();

// Tabs currently mid-extraction (prevent double processViewFilePage)
let extractingTabs = new Set();

// Content-script delay callbacks (id -> sendResponse)
const pendingDelays = new Map();
let delaySeq = 0;

// Keep-alive ports from content scripts while a download session is running
const keepAlivePorts = new Set();
const KEEPALIVE_ALARM = 'hcdc-session-keepalive';

// Function to generate session key for duplicate checking
function generateSessionKey(caseNumber, docNumber, docTitle) {
    return `${caseNumber}_${docNumber}_${docTitle}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

/** Promise-based delay that runs in the service worker (not a page timer). */
function swDelay(ms) {
    return new Promise((resolve) => {
        const id = `swd_${++delaySeq}_${Date.now()}`;
        pendingDelays.set(id, () => resolve());
        const when = Date.now() + Math.max(0, ms || 0);
        // Alarms are durable across SW restarts for longer waits; short waits use setTimeout.
        if (ms <= 25000) {
            setTimeout(() => {
                const cb = pendingDelays.get(id);
                if (cb) {
                    pendingDelays.delete(id);
                    cb();
                }
            }, Math.max(0, ms || 0));
        } else {
            chrome.alarms.create(id, { when });
        }
    });
}

function startSessionKeepAlive() {
    // Chrome clamps periodInMinutes below 1 in production; 1 min is enough as a SW wake tick.
    chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 1 });
    console.log(`DEBUG [${new Date().toISOString()}]: Session keep-alive alarm started`);
}

function stopSessionKeepAlive() {
    chrome.alarms.clear(KEEPALIVE_ALARM);
    console.log(`DEBUG [${new Date().toISOString()}]: Session keep-alive alarm stopped`);
}

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === KEEPALIVE_ALARM) {
        // Wake-only; ports + active work keep the session alive.
        console.log(`DEBUG [${new Date().toISOString()}]: Keep-alive tick (ports=${keepAlivePorts.size})`);
        return;
    }
    const cb = pendingDelays.get(alarm.name);
    if (cb) {
        pendingDelays.delete(alarm.name);
        try { cb(); } catch (e) { console.log('Delay callback error:', e); }
    }
});

// Long-lived ports keep the service worker alive while the content script runs.
chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'hcdc-keepalive') return;
    keepAlivePorts.add(port);
    startSessionKeepAlive();
    console.log(`DEBUG [${new Date().toISOString()}]: Keep-alive port connected (total=${keepAlivePorts.size})`);
    port.onDisconnect.addListener(() => {
        keepAlivePorts.delete(port);
        console.log(`DEBUG [${new Date().toISOString()}]: Keep-alive port disconnected (total=${keepAlivePorts.size})`);
        if (keepAlivePorts.size === 0) {
            stopSessionKeepAlive();
        }
    });
    port.onMessage.addListener((msg) => {
        if (msg && msg.type === 'ping') {
            try { port.postMessage({ type: 'pong', t: Date.now() }); } catch (_) {}
        }
    });
});

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

        if (extractingTabs.has(tabId)) {
            console.log(`DEBUG [${new Date().toISOString()}]: Extraction already in progress for tab ${tabId}`);
            return;
        }
        
        // Store this as the current PDF tab
        currentPDFTabId = tabId;

        // Drive extraction from the service worker (not in-tab setTimeout, which
        // Chrome throttles heavily for inactive PDF tabs opened with active:false).
        processViewFilePage(tabId);
    }
});

/**
 * Poll the ViewFilePage tab from the service worker until a PDF URL appears,
 * then download it. Retries use SW timers so background tabs keep working.
 */
async function processViewFilePage(tabId) {
    extractingTabs.add(tabId);
    const maxAttempts = 12;
    const gapMs = 750;
    console.log(`DEBUG [${new Date().toISOString()}]: processViewFilePage start for tab ${tabId}`);

    try {
        // Brief initial wait for iframes/embeds to populate
        await swDelay(800);

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            // Tab may have been closed mid-poll
            if (!pluginInitiatedTabs.has(tabId) && !pendingResponses[tabId]) {
                console.log(`DEBUG [${new Date().toISOString()}]: Tab ${tabId} no longer tracked; aborting extract`);
                return;
            }

            let pdfUrl = null;
            try {
                const results = await chrome.scripting.executeScript({
                    target: { tabId },
                    func: findPDFUrlOnce
                });
                pdfUrl = results && results[0] ? results[0].result : null;
            } catch (err) {
                console.log(`DEBUG [${new Date().toISOString()}]: executeScript attempt ${attempt} failed on tab ${tabId}:`, err.message);
                // If tab is gone, finish as failure
                if (String(err.message || err).includes('No tab with id') ||
                    String(err.message || err).includes('Cannot access')) {
                    completePDFProcessing(tabId, false, null, 'Tab inaccessible: ' + err.message);
                    return;
                }
            }

            console.log(`DEBUG [${new Date().toISOString()}]: Extract attempt ${attempt}/${maxAttempts} tab ${tabId}: ${pdfUrl ? pdfUrl.substring(0, 120) : 'null'}`);

            if (pdfUrl && typeof pdfUrl === 'string' && pdfUrl.startsWith('http')) {
                try {
                    const downloadId = await chrome.downloads.download({
                        url: pdfUrl,
                        saveAs: false
                    });
                    console.log(`DEBUG [${new Date().toISOString()}]: Download started id=${downloadId} for tab ${tabId}`);
                    completePDFProcessing(tabId, true, downloadId, null);
                } catch (dlErr) {
                    console.log(`DEBUG [${new Date().toISOString()}]: Download failed for tab ${tabId}:`, dlErr);
                    completePDFProcessing(tabId, false, null, dlErr.message || String(dlErr));
                }
                return;
            }

            if (attempt < maxAttempts) {
                await swDelay(gapMs);
            }
        }

        completePDFProcessing(tabId, false, null, 'No PDF found after all attempts');
    } finally {
        extractingTabs.delete(tabId);
    }
}

/**
 * Resolve the content-script callback for a finished PDF tab and close the tab.
 * Used by both SW-driven extraction and the legacy notifyPDFProcessed message path.
 */
function completePDFProcessing(tabId, success, downloadId, error) {
    console.log(`DEBUG [${new Date().toISOString()}]: completePDFProcessing tab=${tabId} success=${success} downloadId=${downloadId} error=${error}`);

    const pending = pendingResponses[tabId];
    const docInfo = tabDocumentInfo[tabId];

    if (pending) {
        const processingTime = Date.now() - pending.requestStartTime;
        try {
            pending.sendResponse({
                success: true,
                tabId: tabId,
                downloadSuccess: !!success,
                skipped: !success,
                reason: error || (success ? null : 'Download failed'),
                processingTime: processingTime,
                downloadId: downloadId || undefined
            });
        } catch (e) {
            console.log(`DEBUG [${new Date().toISOString()}]: sendResponse failed for tab ${tabId}:`, e);
        }
        delete pendingResponses[tabId];
    } else {
        console.log(`DEBUG [${new Date().toISOString()}]: No pending response for tab ${tabId}`);
    }

    if (docInfo) {
        delete tabDocumentInfo[tabId];
    }

    chrome.tabs.remove(tabId).catch(err => {
        console.log(`DEBUG [${new Date().toISOString()}]: Could not close tab ${tabId}:`, err);
    });
}

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

    // Clean up pending responses - respond with failure if tab closed before processing
    if (pendingResponses[tabId]) {
        console.log('DEBUG: Tab closed before PDF processing completed:', tabId);
        const pending = pendingResponses[tabId];
        pending.sendResponse({
            success: true,
            tabId: tabId,
            downloadSuccess: false,
            skipped: true,
            reason: 'Tab closed before processing completed',
            processingTime: Date.now() - pending.requestStartTime
        });
        delete pendingResponses[tabId];
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
 * One-shot PDF URL probe. Injected into the ViewFilePage tab via executeScript.
 * Returns a URL string or null — no timers, no messaging (callers retry from the SW).
 * Must be self-contained: serialized into the tab, cannot close over SW state.
 */
function findPDFUrlOnce() {
    // Chrome built-in PDF viewer
    if (document.querySelector('pdf-viewer')) {
        return window.location.href;
    }
    if (document.contentType && document.contentType.includes('pdf')) {
        return window.location.href;
    }

    const iframes = document.querySelectorAll('iframe');
    for (let i = 0; i < iframes.length; i++) {
        const src = iframes[i].src;
        if (!src) continue;
        if (src.includes('ViewFilePage.aspx') || src.includes('.pdf') || src.includes('GetFile')) {
            return src;
        }
    }

    const embeds = document.querySelectorAll('embed');
    for (let i = 0; i < embeds.length; i++) {
        const src = embeds[i].src;
        if (src && (src.includes('.pdf') || src.includes('GetFile'))) {
            return src;
        }
    }

    const objects = document.querySelectorAll('object');
    for (let i = 0; i < objects.length; i++) {
        const data = objects[i].data;
        if (data && (data.includes('.pdf') || data.includes('GetFile'))) {
            return data;
        }
    }

    const links = document.querySelectorAll('a[href*=".pdf"], a[href*="GetFile"]');
    if (links.length > 0 && links[0].href) {
        return links[0].href;
    }

    const pageHTML = document.documentElement ? document.documentElement.outerHTML : '';
    const pdfUrlMatch = pageHTML.match(/https?:\/\/[^"'\s]+\.pdf/i) ||
                       pageHTML.match(/https?:\/\/[^"'\s]+GetFile[^"'\s]*/i);
    if (pdfUrlMatch) {
        return pdfUrlMatch[0];
    }

    // Direct ViewFilePage URL itself often serves the file once the session cookie is present
    if (window.location.href.includes('ViewFilePage.aspx')) {
        // Only fall back to the page URL if body looks empty / binary (PDF plug-in)
        const bodyText = (document.body && document.body.innerText) ? document.body.innerText.trim() : '';
        if (bodyText.length < 40) {
            return window.location.href;
        }
    }

    return null;
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
        
        // Track this download in session to prevent duplicates within same session
        const sessionKey = generateSessionKey(currentCaseNumber, docInfo?.number || 'unknown', docInfo?.title || 'document');
        console.log(`DEBUG [${new Date().toISOString()}]: Session key: ${sessionKey}`);

        if (sessionDownloads.has(sessionKey)) {
            console.log('Duplicate in session detected. Cancelling download:', filename);
            chrome.downloads.cancel(downloadItem.id);
            return;
        }

        // Add to session downloads and proceed
        // Note: Removed checkExistingFiles - it checks download HISTORY not actual files
        // Chrome's conflictAction: 'uniquify' handles actual file duplicates
        sessionDownloads.add(sessionKey);
        console.log('Proceeding with download:', filename);
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
    // Schedule a delay in the service worker so content-script orchestration
    // is not subject to Chrome's background-tab timer throttling.
    if (request.action === 'scheduleDelay') {
        const ms = Math.max(0, Number(request.ms) || 0);
        const id = `delay_${++delaySeq}_${Date.now()}`;
        console.log(`DEBUG [${new Date().toISOString()}]: scheduleDelay ${ms}ms id=${id}`);
        pendingDelays.set(id, () => {
            try { sendResponse({ done: true, id }); } catch (e) {
                console.log('scheduleDelay sendResponse failed:', e);
            }
        });
        if (ms <= 25000) {
            setTimeout(() => {
                const cb = pendingDelays.get(id);
                if (cb) {
                    pendingDelays.delete(id);
                    cb();
                }
            }, ms);
        } else {
            chrome.alarms.create(id, { when: Date.now() + ms });
        }
        return true;
    }

    if (request.action === 'sessionKeepAlive') {
        if (request.enabled) {
            startSessionKeepAlive();
        } else if (keepAlivePorts.size === 0) {
            stopSessionKeepAlive();
        }
        sendResponse({ success: true });
        return true;
    }

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
            // Respond immediately once download starts - don't wait for completion
            // This allows the next document to start processing while this downloads
            sendResponse({success: true, downloadId: downloadId});
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
        
        // Don't close current PDF tab - let it finish and close itself via window.close()
        // This prevents race conditions where we close a tab before it finishes processing
        console.log(`DEBUG [${new Date().toISOString()}]: Creating new PDF tab (previous tab will close itself)...`);

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
                requestTime: requestStartTime
            };
            console.log(`DEBUG [${new Date().toISOString()}]: Stored document info for tab ${tab.id}:`, tabDocumentInfo[tab.id]);

            // Update case number if provided
            if (request.caseNumber && request.caseNumber !== currentCaseNumber) {
                console.log(`DEBUG [${new Date().toISOString()}]: Updating case number from ${currentCaseNumber} to ${request.caseNumber}`);
                currentCaseNumber = request.caseNumber;
            }

            // Store the response callback to be called when PDF processing completes
            pendingResponses[tab.id] = {
                sendResponse: sendResponse,
                requestStartTime: requestStartTime
            };
            console.log(`DEBUG [${new Date().toISOString()}]: Stored pending response for tab ${tab.id}, waiting for PDF processing...`);

            // Set a timeout to respond if PDF processing takes too long (30 seconds)
            setTimeout(() => {
                const pending = pendingResponses[tab.id];
                if (pending) {
                    console.log(`DEBUG [${new Date().toISOString()}]: Timeout waiting for PDF processing on tab ${tab.id}`);
                    pending.sendResponse({
                        success: true,
                        tabId: tab.id,
                        downloadSuccess: false,
                        skipped: true,
                        reason: 'Timeout waiting for PDF',
                        processingTime: Date.now() - pending.requestStartTime
                    });
                    delete pendingResponses[tab.id];
                    delete tabDocumentInfo[tab.id];
                    // Close the tab if it's still open
                    chrome.tabs.remove(tab.id).catch(() => {});
                }
            }, 30000); // 30 second timeout

        }).catch(error => {
            console.log(`DEBUG [${new Date().toISOString()}]: Failed to create PDF tab:`, error);
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
        // Legacy path (older injected extractors). Prefer SW-driven processViewFilePage.
        console.log(`DEBUG [${new Date().toISOString()}]: notifyPDFProcessed for tab: ${request.tabId}`);
        completePDFProcessing(
            request.tabId,
            !!request.success,
            request.downloadId || null,
            request.error || null
        );
        sendResponse({success: true});
        return true;
    }
}); 