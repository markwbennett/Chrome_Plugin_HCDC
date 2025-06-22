// Content script for Harris County District Clerk Auto Clicker
(function() {
    'use strict';

    let isAutoClickingEnabled = false;
    let clickDelay = 2000; // Default 2 seconds between clicks
    let currentIndex = 0;
    let documentLinks = [];
    let intervalId = null;
    // No longer need callback tracking since we process concurrently

    // Persistence key for sessionStorage
    const PERSISTENCE_KEY = 'hcdc_auto_clicker_state';
    
    // Load state from sessionStorage on script initialization
    function loadPersistedState() {
        try {
            const saved = sessionStorage.getItem(PERSISTENCE_KEY);
            if (saved) {
                const state = JSON.parse(saved);
                console.log('DEBUG: Loading persisted state:', state);
                
                if (state.isAutoClickingEnabled && state.currentIndex !== undefined) {
                    isAutoClickingEnabled = state.isAutoClickingEnabled;
                    currentIndex = state.currentIndex;
                    console.log(`DEBUG: Resuming auto-clicking from index ${currentIndex}`);
                    
                    // Resume processing after a short delay to ensure page is ready
                    setTimeout(() => {
                        if (isAutoClickingEnabled) {
                            documentLinks = findDocumentLinks();
                            if (documentLinks.length > 0 && currentIndex < documentLinks.length) {
                                console.log(`DEBUG: Resuming processing with ${documentLinks.length} links from index ${currentIndex}`);
                                processNextLinkWithWait();
                            } else {
                                console.log('DEBUG: No more links to process, checking for next page');
                                checkForNextPage();
                            }
                        }
                    }, 1000);
                }
            }
        } catch (error) {
            console.log('DEBUG: Error loading persisted state:', error);
            clearPersistedState();
        }
    }
    
    // Save state to sessionStorage
    function savePersistedState() {
        try {
            const state = {
                isAutoClickingEnabled,
                currentIndex,
                timestamp: Date.now()
            };
            sessionStorage.setItem(PERSISTENCE_KEY, JSON.stringify(state));
        } catch (error) {
            console.log('DEBUG: Error saving persisted state:', error);
        }
    }
    
    // Clear persisted state
    function clearPersistedState() {
        try {
            sessionStorage.removeItem(PERSISTENCE_KEY);
        } catch (error) {
            console.log('DEBUG: Error clearing persisted state:', error);
        }
    }

    // Function to find all document links
    function findDocumentLinks() {
        console.log(`[${instanceId}] Method 1 - Looking for document links with OpenImageViewerConf...`);
        const method1Links = Array.from(document.querySelectorAll('a.dcoLink[href*="OpenImageViewerConf"]'));
        console.log(`[${instanceId}] Method 1 - Found document links with OpenImageViewerConf: ${method1Links.length}`);

        // If method 1 found links, use those
        if (method1Links.length > 0) {
            // Extract document info for each link
            method1Links.forEach(link => {
                const docInfo = extractDocumentInfo(link);
                link.documentNumber = docInfo.number;
                link.documentTitle = docInfo.title;
            });
            
            console.log(`[${instanceId}] Final links found: ${method1Links.length} total`);
            return method1Links;
        }

        // Fallback methods if needed
        console.log('Method 1 found no links, trying fallback methods...');
        
        const fallbackLinks = Array.from(document.querySelectorAll('a[href*="javascript:"]'))
            .filter(link => link.href.includes('OpenImageViewer'));
        
        console.log(`Fallback methods found: ${fallbackLinks.length} total`);
        return fallbackLinks;
    }

    // Function to extract document number and title from the link's parent row
    function extractDocumentInfo(link) {
        try {
            // Navigate up to find the table row containing this link
            let currentElement = link;
            let tableRow = null;
            
            // Go up the DOM tree to find the table row
            while (currentElement && currentElement.tagName !== 'TR') {
                currentElement = currentElement.parentElement;
                if (!currentElement) break;
            }
            
            tableRow = currentElement;
            
            if (tableRow) {
                // Look for cells in this row
                const cells = tableRow.querySelectorAll('td');
                
                // Usually the document number is in the first cell and title in another cell
                let documentNumber = 'unknown';
                let documentTitle = 'document';
                
                // Try to find document number (usually a numeric value)
                for (let cell of cells) {
                    const cellText = cell.textContent.trim();
                    // Look for a pattern that looks like a document number (digits)
                    if (/^\d{8,}$/.test(cellText)) {
                        documentNumber = cellText;
                        break;
                    }
                }
                
                // Try to find document title (usually longer text)
                for (let cell of cells) {
                    const cellText = cell.textContent.trim();
                    // Skip cells that are just the document number or very short
                    if (cellText.length > 10 && cellText !== documentNumber && !cellText.match(/^\d+$/)) {
                        documentTitle = cellText;
                        break;
                    }
                }
                
                console.log('DEBUG: Extracted document info:', {number: documentNumber, title: documentTitle});
                return {number: documentNumber, title: documentTitle};
            }
        } catch (error) {
            console.log('DEBUG: Error extracting document info:', error);
        }
        
        return {number: 'unknown', title: 'document'};
    }

    // Legacy clickLink function - now replaced by processLinkWithCallback
    // Keeping for any external references but functionality moved to processLinkWithCallback

    // Helper function to simulate click with multiple methods
    function simulateClick(link) {
        console.log('Attempting click simulation...');
        
        // Method 1: Try to manually trigger the href
        if (link.href && link.href.startsWith('javascript:')) {
            console.log('Attempting manual URL navigation');
            try {
                // Extract the function call and parameters
                const jsCode = link.href.substring(11);
                const match = jsCode.match(/(\w+)\('([^']+)',\s*'([^']+)'\)/);
                
                if (match) {
                    const functionName = match[1];
                    const param1 = match[2];
                    const param2 = match[3];
                    
                    console.log('Extracted function:', functionName, 'with params:', param1.substring(0, 20) + '...');
                    
                    // Try to access the function directly from window
                    if (window[functionName] && typeof window[functionName] === 'function') {
                        console.log('Found function, attempting direct call');
                        window[functionName](param1, param2);
                        console.log('Direct function call successful');
                        return;
                    }
                }
            } catch (e) {
                console.log('Manual function call failed:', e);
            }
        }
        
        // Method 2: Enhanced click event
        try {
            // Create a more realistic click event
            const rect = link.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            const event = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window,
                detail: 1,
                screenX: centerX,
                screenY: centerY,
                clientX: centerX,
                clientY: centerY,
                button: 0,
                buttons: 1
            });
            
            const result = link.dispatchEvent(event);
            console.log('Enhanced click event result:', result);
            
        } catch (e) {
            console.log('Enhanced click failed:', e);
            
            // Method 3: Basic click
            try {
                link.click();
                console.log('Basic click executed');
            } catch (e2) {
                console.log('All click methods failed:', e2);
            }
        }
    }

    // Function to extract case number from page header
    function getCaseNumber() {
        try {
            // Look for the page header element that contains the case number
            const headerElement = document.querySelector('#ctl00_ContentPlaceHolder1_labelPageHeader');
            
            if (headerElement) {
                const headerText = headerElement.textContent.trim();
                console.log('Header text:', headerText);
                
                // Extract the case number (first part before the dash)
                // Format is usually like "183715101010 - The State of Texas vs. ..."
                const match = headerText.match(/^(\d+)/);
                if (match) {
                    // Take first 7 digits for folder name
                    const fullNumber = match[1];
                    const caseNumber = fullNumber.substring(0, 7);
                    console.log('Extracted case number:', caseNumber);
                    return caseNumber;
                }
            }
        } catch (error) {
            console.log('Error extracting case number:', error);
        }
        
        return 'unknown_case';
    }

    // Make getCaseNumber available globally for popup access
    window.getCaseNumber = getCaseNumber;

    // Function to start auto-clicking
    function startAutoClicking() {
        documentLinks = findDocumentLinks();
        if (documentLinks.length === 0) {
            console.log('No document links found on this page');
            return;
        }

        console.log(`[${instanceId}] Found ${documentLinks.length} document links`);
        console.log(`[${instanceId}] Processing all document links sequentially with download completion...`);
        console.log(`[${instanceId}] DEBUG: Starting sequential processing at:`, new Date().toISOString());
        
        // Get and send case number to background script
        const caseNumber = getCaseNumber();
        console.log('DEBUG: Sending case number to background script:', caseNumber);
        chrome.runtime.sendMessage({
            action: 'setCaseNumber',
            caseNumber: caseNumber
        }, (response) => {
            console.log('DEBUG: Case number set response:', response);
        });
        
        currentIndex = 0;
        isAutoClickingEnabled = true;
        savePersistedState();

        // Process links sequentially with download completion waiting
        console.log(`DEBUG: Starting sequential processing with download completion waiting`);
        processNextLinkWithWait();
    }

    // Function to process next link and wait for download completion
    function processNextLinkWithWait() {
        if (!isAutoClickingEnabled || currentIndex >= documentLinks.length) {
            console.log(`DEBUG [${new Date().toISOString()}]: Finished processing all document links on current page`);
            
            // Check if there's a next page to process
            checkForNextPage();
            return;
        }

        const link = documentLinks[currentIndex];
        console.log(`DEBUG [${new Date().toISOString()}]: Processing link ${currentIndex + 1}/${documentLinks.length}:`, link.href.substring(0, 100) + '...');
        
        const startTime = Date.now();
        
        // Save state before processing
        savePersistedState();
        
        // Process the link and wait for completion
        processLinkWithCallback(link, (success) => {
            const endTime = Date.now();
            const duration = endTime - startTime;
            console.log(`DEBUG [${new Date().toISOString()}]: Link ${currentIndex + 1} processing completed: ${success} (took ${duration}ms)`);
            currentIndex++;
            savePersistedState();
            
            // Wait 2 seconds before processing next link (rate limiting)
            console.log(`DEBUG [${new Date().toISOString()}]: Waiting 2000ms before next link...`);
            setTimeout(() => {
                processNextLinkWithWait();
            }, 2000);
        });
    }

    // Function to process a single link with callback
    function processLinkWithCallback(link, callback) {
        console.log(`DEBUG [${new Date().toISOString()}]: processLinkWithCallback called for:`, link.href.substring(0, 50) + '...');
        
        if (link.href && link.href.startsWith('javascript:')) {
            console.log(`DEBUG [${new Date().toISOString()}]: Processing JavaScript link`);
            const jsCode = link.href.substring(11);
            const match = jsCode.match(/(\w+)\((.*)\)/s);
            
            if (match) {
                const functionName = match[1];
                const params = match[2];
                console.log(`DEBUG [${new Date().toISOString()}]: Parsed function:`, functionName);
                
                try {
                    // Parse parameters for direct URL construction
                    const paramArray = parseJavaScriptParams(params);
                    console.log(`DEBUG [${new Date().toISOString()}]: Parsed parameters:`, paramArray.length, 'params');
                    
                    if (paramArray.length >= 1) {
                        const baseUrl = 'https://www.hcdistrictclerk.com/Edocs/Public/ViewFilePage.aspx';
                        const fullUrl = `${baseUrl}?${paramArray[0]}`;
                        
                        console.log(`DEBUG [${new Date().toISOString()}]: Constructed URL:`, fullUrl.substring(0, 100) + '...');
                        console.log(`DEBUG [${new Date().toISOString()}]: Sending openPDFTab message with callback`);
                        
                        const messageStartTime = Date.now();
                        
                        // Use background script to manage tab opening and wait for completion
                        console.log(`DEBUG [${new Date().toISOString()}]: Sending document info:`, {
                            documentNumber: link.documentNumber || 'unknown',
                            documentTitle: link.documentTitle || 'document'
                        });
                        
                        chrome.runtime.sendMessage({
                            action: 'openPDFTabWithCallback',
                            url: fullUrl,
                            documentNumber: link.documentNumber || 'unknown',
                            documentTitle: link.documentTitle || 'document'
                        }, (response) => {
                            const messageEndTime = Date.now();
                            const messageDuration = messageEndTime - messageStartTime;
                            
                            if (chrome.runtime.lastError) {
                                console.log(`DEBUG [${new Date().toISOString()}]: Runtime error in openPDFTab response (after ${messageDuration}ms):`, chrome.runtime.lastError.message);
                                callback(false);
                            } else if (response && response.success) {
                                if (response.skipped) {
                                    console.log(`DEBUG [${new Date().toISOString()}]: PDF download skipped (after ${messageDuration}ms) - ${response.reason}: ${response.filename}`);
                                    callback(true); // Consider skipped downloads as successful
                                } else {
                                    console.log(`DEBUG [${new Date().toISOString()}]: PDF tab processing completed (after ${messageDuration}ms):`, response.downloadSuccess);
                                    callback(response.downloadSuccess);
                                }
                            } else {
                                console.log(`DEBUG [${new Date().toISOString()}]: Failed to open PDF tab (after ${messageDuration}ms):`, response?.error);
                                callback(false);
                            }
                        });
                    } else {
                        console.log(`DEBUG [${new Date().toISOString()}]: Could not extract parameters from link`);
                        callback(false);
                    }
                } catch (error) {
                    console.log(`DEBUG [${new Date().toISOString()}]: Error processing link:`, error);
                    callback(false);
                }
            } else {
                console.log(`DEBUG [${new Date().toISOString()}]: Could not parse JavaScript function`);
                callback(false);
            }
        } else {
            console.log(`DEBUG [${new Date().toISOString()}]: Non-JavaScript link, using regular click`);
            link.click();
            callback(true);
        }
        
        console.log(`DEBUG [${new Date().toISOString()}]: processLinkWithCallback completed for:`, link.href.substring(0, 50) + '...');
    }

    // Function to check for next page and continue processing
    function checkForNextPage() {
        if (!isAutoClickingEnabled) {
            console.log(`DEBUG [${new Date().toISOString()}]: Auto-clicking disabled, stopping pagination`);
            stopAutoClicking();
            return;
        }

        const nextButton = findNextPageButton();
        if (nextButton) {
            console.log(`DEBUG [${new Date().toISOString()}]: Found next page button, clicking to go to next page`);
            
            // Set up a listener for page load completion
            setupPageLoadListener(() => {
                console.log(`DEBUG [${new Date().toISOString()}]: Next page loaded, starting document processing`);
                
                // Reset for new page
                documentLinks = findDocumentLinks();
                currentIndex = 0;
                
                if (documentLinks.length > 0) {
                    console.log(`DEBUG [${new Date().toISOString()}]: Found ${documentLinks.length} documents on new page`);
                    processNextLinkWithWait();
                } else {
                    console.log(`DEBUG [${new Date().toISOString()}]: No documents found on new page, stopping`);
                    stopAutoClicking();
                }
            });
            
            // Click the next button
            clickNextPageButton(nextButton);
        } else {
            console.log(`DEBUG [${new Date().toISOString()}]: No next page button found, all pages processed`);
            stopAutoClicking();
        }
    }

    // Function to find the next page button
    function findNextPageButton() {
        // Look for the specific next button pattern
        const nextButtons = document.querySelectorAll('a.PagerHyperlinkStyle[title*="Next"]');
        console.log(`DEBUG [${new Date().toISOString()}]: Found ${nextButtons.length} potential next page buttons`);
        
        for (let button of nextButtons) {
            console.log(`DEBUG [${new Date().toISOString()}]: Next button candidate:`, {
                href: button.href?.substring(0, 50) + '...',
                title: button.title,
                text: button.textContent.trim()
            });
            
            // Check if it's a valid next button (contains "Next" and has doPostBack)
            if (button.title && button.title.toLowerCase().includes('next') && 
                button.href && button.href.includes('__doPostBack')) {
                return button;
            }
        }
        
        // Alternative: look for any pagination link with "»" or "Next"
        const altNextButtons = document.querySelectorAll('a[href*="__doPostBack"]');
        for (let button of altNextButtons) {
            const href = button.href;
            const text = button.textContent.trim();
            
            // Check for various pager patterns and next indicators
            if ((href.includes('pager') || href.includes('Pager')) && 
                (text.includes('»') || text.toLowerCase().includes('next') || button.title?.toLowerCase().includes('next'))) {
                console.log(`DEBUG [${new Date().toISOString()}]: Found alternative next button:`, {
                    text: text,
                    href: href.substring(0, 50) + '...',
                    title: button.title
                });
                return button;
            }
        }
        
        return null;
    }

    // Function to click the next page button
    function clickNextPageButton(button) {
        console.log(`DEBUG [${new Date().toISOString()}]: Clicking next page button:`, button.href);
        
        try {
            // Try to extract and execute the __doPostBack function
            if (button.href && button.href.includes('__doPostBack')) {
                const match = button.href.match(/__doPostBack\('([^']+)',\s*'([^']*)'\)/);
                if (match) {
                    const target = match[1];
                    const argument = match[2];
                    console.log(`DEBUG [${new Date().toISOString()}]: Executing __doPostBack('${target}', '${argument}')`);
                    
                    if (typeof __doPostBack === 'function') {
                        __doPostBack(target, argument);
                        return;
                    }
                }
            }
            
            // Fallback to regular click
            console.log(`DEBUG [${new Date().toISOString()}]: Fallback to regular click`);
            button.click();
            
        } catch (error) {
            console.log(`DEBUG [${new Date().toISOString()}]: Error clicking next page button:`, error);
            // Stop processing if we can't navigate
            stopAutoClicking();
        }
    }

    // Function to set up page load listener
    function setupPageLoadListener(callback) {
        console.log(`DEBUG [${new Date().toISOString()}]: Setting up page load listener`);
        
        let loadCompleted = false;
        const startTime = Date.now();
        
        // Method 1: Listen for DOMContentLoaded
        const domLoadHandler = () => {
            if (!loadCompleted) {
                loadCompleted = true;
                const loadTime = Date.now() - startTime;
                console.log(`DEBUG [${new Date().toISOString()}]: Page load detected via DOMContentLoaded (${loadTime}ms)`);
                document.removeEventListener('DOMContentLoaded', domLoadHandler);
                
                // Wait a bit more for any dynamic content
                setTimeout(callback, 1000);
            }
        };
        
        // Method 2: Polling for content changes
        let lastDocumentCount = documentLinks.length;
        const pollForChanges = () => {
            if (loadCompleted) return;
            
            const currentLinks = findDocumentLinks();
            const currentTime = Date.now();
            
            // Check if document structure has changed or enough time has passed
            if (currentLinks.length !== lastDocumentCount || (currentTime - startTime) > 5000) {
                if (!loadCompleted) {
                    loadCompleted = true;
                    const loadTime = currentTime - startTime;
                    console.log(`DEBUG [${new Date().toISOString()}]: Page load detected via polling (${loadTime}ms, ${currentLinks.length} links)`);
                    callback();
                }
            } else {
                // Continue polling
                setTimeout(pollForChanges, 500);
            }
        };
        
        // Start both methods
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', domLoadHandler);
        } else {
            // Page already loaded, start polling immediately
            setTimeout(pollForChanges, 100);
        }
        
        // Start polling as backup
        setTimeout(pollForChanges, 100);
        
        // Timeout after 10 seconds
        setTimeout(() => {
            if (!loadCompleted) {
                loadCompleted = true;
                console.log(`DEBUG [${new Date().toISOString()}]: Page load timeout after 10 seconds, proceeding anyway`);
                callback();
            }
        }, 10000);
    }

    // Function to process a single link (simplified - no callback needed)
    function processLink(link) {
        console.log('DEBUG: processLink called for:', link.href.substring(0, 50) + '...');
        
        if (link.href && link.href.startsWith('javascript:')) {
            console.log('DEBUG: Processing JavaScript link');
            const jsCode = link.href.substring(11);
            const match = jsCode.match(/(\w+)\((.*)\)/s);
            
            if (match) {
                const functionName = match[1];
                const params = match[2];
                console.log('DEBUG: Parsed function:', functionName);
                
                try {
                    // Parse parameters for direct URL construction
                    const paramArray = parseJavaScriptParams(params);
                    console.log('DEBUG: Parsed parameters:', paramArray.length, 'params');
                    
                    if (paramArray.length >= 1) {
                        const baseUrl = 'https://www.hcdistrictclerk.com/Edocs/Public/ViewFilePage.aspx';
                        const fullUrl = `${baseUrl}?${paramArray[0]}`;
                        
                        console.log('DEBUG: Constructed URL:', fullUrl.substring(0, 100) + '...');
                        console.log('DEBUG: Sending openPDFTab message to background script');
                        
                        // Use background script to manage tab opening (one tab at a time)
                        chrome.runtime.sendMessage({
                            action: 'openPDFTab',
                            url: fullUrl
                        }, (response) => {
                            if (chrome.runtime.lastError) {
                                console.log('DEBUG: Runtime error in openPDFTab response:', chrome.runtime.lastError.message);
                            } else if (response && response.success) {
                                console.log('DEBUG: PDF tab opened successfully:', response.tabId);
                            } else {
                                console.log('DEBUG: Failed to open PDF tab:', response?.error);
                            }
                        });
                    } else {
                        console.log('DEBUG: Could not extract parameters from link');
                    }
                } catch (error) {
                    console.log('DEBUG: Error processing link:', error);
                }
            } else {
                console.log('DEBUG: Could not parse JavaScript function');
            }
        } else {
            console.log('DEBUG: Non-JavaScript link, using regular click');
            link.click();
        }
        
        console.log('DEBUG: processLink completed for:', link.href.substring(0, 50) + '...');
    }

    // Helper function to parse JavaScript parameters
    function parseJavaScriptParams(params) {
        const paramArray = [];
        let current = '';
        let inQuotes = false;
        let quoteChar = '';
        
        for (let i = 0; i < params.length; i++) {
            const char = params[i];
            if ((char === '"' || char === "'") && !inQuotes) {
                inQuotes = true;
                quoteChar = char;
            } else if (char === quoteChar && inQuotes) {
                inQuotes = false;
                quoteChar = '';
            } else if (char === ',' && !inQuotes) {
                paramArray.push(current.trim().replace(/^['"]|['"]$/g, ''));
                current = '';
                continue;
            }
            current += char;
        }
        if (current.trim()) {
            paramArray.push(current.trim().replace(/^['"]|['"]$/g, ''));
        }
        
        return paramArray;
    }

    // Function to stop auto-clicking
    function stopAutoClicking() {
        isAutoClickingEnabled = false;
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
        currentIndex = 0;
        clearPersistedState();
        console.log('Auto-clicking stopped');
    }

    // Manual test function for debugging
    function testDocumentLinks() {
        console.log('=== MANUAL TEST ===');
        const allLinks = document.querySelectorAll('a');
        console.log('Total links on page:', allLinks.length);
        
        const dcoLinks = document.querySelectorAll('a.dcoLink');
        console.log('dcoLink elements:', dcoLinks.length);
        
        const jsLinks = document.querySelectorAll('a[href*="javascript:"]');
        console.log('JavaScript links:', jsLinks.length);
        
        const imageViewerLinks = document.querySelectorAll('a[href*="OpenImageViewer"]');
        console.log('OpenImageViewer links:', imageViewerLinks.length);
        
        // Test pagination
        const nextButton = findNextPageButton();
        console.log('Next page button found:', !!nextButton);
        if (nextButton) {
            console.log('Next button details:', {
                href: nextButton.href,
                title: nextButton.title,
                text: nextButton.textContent.trim()
            });
        }
        
        // Only log summary for debugging
        if (dcoLinks.length > 0) {
            console.log(`Sample dcoLink:`, dcoLinks[0].href.substring(0, 50) + '...');
        }
    }

    // Expose test function globally for manual testing
    window.testDocumentLinks = testDocumentLinks;

    // Listen for messages from popup and background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'startAutoClick') {
            startAutoClicking();
            sendResponse({success: true, count: documentLinks.length});
        } else if (request.action === 'stopAutoClick') {
            stopAutoClicking();
            sendResponse({success: true});
        } else if (request.action === 'getStatus') {
            const links = findDocumentLinks();
            const nextButton = findNextPageButton();
            sendResponse({
                isRunning: isAutoClickingEnabled,
                totalLinks: links.length,
                currentIndex: currentIndex,
                hasNextPage: !!nextButton
            });
        } else if (request.action === 'setDelay') {
            clickDelay = request.delay;
            sendResponse({success: true});
        } else if (request.action === 'getCaseNumber') {
            const caseNumber = getCaseNumber();
            sendResponse({caseNumber: caseNumber});
        } else if (request.action === 'testLinks') {
            testDocumentLinks();
            const links = findDocumentLinks();
            sendResponse({success: true, linksFound: links.length});
        } else if (request.action === 'pdfTabOpened') {
            console.log('PDF tab opened notification:', request.tabId);
            sendResponse({success: true});
        } else if (request.action === 'pdfProcessingComplete') {
            console.log('PDF processing complete:', request.success, request.downloadId);
            // No longer need to handle callbacks since we process concurrently
            sendResponse({success: true});
        }
    });

    // Add visual indicator when extension is active
    function addIndicator() {
        if (document.getElementById('hcdc-auto-clicker-indicator')) return;

        const manifest = chrome.runtime.getManifest();
        const indicator = document.createElement('div');
        indicator.id = 'hcdc-auto-clicker-indicator';
        indicator.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: #4CAF50;
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-family: Arial, sans-serif;
            font-size: 12px;
            z-index: 10000;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        `;
        indicator.textContent = `HCDC Auto Clicker Ready v${manifest.version}`;
        document.body.appendChild(indicator);

        // Remove indicator after 3 seconds
        setTimeout(() => {
            if (indicator.parentNode) {
                indicator.parentNode.removeChild(indicator);
            }
        }, 3000);
    }

    // Check if we're on the correct page
    if (!window.location.href.includes('/Edocs/Public/CaseDetails.aspx')) {
        console.log('Not on CaseDetails page, extension inactive');
        return;
    }

    // Initialize when page loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', addIndicator);
    } else {
        addIndicator();
    }

    // Get version from manifest for debugging
    const manifest = chrome.runtime.getManifest();
    const instanceId = Math.random().toString(36).substr(2, 9);
    console.log('🚀 =================================');
    console.log(`🚀 Harris County District Clerk Auto Clicker v${manifest.version} content script loaded on CaseDetails page`);
    console.log('🚀 Extension loaded at:', new Date().toISOString());
    console.log('🚀 SEQUENTIAL WITH DEBUGGING VERSION');
    console.log('🚀 Instance ID:', instanceId);
    console.log('🚀 Current URL:', window.location.href);
    console.log('🚀 =================================');
    
    // Add a global test function to verify version
    window.checkExtensionVersion = function() {
        console.log('✅ Extension Version Check:');
        console.log(`✅ Version: ${manifest.version}`);
        console.log('✅ Processing Mode: SEQUENTIAL WITH PERSISTENCE');
        console.log('✅ Functions available:', {
            findDocumentLinks: typeof findDocumentLinks,
            startAutoClicking: typeof startAutoClicking,
            processLink: typeof processLink
        });
        return `v${manifest.version} - SEQUENTIAL WITH PERSISTENCE`;
    };
    
    // Load persisted state if any exists (disabled for debugging)
    // loadPersistedState();
})(); 