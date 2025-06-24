// Content script for Harris County District Clerk Auto Clicker
(function() {
    'use strict';

    // Simple state management
    let isRunning = false;
    let currentIndex = 0;
    let documentLinks = [];
    let activeDownloads = 0;
    let maxConcurrentDownloads = 3;
    let baseClickDelay = 500; // Base delay in milliseconds
    let debugMode = false; // Debug mode flag
    
    // Inject page bridge script once per page load
    function ensurePageBridge() {
        if (document.getElementById('hcdc-page-bridge')) return;
        const s = document.createElement('script');
        s.id = 'hcdc-page-bridge';
        s.src = chrome.runtime.getURL('bridge.js');
        (document.documentElement || document.head || document.body).appendChild(s);
    }

    // Ensure bridge is injected ASAP
    ensurePageBridge();
    
    // Track processed documents in this session to prevent duplicates
    let processedDocuments = new Set();
    
    // Track current page to prevent infinite loops
    let currentPageNumber = 1;
    let lastPageChangeTime = 0;

    // Restore running state after page navigation
    const persisted = (() => {
        try { return JSON.parse(sessionStorage.getItem('hcdc_auto_click_state') || 'null'); } catch { return null; }
    })();
    if (persisted && persisted.active) {
        debugMode = !!persisted.debugMode;
        baseClickDelay = persisted.baseClickDelay || baseClickDelay;
        if (debugMode) maxConcurrentDownloads = 1;
        setTimeout(() => startProcessing(), 0); // start once helpers are defined
    }

    // Function to generate random delay between min and max (inclusive)
    function getRandomDelay(baseDelay = baseClickDelay) {
        // Random delay between 50% to 200% of base delay
        const minDelay = Math.floor(baseDelay * 0.5);
        const maxDelay = Math.floor(baseDelay * 2.0);
        const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
        console.log(`Random delay: ${randomDelay}ms (base: ${baseDelay}ms, range: ${minDelay}-${maxDelay}ms)`);
        return randomDelay;
    }

    // Function to generate humanlike random pauses (1-3 seconds)
    function getHumanlikeDelay() {
        const minDelay = 1000; // 1 second
        const maxDelay = 3000; // 3 seconds
        const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
        console.log(`Humanlike delay: ${randomDelay}ms (range: ${minDelay}-${maxDelay}ms)`);
        return randomDelay;
    }

    // Function to generate session key for duplicate checking
    function generateSessionKey(caseNumber, docNumber, docTitle) {
        return `${caseNumber}|${docNumber}|${docTitle}`.toLowerCase();
    }

    // Function to find document links on the page
    function findDocumentLinks() {
        const links = document.querySelectorAll('a.dcoLink[href*="OpenImageViewerConf"]');
        console.log(`Found ${links.length} document links on page`);
        
        if (debugMode && links.length > 0) {
            // In debug mode, only return first and last documents
            const debugLinks = [];
            if (links.length === 1) {
                debugLinks.push(links[0]);
                console.log(`Debug mode: Processing 1 document (only one available)`);
            } else if (links.length >= 2) {
                debugLinks.push(links[0]); // First document
                debugLinks.push(links[links.length - 1]); // Last document
                console.log(`Debug mode: Processing 2 documents (first: ${extractDocumentInfo(links[0]).number}, last: ${extractDocumentInfo(links[links.length - 1]).number})`);
            }
            return Array.from(debugLinks);
        }
        
        return Array.from(links);
    }

    // Function to get case number from the page
    function getCaseNumber() {
        let fullCaseNumber = null;
        
        // Try to find case number in the page title or content
        const titleElement = document.querySelector('span[id*="CaseNumber"]') || 
                            document.querySelector('span[id*="caseNumber"]') ||
                            document.querySelector('.case-number') ||
                            document.querySelector('#caseNumber');
        
        if (titleElement) {
            fullCaseNumber = titleElement.textContent.trim();
        }
        
        // Try to extract from page title
        if (!fullCaseNumber) {
            const pageTitle = document.title;
            const caseMatch = pageTitle.match(/Case.*?(\d{4}-\d+|\d+)/i);
            if (caseMatch) {
                fullCaseNumber = caseMatch[1];
            }
        }
        
        // Try to extract from URL
        if (!fullCaseNumber) {
            const urlMatch = window.location.href.match(/CaseNumber=([^&]+)/i);
            if (urlMatch) {
                fullCaseNumber = decodeURIComponent(urlMatch[1]);
            }
        }
        
        if (!fullCaseNumber) {
            return 'unknown_case';
        }
        
        // Extract first 7 digits only for the download folder
        const digitMatch = fullCaseNumber.match(/\d{7}/);
        if (digitMatch) {
            return digitMatch[0];
        }
        
        // Fallback: extract any digits and take first 7
        const allDigits = fullCaseNumber.replace(/\D/g, '');
        if (allDigits.length >= 7) {
            return allDigits.substring(0, 7);
        }
        
        return fullCaseNumber; // Return original if less than 7 digits
    }

    // Function to extract document information from table row
    function extractDocumentInfo(link) {
        const row = link.closest('tr');
        if (!row) return { number: 'unknown', title: 'document' };
        
        const cells = row.querySelectorAll('td');
        let docNumber = 'unknown';
        let docTitle = 'document';
        
        // First, extract document number from the link text itself (most reliable)
        const linkText = link.textContent.trim();
        const numberMatch = linkText.match(/\d{8,}/); // Look for 8+ digit numbers
        if (numberMatch) {
            docNumber = numberMatch[0];
        } else {
            // Fallback: try to find document number in cells
            for (let i = 0; i < Math.min(3, cells.length); i++) {
                const cellText = cells[i].textContent.trim();
                if (cellText && /^\d{8,}$/.test(cellText)) {
                    docNumber = cellText;
                    break;
                }
            }
        }
        
        // Extract document title from the link's title attribute (most reliable)
        const titleAttr = link.getAttribute('title');
        if (titleAttr && titleAttr.length > 5) {
            // Remove date from title if present (format: "TITLE MM/DD/YYYY")
            docTitle = titleAttr.replace(/\s+\d{2}\/\d{2}\/\d{4}$/, '').trim();
        } else {
            // Fallback: try to find document title in cells
            for (let i = 0; i < cells.length; i++) {
                const cellText = cells[i].textContent.trim();
                // Skip cells with just numbers, images, dates, or javascript
                if (cellText && 
                    cellText.length > 5 && 
                    !cellText.includes('javascript:') && 
                    !cellText.includes('Image') &&
                    !cellText.includes('View') &&
                    !/^\d+$/.test(cellText) &&
                    !/^\d{2}\/\d{2}\/\d{4}$/.test(cellText) &&
                    !cellText.includes('Filing') &&
                    !cellText.includes('Order')) {
                    
                    docTitle = cellText;
                    if (docTitle.length > 10) {
                        break;
                    }
                }
            }
        }
        
        // Clean up the title
        if (docTitle && docTitle !== 'document') {
            docTitle = docTitle
                .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
                .replace(/[<>:"/\\|?*]/g, '_')  // Replace invalid filename characters
                .substring(0, 80)  // Limit length
                .trim();
        }
        
        // If we still don't have a good title, use a generic one
        if (!docTitle || docTitle === 'document' || docTitle.length < 3) {
            docTitle = `Document_${docNumber}`;
        }
        
        console.log(`DEBUG: Extracted document info - Number: "${docNumber}", Title: "${docTitle}"`);
        return { number: docNumber, title: docTitle };
    }

    // Function to parse JavaScript parameters from href
    function parseJavaScriptParams(paramsString) {
        const params = [];
        let current = '';
        let inQuotes = false;
        let quoteChar = '';
        let depth = 0;
        
        for (let i = 0; i < paramsString.length; i++) {
            const char = paramsString[i];
            
            if (!inQuotes && (char === '"' || char === "'")) {
                inQuotes = true;
                quoteChar = char;
                current += char;
            } else if (inQuotes && char === quoteChar) {
                inQuotes = false;
                current += char;
            } else if (!inQuotes && char === '(') {
                depth++;
                current += char;
            } else if (!inQuotes && char === ')') {
                depth--;
                current += char;
            } else if (!inQuotes && char === ',' && depth === 0) {
                params.push(current.trim().replace(/^['"]|['"]$/g, ''));
                current = '';
            } else {
                current += char;
            }
        }
        
        if (current.trim()) {
            params.push(current.trim().replace(/^['"]|['"]$/g, ''));
        }
        
        return params;
    }

    // Function to process a single document
    function processDocument(link, callback) {
        if (!link.href || !link.href.startsWith('javascript:')) {
            callback(false);
            return;
        }

        const jsCode = link.href.substring(11);
        const match = jsCode.match(/(\w+)\((.*)\)/s);
        
        if (!match) {
            callback(false);
            return;
        }

        try {
            const params = match[2];
            const paramArray = parseJavaScriptParams(params);
            
            if (paramArray.length < 1) {
                callback(false);
                return;
            }

            const baseUrl = 'https://www.hcdistrictclerk.com/Edocs/Public/ViewFilePage.aspx';
            const fullUrl = `${baseUrl}?${paramArray[0]}`;
            const docInfo = extractDocumentInfo(link);
            const caseNumber = getCaseNumber();
            
            // Debug logging
            console.log(`DEBUG: Extracted case number: "${caseNumber}"`);
            console.log(`DEBUG: Extracted document info:`, docInfo);
            
            // Check for duplicates using session key
            const sessionKey = generateSessionKey(caseNumber, docInfo.number, docInfo.title);
            console.log(`DEBUG: Generated session key: "${sessionKey}"`);
            
            if (processedDocuments.has(sessionKey)) {
                console.log(`Skipping duplicate document: ${docInfo.number} - ${docInfo.title}`);
                console.log(`DEBUG: Session key found in processedDocuments:`, sessionKey);
                console.log(`DEBUG: All processed documents:`, Array.from(processedDocuments));
                callback(true); // Return true so it's considered "processed successfully"
                return;
            }
            
            // Add to processed documents
            processedDocuments.add(sessionKey);

            console.log(`Processing document ${docInfo.number}: ${docInfo.title}`);
            console.log(`Opening URL: ${fullUrl.substring(0, 100)}...`);

            // Add humanlike pause before processing document
            setTimeout(() => {
                console.log(`DEBUG: Starting document processing after humanlike delay`);
                console.log(`DEBUG: Document info being processed:`, {
                    number: docInfo.number,
                    title: docInfo.title,
                    caseNumber: caseNumber,
                    url: fullUrl.substring(0, 100) + '...'
                });
                
                // Send message to background script to open PDF tab
                console.log(`DEBUG: Sending message to background with:`, {
                    action: 'openPDFTabWithCallback',
                    url: fullUrl,
                    documentNumber: docInfo.number,
                    documentTitle: docInfo.title,
                    caseNumber: caseNumber
                });
                
                chrome.runtime.sendMessage({
                    action: 'openPDFTabWithCallback',
                    url: fullUrl,
                    documentNumber: docInfo.number,
                    documentTitle: docInfo.title,
                    caseNumber: caseNumber
                }, (response) => {
                    console.log(`DEBUG: Received response for document ${docInfo.number}:`, response);
                    
                    if (chrome.runtime.lastError) {
                        console.log(`DEBUG: Chrome runtime error:`, chrome.runtime.lastError);
                        callback(false);
                        return;
                    }
                    
                    if (response && response.success) {
                        console.log(`Successfully processed document ${docInfo.number}: ${response.downloadSuccess ? 'Downloaded' : 'Skipped'}`);
                        if (response.skipped) {
                            console.log(`Document skipped: ${response.reason}`);
                        }
                        callback(response.downloadSuccess || response.skipped);
                    } else {
                        console.log(`Failed to process document ${docInfo.number}: ${response?.error || 'Unknown error'}`);
                        callback(false);
                    }
                });
            }, getHumanlikeDelay());
        } catch (error) {
            console.error('Error processing document:', error);
            callback(false);
        }
    }

    // Function to process next document
    function processNextDocument() {
        if (!isRunning || currentIndex >= documentLinks.length) {
            console.log(`DEBUG: processNextDocument called but not processing - isRunning: ${isRunning}, currentIndex: ${currentIndex}, documentLinks.length: ${documentLinks.length}`);
            return;
        }

        const link = documentLinks[currentIndex];
        const docIndex = currentIndex + 1; // Capture the 1-based index for display
        currentIndex++;
        activeDownloads++;

        console.log(`Processing document ${docIndex}/${documentLinks.length}`);
        
        // Debug: Log document info being processed
        const docInfo = extractDocumentInfo(link);
        console.log(`DEBUG: Document ${docIndex} info:`, docInfo);
        console.log(`DEBUG: Document ${docIndex} link:`, link.href.substring(0, 100) + '...');

        processDocument(link, (success) => {
            activeDownloads--;
            
            if (success) {
                console.log(`Document ${docIndex} processed successfully`);
            } else {
                console.log(`Document ${docIndex} failed to process`);
            }

            // Add humanlike delay before processing next document
            setTimeout(() => {
                if (isRunning && currentIndex < documentLinks.length && activeDownloads < maxConcurrentDownloads) {
                    processNextDocument();
                } else if (isRunning && currentIndex >= documentLinks.length && activeDownloads === 0) {
                    console.log('All documents on current page processed. Checking for next page...');
                    checkForNextPage();
                }
            }, getHumanlikeDelay());
        });
    }

    // Function to navigate to the next results page, if any
    function checkForNextPage() {
        const nextButton = findNextPageButton();
        // Throttle rapid page changes
        const now = Date.now();
        if (now - lastPageChangeTime < 5000) {
            console.log('Preventing rapid page change, waiting...');
            setTimeout(checkForNextPage, 5000 - (now - lastPageChangeTime));
            return;
        }
        if (nextButton && !nextButton.disabled) {
            console.log(`Moving to next page from page ${currentPageNumber}...`);
            const previousUrl = window.location.href;
            const previousDocCount = documentLinks.length;
            lastPageChangeTime = now;
            const targetPageNumber = currentPageNumber + 1;

            // Delay before navigation for humanlike behaviour
            setTimeout(() => {
                console.log('Clicking next page button…');
                const match = nextButton.href ? nextButton.href.match(/__doPostBack\('([^']+)'\,'([^']+)'\)/) : null;
                if (match) {
                    const [, eventTarget, eventArgument] = match;
                    console.log(`Submitting form for postback: target=${eventTarget}, arg=${eventArgument}`);

                    const form = document.forms[0] || document.querySelector('form');
                    if (form) {
                        let et = form.querySelector('input[name="__EVENTTARGET"]');
                        let ea = form.querySelector('input[name="__EVENTARGUMENT"]');
                        if (!et) { et = document.createElement('input'); et.type = 'hidden'; et.name = '__EVENTTARGET'; form.appendChild(et); }
                        if (!ea) { ea = document.createElement('input'); ea.type = 'hidden'; ea.name = '__EVENTARGUMENT'; form.appendChild(ea); }

                        et.value = eventTarget;
                        ea.value = eventArgument;

                        // Prefer async postBack via bridge to keep page context
                        window.postMessage({type:'HCDC_NEXT_PAGE', target:eventTarget, argument:eventArgument}, '*');
                    } else {
                        console.log('Form not found; clicking button instead');
                        nextButton.click();
                    }
                } else {
                    console.log('Could not parse postback; clicking button');
                    nextButton.click();
                }

                setTimeout(() => checkForNewPage(previousUrl, previousDocCount, targetPageNumber), getRandomDelay(3000));
            }, getRandomDelay());
        } else {
            console.log('No next page found, processing complete');
            stopProcessing();
        }
    }

    // Verify that a new page has actually loaded before restarting processing
    function checkForNewPage(previousUrl, previousDocCount, targetPageNumber, retryCount = 0) {
        const currentUrl = window.location.href;
        const newLinks = findDocumentLinks();

        if (currentUrl === previousUrl && newLinks.length === previousDocCount) {
            if (retryCount < 5) {
                console.log(`Page hasn't changed yet, retrying... (${retryCount + 1}/5)`);
                setTimeout(() => checkForNewPage(previousUrl, previousDocCount, targetPageNumber, retryCount + 1), getRandomDelay(1000));
                return;
            } else {
                console.log('Page failed to change after retries, stopping');
                stopProcessing();
                return;
            }
        }

        if (newLinks.length > 0) {
            console.log(`New page loaded with ${newLinks.length} documents`);
            currentPageNumber = targetPageNumber;
            console.log(`Now on page ${currentPageNumber}`);
            processedDocuments.clear();
            documentLinks = newLinks;
            currentIndex = 0;
            activeDownloads = 0;

            console.log(`DEBUG: Starting to process ${Math.min(maxConcurrentDownloads, documentLinks.length)} documents on new page`);
            for (let i = 0; i < Math.min(maxConcurrentDownloads, documentLinks.length); i++) {
                processNextDocument();
            }
        } else {
            if (retryCount < 3) {
                setTimeout(() => checkForNewPage(previousUrl, previousDocCount, targetPageNumber, retryCount + 1), getRandomDelay(500));
            } else {
                console.log('No documents found on new page, stopping');
                stopProcessing();
            }
        }
    }

    // Function to find next page button
    function findNextPageButton() {
        // Look for the specific next page button pattern
        const nextButton = document.querySelector('a.PagerHyperlinkStyle[href*="__doPostBack"][title*="Next"]');
        if (nextButton && !nextButton.disabled) {
            console.log(`Found next page button: ${nextButton.title}`);
            return nextButton;
        }
        
        // Fallback to other common pagination button patterns
        const selectors = [
            'a[href*="Page$"][href*="Next"]',
            'input[type="submit"][name*="Next"]',
            'a[title*="Next"]',
            'a[title*="next"]',
            'input[value*="Next"]',
            'input[value*="next"]',
            'a[href*="__doPostBack"][href*="Next"]',
            'input[name*="ctl00"][value*="Next"]',
            'input[name*="GridView"][value*="Next"]'
        ];
        
        for (const selector of selectors) {
            const button = document.querySelector(selector);
            if (button && !button.disabled) {
                console.log(`Found next page button with selector: ${selector}`);
                return button;
            }
        }
        
        // Also try to find pagination links with ">" symbol
        const paginationLinks = document.querySelectorAll('a[href*="__doPostBack"]');
        for (const link of paginationLinks) {
            if (link.textContent.includes('»') || link.textContent.includes('>') || link.textContent.includes('Next')) {
                console.log(`Found pagination link: ${link.textContent.trim()}`);
                return link;
            }
        }
        
        return null;
    }

    // Function to start processing
    function startProcessing() {
        if (isRunning) return;
        
        console.log('Starting document processing...');
        console.log(`Debug mode: ${debugMode ? 'ENABLED' : 'DISABLED'}`);
        isRunning = true;
        
        // Reset page tracking
        currentPageNumber = 1;
        lastPageChangeTime = 0;
        
        // Clear processed documents for new session
        processedDocuments.clear();
        
        // Send case number to background and clear session downloads
        const caseNumber = getCaseNumber();
        
        // Find documents on current page first
        documentLinks = findDocumentLinks();
        if (documentLinks.length === 0) {
            console.log('No documents found');
            stopProcessing();
            return;
        }
        
        console.log(`Found ${documentLinks.length} documents to process`);
        
        // Debug: Log all documents that will be processed
        documentLinks.forEach((link, index) => {
            const docInfo = extractDocumentInfo(link);
            console.log(`DEBUG: Document ${index + 1} queued - Number: "${docInfo.number}", Title: "${docInfo.title}"`);
        });
        
        currentIndex = 0;
        activeDownloads = 0;
        
        // Clear session downloads BEFORE processing any documents
        chrome.runtime.sendMessage({
            action: 'setCaseNumber',
            caseNumber: caseNumber,
            clearSession: true
        }, (response) => {
            console.log('DEBUG: Session cleared, starting document processing');
            
            // Start processing documents after session is cleared
            console.log(`DEBUG: Starting to process ${Math.min(maxConcurrentDownloads, documentLinks.length)} documents concurrently`);
            
            // Process documents with staggered delays between each
            for (let i = 0; i < Math.min(maxConcurrentDownloads, documentLinks.length); i++) {
                const delay = i * 2000; // 2 second delay between each document start
                setTimeout(() => {
                    console.log(`DEBUG: Starting document ${i + 1} after ${delay}ms delay`);
                    processNextDocument();
                }, delay);
            }

            // Persist state for subsequent navigations
            sessionStorage.setItem('hcdc_auto_click_state', JSON.stringify({active: true, debugMode, baseClickDelay}));
        });
    }

    // Function to stop processing
    function stopProcessing() {
        console.log('Stopping document processing...');
        isRunning = false;
        currentIndex = 0;
        activeDownloads = 0;
        documentLinks = [];

        // Clear persisted state
        sessionStorage.removeItem('hcdc_auto_click_state');
    }

    // Function to test link detection
    function testLinks() {
        const links = findDocumentLinks();
        console.log(`=== LINK DETECTION TEST ===`);
        console.log(`Found ${links.length} document links`);
        
        links.forEach((link, index) => {
            const docInfo = extractDocumentInfo(link);
            console.log(`${index + 1}. Document ${docInfo.number}: ${docInfo.title}`);
            console.log(`   Link: ${link.href.substring(0, 100)}...`);
        });
        
        const nextButton = findNextPageButton();
        console.log(`Next page button: ${nextButton ? 'Found' : 'Not found'}`);
        if (nextButton) {
            console.log(`Next button: ${nextButton.outerHTML.substring(0, 100)}...`);
        }
        
        return { linksFound: links.length, hasNextPage: !!nextButton };
    }

    // Message listener
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'startAutoClick') {
            debugMode = request.debugMode || false;
            // Serial processing in debug mode to avoid tab-closing race conditions
            if (debugMode) maxConcurrentDownloads = 1;
            startProcessing();
            sendResponse({success: true, count: documentLinks.length, debugMode: debugMode});
        } else if (request.action === 'stopAutoClick') {
            stopProcessing();
            sendResponse({success: true});
        } else if (request.action === 'getStatus') {
            const links = isRunning ? documentLinks : findDocumentLinks();
            sendResponse({
                isRunning: isRunning,
                totalLinks: links.length,
                currentIndex: currentIndex,
                hasNextPage: !!findNextPageButton(),
                debugMode: debugMode
            });
        } else if (request.action === 'testLinks') {
            const result = testLinks();
            sendResponse(result);
        } else if (request.action === 'getCaseNumber') {
            sendResponse({caseNumber: getCaseNumber()});
        } else if (request.action === 'setDelay') {
            baseClickDelay = request.delay;
            console.log(`Updated base click delay to ${baseClickDelay}ms`);
            sendResponse({success: true});
        }
    });
    }

    console.log('HCDC Auto Clicker content script loaded');
})(); 