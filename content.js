// Content script for Harris County District Clerk Auto Clicker
(function() {
    'use strict';

    // Simple state management
    let isRunning = false;
    let currentIndex = 0;
    let documentLinks = [];
    let activeDownloads = 0;
    let maxConcurrentDownloads = 3;
    let clickDelay = 500;

    // Function to find all document links on current page
    function findDocumentLinks() {
        const links = Array.from(document.querySelectorAll('a.dcoLink[href*="OpenImageViewerConf"]'));
        console.log(`Found ${links.length} document links on current page`);
        return links;
    }

    // Function to extract document info from a link
    function extractDocumentInfo(link) {
        let documentNumber = 'unknown';
        let documentTitle = 'document';
        
        try {
            const parentRow = link.closest('tr');
            if (parentRow) {
                const cells = parentRow.querySelectorAll('td');
                
                // Get document number from link text
                const linkText = link.textContent.trim();
                const linkNumberMatch = linkText.match(/\b(\d{8,12})\b/);
                if (linkNumberMatch) {
                    documentNumber = linkNumberMatch[1];
                }
                
                // Get document title from third cell
                if (cells.length >= 3) {
                    const titleCell = cells[2];
                    const divElements = titleCell.querySelectorAll('div[style*="text-align: left"]');
                    if (divElements.length > 0) {
                        const titleParts = [];
                        divElements.forEach(div => {
                            const divText = div.textContent.trim();
                            if (divText && !titleParts.includes(divText)) {
                                titleParts.push(divText);
                            }
                        });
                        documentTitle = titleParts.join(' - ');
                    } else {
                        documentTitle = titleCell.textContent.trim();
                    }
                    
                    documentTitle = documentTitle.replace(/\s+/g, ' ').replace(/\n/g, ' ').trim();
                }
            }
        } catch (error) {
            console.log('Error extracting document info:', error);
        }
        
        return { number: documentNumber, title: documentTitle };
    }

    // Function to get case number from page
    function getCaseNumber() {
        try {
            const headerText = document.querySelector('h1, .header, #header')?.textContent || document.title;
            const match = headerText.match(/(\d{7,})/);
            return match ? match[1].substring(0, 7) : 'unknown';
        } catch (error) {
            return 'unknown';
        }
    }

    // Function to parse JavaScript parameters from link href
    function parseJavaScriptParams(params) {
        const paramArray = [];
        let current = '';
        let inQuotes = false;
        let quoteChar = '';
        
        for (let i = 0; i < params.length; i++) {
            const char = params[i];
            
            if (!inQuotes && (char === '"' || char === "'")) {
                inQuotes = true;
                quoteChar = char;
            } else if (inQuotes && char === quoteChar) {
                inQuotes = false;
                quoteChar = '';
            } else if (!inQuotes && char === ',') {
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
            
            // Set up timeout
            let responseReceived = false;
            const timeoutId = setTimeout(() => {
                if (!responseReceived) {
                    console.log('PDF processing timeout');
                    callback(false);
                }
            }, 30000);
            
            chrome.runtime.sendMessage({
                action: 'openPDFTabWithCallback',
                url: fullUrl,
                documentNumber: docInfo.number,
                documentTitle: docInfo.title
            }, (response) => {
                responseReceived = true;
                clearTimeout(timeoutId);
                
                if (chrome.runtime.lastError) {
                    callback(false);
                } else if (response && response.success) {
                    callback(true);
                } else {
                    callback(false);
                }
            });
        } catch (error) {
            console.log('Error processing document:', error);
            callback(false);
        }
    }

    // Function to process next document
    function processNextDocument() {
        if (!isRunning || currentIndex >= documentLinks.length) {
            // Check if all downloads complete
            if (activeDownloads === 0) {
                goToNextPage();
            }
            return;
        }

        const link = documentLinks[currentIndex];
        currentIndex++;
        activeDownloads++;
        
        console.log(`Processing document ${currentIndex}/${documentLinks.length}`);
        
        processDocument(link, (success) => {
            activeDownloads--;
            console.log(`Document ${currentIndex} completed: ${success}`);
            
            // Start next document if under concurrency limit
            setTimeout(() => {
                if (currentIndex < documentLinks.length && activeDownloads < maxConcurrentDownloads) {
                    processNextDocument();
                } else if (activeDownloads === 0 && currentIndex >= documentLinks.length) {
                    goToNextPage();
                }
            }, clickDelay);
        });
    }

    // Function to find next page button
    function findNextPageButton() {
        const nextButtons = document.querySelectorAll('a.PagerHyperlinkStyle[title*="Next"]');
        for (let button of nextButtons) {
            if (button.title && button.title.toLowerCase().includes('next') && 
                button.href && button.href.includes('__doPostBack')) {
                return button;
            }
        }
        return null;
    }

    // Function to go to next page
    function goToNextPage() {
        if (!isRunning) return;

        const nextButton = findNextPageButton();
        if (nextButton) {
            console.log('Going to next page...');
            
            // Set up page load listener
            let pageLoaded = false;
            const checkForNewPage = () => {
                if (pageLoaded) return;
                
                const newLinks = findDocumentLinks();
                if (newLinks.length > 0) {
                    pageLoaded = true;
                    console.log(`New page loaded with ${newLinks.length} documents`);
                    
                    // Reset for new page
                    documentLinks = newLinks;
                    currentIndex = 0;
                    activeDownloads = 0;
                    
                    // Start processing new page
                    startProcessing();
                } else {
                    setTimeout(checkForNewPage, 500);
                }
            };
            
            // Click next button
            try {
                if (nextButton.href.includes('__doPostBack')) {
                    const match = nextButton.href.match(/__doPostBack\('([^']+)',\s*'([^']*)'\)/);
                    if (match && typeof __doPostBack === 'function') {
                        __doPostBack(match[1], match[2]);
                    } else {
                        nextButton.click();
                    }
                } else {
                    nextButton.click();
                }
                
                setTimeout(checkForNewPage, 1000);
            } catch (error) {
                console.log('Error clicking next page:', error);
                stopProcessing();
            }
        } else {
            console.log('No more pages - processing complete');
            stopProcessing();
        }
    }

    // Function to start processing
    function startProcessing() {
        if (isRunning) return;
        
        console.log('Starting document processing...');
        isRunning = true;
        
        // Send case number to background
        const caseNumber = getCaseNumber();
        chrome.runtime.sendMessage({
            action: 'setCaseNumber',
            caseNumber: caseNumber
        });
        
        // Find documents on current page
        documentLinks = findDocumentLinks();
        if (documentLinks.length === 0) {
            console.log('No documents found');
            stopProcessing();
            return;
        }
        
        currentIndex = 0;
        activeDownloads = 0;
        
        // Start processing documents
        for (let i = 0; i < Math.min(maxConcurrentDownloads, documentLinks.length); i++) {
            processNextDocument();
        }
    }

    // Function to stop processing
    function stopProcessing() {
        isRunning = false;
        activeDownloads = 0;
        currentIndex = 0;
        documentLinks = [];
        console.log('Processing stopped');
    }

    // Performance configuration
    function configurePerformance(options = {}) {
        if (options.maxConcurrent !== undefined) {
            maxConcurrentDownloads = Math.max(1, Math.min(5, options.maxConcurrent));
        }
        if (options.delayMs !== undefined) {
            clickDelay = Math.max(100, Math.min(5000, options.delayMs));
        }
        console.log(`Settings: ${maxConcurrentDownloads} concurrent, ${clickDelay}ms delay`);
        return { maxConcurrent: maxConcurrentDownloads, delayMs: clickDelay };
    }
    window.configurePerformance = configurePerformance;

    // Message listener
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'startAutoClick') {
            startProcessing();
            sendResponse({success: true, count: documentLinks.length});
        } else if (request.action === 'stopAutoClick') {
            stopProcessing();
            sendResponse({success: true});
        } else if (request.action === 'getStatus') {
            const links = isRunning ? documentLinks : findDocumentLinks();
            sendResponse({
                isRunning: isRunning,
                totalLinks: links.length,
                currentIndex: currentIndex,
                hasNextPage: !!findNextPageButton()
            });
        }
    });

    console.log('HCDC Auto Clicker loaded');
})(); 