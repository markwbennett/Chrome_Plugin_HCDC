// Content script for Harris County District Clerk Auto Clicker
(function() {
    'use strict';

    // Simple state management
    let isRunning = false;
    let currentIndex = 0;
    let documentLinks = [];
    let activeDownloads = 0;
    let maxConcurrentDownloads = 1; // Reduced from 3 to limit request frequency
    let baseClickDelay = 5000; // Increased from 3000ms to 5 seconds minimum
    let debugMode = false; // Debug mode flag
    
    // Rate limiting system to comply with 25 hits/60s threshold (staying under 20)
    // Tracks all trackable requests to edocs_public_viewfilepage_aspx:
    // - PDF viewer tab creation (document processing)
    // - Page navigation clicks (__doPostBack requests)
    const RATE_LIMIT_WINDOW = 60000; // 60 seconds
    const MAX_REQUESTS_PER_WINDOW = 18; // Stay well under 20 to be safe
    let requestTimestamps = []; // Track all trackable requests
    
    // Loop protection and emergency brakes
    let totalProcessedCount = 0;
    let pageProcessingStartTime = Date.now();
    let emergencyStopTriggered = false;
    const MAX_DOCUMENTS_PER_SESSION = 1000;
    const MAX_PAGE_PROCESSING_TIME = 300000; // 5 minutes per page
    const MAX_PAGES_PER_SESSION = 50;
    const MAX_RETRIES_PER_OPERATION = 3;
    
    let processedDocuments = new Set(); // Track processed document IDs
    let processingDocument = false; // Flag to prevent concurrent document processing
    
    // Track current page to prevent infinite loops
    let currentPageNumber = 1;
    let lastPageChangeTime = 0;

    let cachedNextButton = null;

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

    // Rate limiting functions
    function recordRequest() {
        const now = Date.now();
        requestTimestamps.push(now);
        
        // Clean old timestamps outside the window
        requestTimestamps = requestTimestamps.filter(timestamp => 
            now - timestamp < RATE_LIMIT_WINDOW
        );
        
        console.log(`Rate limit: ${requestTimestamps.length}/${MAX_REQUESTS_PER_WINDOW} requests in last 60s`);
    }
    
    function canMakeRequest() {
        const now = Date.now();
        // Clean old timestamps
        requestTimestamps = requestTimestamps.filter(timestamp => 
            now - timestamp < RATE_LIMIT_WINDOW
        );
        
        const canProceed = requestTimestamps.length < MAX_REQUESTS_PER_WINDOW;
        if (!canProceed) {
            console.log(`Rate limit reached: ${requestTimestamps.length}/${MAX_REQUESTS_PER_WINDOW} requests in last 60s`);
        }
        return canProceed;
    }
    
    function getTimeUntilNextRequest() {
        if (requestTimestamps.length < MAX_REQUESTS_PER_WINDOW) {
            return 0;
        }
        
        const now = Date.now();
        const oldestRequest = Math.min(...requestTimestamps);
        const timeUntilExpiry = RATE_LIMIT_WINDOW - (now - oldestRequest);
        return Math.max(0, timeUntilExpiry);
    }

    // Function to generate random delay between min and max (inclusive)
    function getRandomDelay(baseDelay = baseClickDelay) {
        // Random delay between 100% to 150% of base delay (more conservative)
        const minDelay = baseDelay;
        const maxDelay = Math.floor(baseDelay * 1.5);
        const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
        console.log(`Random delay: ${randomDelay}ms (base: ${baseDelay}ms, range: ${minDelay}-${maxDelay}ms)`);
        return randomDelay;
    }

    // Function to generate humanlike random pauses (3-7 seconds, increased from 1-3)
    function getHumanlikeDelay() {
        const minDelay = 3000; // 3 seconds
        const maxDelay = 7000; // 7 seconds
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

    // Function to extract defendant name from page
    function getDefendantName() {
        // Try various selectors to find defendant name
        const selectors = [
            'span[id*="Defendant"]',
            'span[id*="defendant"]',
            '.defendant-name'
        ];
        
        let defendantName = null;
        
        // Try direct selectors first
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent.trim()) {
                defendantName = element.textContent.trim();
                break;
            }
        }
        
        // If not found, look for patterns in all text elements
        if (!defendantName) {
            const textElements = document.querySelectorAll('td, span, div, p');
            for (const element of textElements) {
                const text = element.textContent.trim();
                if (!text) continue;
                
                // Look for "Defendant: Name" pattern
                const defMatch = text.match(/defendant:\s*(.+)/i);
                if (defMatch) {
                    defendantName = defMatch[1].trim();
                    break;
                }
                
                // Look for "vs. Name" pattern (defendant is usually after "vs.")
                const vsMatch = text.match(/\bvs\.?\s+([A-Za-z\s,.-]+)/i);
                if (vsMatch) {
                    let possibleName = vsMatch[1].trim();
                    // Clean up common suffixes that aren't part of names
                    possibleName = possibleName.replace(/\s*-.*$/, '').trim();
                    possibleName = possibleName.replace(/\s*\|.*$/, '').trim();
                    possibleName = possibleName.replace(/\s*\(.*$/, '').trim();
                    if (possibleName.length > 2) {
                        defendantName = possibleName;
                        break;
                    }
                }
                
                // Look for elements that might contain defendant names
                if (element.textContent.toLowerCase().includes('defendant') && 
                    !element.textContent.toLowerCase().includes('plaintiff')) {
                    // Extract text after "defendant"
                    const afterDefendant = text.match(/defendant[:\s]*([A-Za-z\s,.-]+)/i);
                    if (afterDefendant) {
                        let possibleName = afterDefendant[1].trim();
                        possibleName = possibleName.replace(/\s*-.*$/, '').trim();
                        if (possibleName.length > 2) {
                            defendantName = possibleName;
                            break;
                        }
                    }
                }
            }
        }
        
        // If still not found, try page title
        if (!defendantName) {
            const pageTitle = document.title;
            // Look for "State vs Name" or "v. Name" patterns
            const titleMatch = pageTitle.match(/(?:vs?\.?\s+|v\.?\s+)([^-|]+)/i);
            if (titleMatch) {
                defendantName = titleMatch[1].trim();
            }
        }
        
        if (!defendantName) {
            return 'Unknown, Unknown';
        }
        
        // Parse name into Last, First format
        defendantName = defendantName.replace(/[^\w\s,.-]/g, '').trim(); // Remove special chars
        
        // If already in "Last, First" format, return as is
        if (defendantName.includes(',')) {
            return defendantName;
        }
        
        // If in "First Last" format, convert to "Last, First"
        const nameParts = defendantName.split(/\s+/);
        if (nameParts.length >= 2) {
            const firstName = nameParts.slice(0, -1).join(' ');
            const lastName = nameParts[nameParts.length - 1];
            return `${lastName}, ${firstName}`;
        }
        
        // Single name - treat as last name
        return `${defendantName}, Unknown`;
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
            fullCaseNumber = 'unknown_case';
        }
        
        // Extract first 7 digits only for the case number part
        let caseNumber = fullCaseNumber;
        const digitMatch = fullCaseNumber.match(/\d{7}/);
        if (digitMatch) {
            caseNumber = digitMatch[0];
        } else {
            // Fallback: extract any digits and take first 7
            const allDigits = fullCaseNumber.replace(/\D/g, '');
            if (allDigits.length >= 7) {
                caseNumber = allDigits.substring(0, 7);
            }
        }
        
        // Get defendant name and format folder name
        const defendantName = getDefendantName();
        
        // Return formatted folder name: "{defendant last name}, {defendant first name} {case number}"
        return `${defendantName} ${caseNumber}`;
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

            // Check if document already exists before opening PDF tab
            console.log(`DEBUG: Checking if document ${docInfo.number} already exists...`);
            chrome.runtime.sendMessage({
                action: 'checkDocumentExists',
                documentNumber: docInfo.number
            }, (existsResponse) => {
                if (chrome.runtime.lastError) {
                    console.log(`DEBUG: Chrome runtime error checking document existence:`, chrome.runtime.lastError);
                    // Continue with processing if check fails
                } else if (existsResponse && existsResponse.exists) {
                    console.log(`Document ${docInfo.number} already exists, skipping download:`, existsResponse.existingFiles);
                    callback(true); // Return true so it's considered "processed successfully"
                    return;
                }
                
                console.log(`Document ${docInfo.number} not found locally, proceeding with download...`);
                console.log(`Opening URL: ${fullUrl.substring(0, 100)}...`);

                // Check rate limiting before processing
                function attemptDocumentProcessing() {
                    if (!canMakeRequest()) {
                        const waitTime = getTimeUntilNextRequest();
                        console.log(`Rate limit reached, waiting ${Math.ceil(waitTime/1000)}s before processing document ${docInfo.number}`);
                        setTimeout(attemptDocumentProcessing, waitTime + 1000); // Add 1s buffer
                        return;
                    }
                    
                    recordRequest(); // Record this request
                    
                    console.log(`DEBUG: Starting document processing after rate limit check`);
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
                }
                
                // Add humanlike pause before attempting processing
                setTimeout(attemptDocumentProcessing, getHumanlikeDelay());
            });
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
        currentIndex++; // Increment immediately
        activeDownloads++;
        
        console.log(`Processing document ${docIndex}/${documentLinks.length}`);
        
        // Debug: Log document info being processed
        const docInfo = extractDocumentInfo(link);
        console.log(`DEBUG: Document ${docIndex} info:`, docInfo);
        console.log(`DEBUG: Document ${docIndex} link:`, link.href.substring(0, 100) + '...');

        processDocument(link, (success) => {
            activeDownloads--;
            
            if (success) {
                totalProcessedCount++;
                console.log(`Document ${docIndex} processed successfully`);
            } else {
                console.log(`Document ${docIndex} failed to process`);
            }

            // Process next document sequentially to maintain rate limiting
            if (isRunning && currentIndex < documentLinks.length && activeDownloads < 1) {
                processNextDocument();
            }
            
            // Check for next page when all documents are processed
            if (isRunning && currentIndex >= documentLinks.length && activeDownloads === 0) {
                console.log(`All documents on current page processed (${totalProcessedCount} total). Checking for next page...`);
                setTimeout(checkForNextPage, 1000);
            }
        });
    }

    // Function to navigate to the next results page, if any
    function checkForNextPage() {
        const nextButton = findNextPageButton();
        // Throttle rapid page changes (increased from 5s to 10s)
        const now = Date.now();
        if (now - lastPageChangeTime < 10000) {
            console.log('Preventing rapid page change, waiting...');
            setTimeout(checkForNextPage, 10000 - (now - lastPageChangeTime));
            return;
        }
        
        if (nextButton && !nextButton.disabled) {
            console.log(`Moving to next page from page ${currentPageNumber}...`);
            const previousUrl = window.location.href;
            const previousDocCount = documentLinks.length;
            lastPageChangeTime = now;
            const targetPageNumber = currentPageNumber + 1;

            // Check rate limiting before navigation
            function attemptPageNavigation() {
                if (!canMakeRequest()) {
                    const waitTime = getTimeUntilNextRequest();
                    console.log(`Rate limit reached, waiting ${Math.ceil(waitTime/1000)}s before navigating to next page`);
                    setTimeout(attemptPageNavigation, waitTime + 1000); // Add 1s buffer
                    return;
                }
                
                recordRequest(); // Record this request
                
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

                setTimeout(() => checkForNewPage(previousUrl, previousDocCount, targetPageNumber), getRandomDelay(5000));
            }

            // Delay before navigation for humanlike behaviour (increased delay)
            setTimeout(attemptPageNavigation, getRandomDelay());
        } else {
            console.log('No next page found, processing complete');
            stopProcessing();
        }
    }

    // Verify that a new page has actually loaded before restarting processing
    function checkForNewPage(previousUrl, previousDocCount, targetPageNumber, retryCount = 0) {
        // Emergency brake
        if (checkEmergencyConditions()) {
            triggerEmergencyStop('Emergency conditions met during page check');
            return;
        }
        
        // Prevent infinite retry loops
        if (retryCount >= MAX_RETRIES_PER_OPERATION) {
            console.log(`Max retries (${MAX_RETRIES_PER_OPERATION}) exceeded for page change detection`);
            triggerEmergencyStop('Max retries exceeded');
            return;
        }
        
        const currentUrl = window.location.href;
        const newLinks = findDocumentLinks();

        if (currentUrl === previousUrl && newLinks.length === previousDocCount) {
            if (retryCount < MAX_RETRIES_PER_OPERATION) {
                console.log(`Page hasn't changed yet, retrying... (${retryCount + 1}/${MAX_RETRIES_PER_OPERATION})`);
                setTimeout(() => checkForNewPage(previousUrl, previousDocCount, targetPageNumber, retryCount + 1), 1000);
                return;
            } else {
                console.log(`Page failed to change after ${MAX_RETRIES_PER_OPERATION} retries, stopping`);
                stopProcessing();
                return;
            }
        }

        if (newLinks.length > 0) {
            console.log(`New page loaded with ${newLinks.length} documents (page ${targetPageNumber})`);
            currentPageNumber = targetPageNumber;
            pageProcessingStartTime = Date.now(); // Reset page timer
            console.log(`Now on page ${currentPageNumber} (${totalProcessedCount} documents processed so far)`);
            processedDocuments.clear();
            cachedNextButton = null; // Clear next button cache on new page
            documentLinks = newLinks;
            currentIndex = 0;
            processingDocument = false; // Reset processing flag
            activeDownloads = 0;

            console.log(`DEBUG: Starting to process documents on new page sequentially`);
            // Start processing the first document only
            processNextDocument();
        } else {
            if (retryCount < MAX_RETRIES_PER_OPERATION) {
                setTimeout(() => checkForNewPage(previousUrl, previousDocCount, targetPageNumber, retryCount + 1), 500);
            } else {
                console.log(`No documents found on new page after ${MAX_RETRIES_PER_OPERATION} retries, stopping`);
                stopProcessing();
            }
        }
    }

    // Function to find next page button (cached until page navigation)
    function findNextPageButton() {
        if (cachedNextButton !== null) {
            return cachedNextButton;
        }
        
        // Look for the specific next page button pattern
        const nextButton = document.querySelector('a.PagerHyperlinkStyle[href*="__doPostBack"][title*="Next"]');
        if (nextButton && !nextButton.disabled) {
            console.log(`Found next page button: ${nextButton.title}`);
            cachedNextButton = nextButton;
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
                cachedNextButton = button;
                return button;
            }
        }
        
        // Also try to find pagination links with ">" symbol
        const paginationLinks = document.querySelectorAll('a[href*="__doPostBack"]');
        for (const link of paginationLinks) {
            if (link.textContent.includes('»') || link.textContent.includes('>') || link.textContent.includes('Next')) {
                console.log(`Found pagination link: ${link.textContent.trim()}`);
                cachedNextButton = link;
                return link;
            }
        }
        
        return (cachedNextButton = null);
    }

    // Function to start processing
    function startProcessing() {
        if (isRunning) return;
        
        isRunning = true;
        totalProcessedCount = 0;
        currentPageNumber = 1;
        pageProcessingStartTime = Date.now();
        emergencyStopTriggered = false;
        processingDocument = false; // Initialize processing flag
        
        console.log('HCDC Auto Clicker: Starting document processing...');
        
        // Get case number for folder naming
        const caseNumber = getCaseNumber();
        console.log(`DEBUG: Case number for folder: ${caseNumber}`);
        
        // Find all document links
        documentLinks = findDocumentLinks();
        
        if (documentLinks.length === 0) {
            console.log('No document links found');
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
            
            // Start processing multiple documents concurrently
            console.log(`DEBUG: Starting concurrent document processing with max ${maxConcurrentDownloads} downloads`);
            for (let i = 0; i < Math.min(maxConcurrentDownloads, documentLinks.length); i++) {
                processNextDocument();
            }

            // Persist state for subsequent navigations
            sessionStorage.setItem('hcdc_auto_click_state', JSON.stringify({active: true, debugMode, baseClickDelay}));
        });
    }

    // Function to stop processing
    function stopProcessing() {
        console.log(`Stopping document processing... (processed ${totalProcessedCount} documents total)`);
        isRunning = false;
        currentIndex = 0;
        activeDownloads = 0;
        documentLinks = [];
        pageProcessingStartTime = 0;

        // Update status indicator
        const startBtn = document.getElementById('hcdc-start-btn');
        const stopBtn = document.getElementById('hcdc-stop-btn');
        const statusText = document.getElementById('hcdc-status-text');
        if (startBtn && stopBtn && statusText) {
            startBtn.style.display = 'inline-block';
            stopBtn.style.display = 'none';
            statusText.textContent = `Processing stopped (${totalProcessedCount} documents processed)`;
        }

        // Clear persisted state
        sessionStorage.removeItem('hcdc_auto_click_state');
    }

    // Function to test link detection
    function testLinks() {
        const links = findDocumentLinks();
        console.log(`Found ${links.length} document links:`);
        links.forEach((link, index) => {
            const docInfo = extractDocumentInfo(link);
            console.log(`${index + 1}: Number: "${docInfo.number}", Title: "${docInfo.title}"`);
        });
    }

    // Make functions available globally for testing
    window.startProcessing = startProcessing;
    window.stopProcessing = stopProcessing;
    window.testLinks = testLinks;

    // Check for active auto-click session state on page load
    const savedState = sessionStorage.getItem('hcdc_auto_click_state');
    if (savedState) {
        try {
            const state = JSON.parse(savedState);
            if (state.active) {
                console.log('HCDC Auto Clicker: Detected active session, resuming processing...');
                debugMode = state.debugMode || false;
                baseClickDelay = state.baseClickDelay || 5000;
                maxConcurrentDownloads = debugMode ? 1 : 1; // Keep serial processing
                
                // Small delay to let page settle before resuming
                setTimeout(startProcessing, 2000);
            }
        } catch (e) {
            console.log('HCDC Auto Clicker: Failed to parse saved state:', e);
        }
    }

    // Create and show extension status indicator
    function createStatusIndicator() {
        // Remove any existing indicator
        const existing = document.getElementById('hcdc-extension-indicator');
        if (existing) {
            existing.remove();
        }
        
        // Create status box
        const statusBox = document.createElement('div');
        statusBox.id = 'hcdc-extension-indicator';
        statusBox.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="color: #28a745; font-weight: bold;">●</span>
                                 <span>HCDC Auto Clicker v2.2 - Extension Loaded</span>
                <button id="hcdc-start-btn" style="
                    background: #28a745; 
                    color: white; 
                    border: none; 
                    padding: 4px 8px; 
                    border-radius: 3px; 
                    font-size: 11px;
                    cursor: pointer;
                ">Start Processing</button>
                <button id="hcdc-stop-btn" style="
                    background: #dc3545; 
                    color: white; 
                    border: none; 
                    padding: 4px 8px; 
                    border-radius: 3px; 
                    font-size: 11px;
                    cursor: pointer;
                    display: none;
                ">Stop Processing</button>
                <button id="hcdc-test-btn" style="
                    background: #007bff; 
                    color: white; 
                    border: none; 
                    padding: 4px 8px; 
                    border-radius: 3px; 
                    font-size: 11px;
                    cursor: pointer;
                ">Test Links</button>
                <span id="hcdc-status-text" style="font-size: 11px; color: #666;"></span>
            </div>
        `;
        
        // Style the status box
        statusBox.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: linear-gradient(135deg, #e8f5e8, #f0f8f0);
            border-bottom: 2px solid #28a745;
            padding: 8px 16px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 12px;
            color: #333;
            z-index: 10000;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            animation: slideDown 0.3s ease-out;
        `;
        
        // Add CSS animation
        if (!document.getElementById('hcdc-indicator-styles')) {
            const style = document.createElement('style');
            style.id = 'hcdc-indicator-styles';
            style.textContent = `
                @keyframes slideDown {
                    from { transform: translateY(-100%); }
                    to { transform: translateY(0); }
                }
                
                #hcdc-extension-indicator button:hover {
                    opacity: 0.8;
                }
                
                #hcdc-extension-indicator button:active {
                    transform: scale(0.95);
                }
            `;
            document.head.appendChild(style);
        }
        
        // Insert at the beginning of body
        document.body.insertBefore(statusBox, document.body.firstChild);
        
        // Add button event listeners
        const startBtn = document.getElementById('hcdc-start-btn');
        const stopBtn = document.getElementById('hcdc-stop-btn');
        const testBtn = document.getElementById('hcdc-test-btn');
        const statusText = document.getElementById('hcdc-status-text');
        
        startBtn.addEventListener('click', () => {
            console.log('Starting processing from status indicator...');
            startProcessing();
            startBtn.style.display = 'none';
            stopBtn.style.display = 'inline-block';
            statusText.textContent = 'Processing documents...';
        });
        
        stopBtn.addEventListener('click', () => {
            console.log('Stopping processing from status indicator...');
            stopProcessing();
            startBtn.style.display = 'inline-block';
            stopBtn.style.display = 'none';
            statusText.textContent = 'Processing stopped';
        });
        
        testBtn.addEventListener('click', () => {
            console.log('Testing links from status indicator...');
            testLinks();
            statusText.textContent = 'Link test completed - check console';
        });
        
        // Update status if already running
        if (isRunning) {
            startBtn.style.display = 'none';
            stopBtn.style.display = 'inline-block';
            statusText.textContent = 'Processing documents...';
        } else {
            statusText.textContent = 'Ready to process documents';
        }
        
        console.log('HCDC Auto Clicker status indicator displayed');
    }
    
    // Show status indicator when page loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createStatusIndicator);
    } else {
        createStatusIndicator();
    }

    // Ensure page bridge is loaded for ASP.NET postbacks
    ensurePageBridge();

    function checkEmergencyConditions() {
        const now = Date.now();
        
        // Check document count limit
        if (totalProcessedCount >= MAX_DOCUMENTS_PER_SESSION) {
            console.log(`EMERGENCY STOP: Processed ${totalProcessedCount} documents (limit: ${MAX_DOCUMENTS_PER_SESSION})`);
            return true;
        }
        
        // Removed page processing time check - long time on page does not raise alarm
        
        // Check page count
        if (currentPageNumber > MAX_PAGES_PER_SESSION) {
            console.log(`EMERGENCY STOP: Exceeded ${MAX_PAGES_PER_SESSION} pages`);
            return true;
        }
        
        return false;
    }
    
    function triggerEmergencyStop(reason = 'Unknown') {
        if (emergencyStopTriggered) return;
        emergencyStopTriggered = true;
        console.log(`🚨 EMERGENCY STOP TRIGGERED: ${reason}`);
        stopProcessing();
    }

    // Inject page bridge script once per page load
    function ensurePageBridge() {
        if (document.getElementById('hcdc-page-bridge')) return;
        const s = document.createElement('script');
        s.id = 'hcdc-page-bridge';
        s.src = chrome.runtime.getURL('bridge.js');
        (document.documentElement || document.head || document.body).appendChild(s);
    }

    // Listen for messages from popup and background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log('DEBUG: Content script received message:', request);
        
        try {
            switch (request.action) {
                case 'getStatus':
                    const hasNextPage = findNextPageButton() !== null;
                    sendResponse({
                        isRunning: isRunning,
                        currentIndex: currentIndex,
                        totalLinks: documentLinks.length,
                        hasNextPage: hasNextPage,
                        debugMode: debugMode,
                        totalProcessed: totalProcessedCount,
                        currentPage: currentPageNumber
                    });
                    return true;

                case 'getCaseNumber':
                    const caseNumber = getCaseNumber();
                    sendResponse({
                        caseNumber: caseNumber
                    });
                    return true;

                case 'startAutoClick':
                    debugMode = request.debugMode || false;
                    console.log(`Starting auto-click processing (debug: ${debugMode})`);
                    
                    if (isRunning) {
                        sendResponse({success: false, message: 'Already running'});
                        return true;
                    }
                    
                    const links = findDocumentLinks();
                    if (links.length === 0) {
                        sendResponse({success: false, message: 'No document links found'});
                        return true;
                    }
                    
                    startProcessing();
                    sendResponse({
                        success: true,
                        count: links.length,
                        message: `Started processing ${links.length} documents`
                    });
                    return true;

                case 'stopAutoClick':
                    console.log('Stopping auto-click processing');
                    stopProcessing();
                    sendResponse({
                        success: true,
                        message: 'Processing stopped'
                    });
                    return true;

                case 'testLinks':
                    const testLinks = findDocumentLinks();
                    console.log(`Test: Found ${testLinks.length} document links`);
                    testLinks.forEach((link, index) => {
                        const docInfo = extractDocumentInfo(link);
                        console.log(`${index + 1}: ${docInfo.number} - ${docInfo.title}`);
                    });
                    sendResponse({
                        linksFound: testLinks.length,
                        message: `Found ${testLinks.length} document links`
                    });
                    return true;

                case 'setDelay':
                    baseClickDelay = request.delay || 5000;
                    console.log(`Updated delay to ${baseClickDelay}ms`);
                    sendResponse({success: true});
                    return true;

                case 'pdfProcessingComplete':
                    // Handle completion notification from background script
                    console.log('PDF processing complete notification received');
                    sendResponse({success: true});
                    return true;

                default:
                    console.log('Unknown action:', request.action);
                    sendResponse({success: false, message: 'Unknown action'});
                    return true;
            }
        } catch (error) {
            console.error('Error handling message:', error);
            sendResponse({success: false, message: error.message});
            return true;
        }
    });
})();