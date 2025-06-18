// Content script for Harris County District Clerk Auto Clicker
(function() {
    'use strict';

    let isAutoClickingEnabled = false;
    let clickDelay = 3000; // 3 seconds delay between clicks to allow for PDF download
    let currentIndex = 0;
    let documentLinks = [];
    let intervalId = null;

    // Function to find all document links
    function findDocumentLinks() {
        // Try multiple selectors
        let links = document.querySelectorAll('a.dcoLink[href*="OpenImageViewerConf"]');
        console.log('Method 1 - Found document links with OpenImageViewerConf:', links.length);
        
        if (links.length === 0) {
            // Try alternative selector
            links = document.querySelectorAll('a.dcoLink[href*="javascript:"]');
            console.log('Method 2 - Found dcoLink with javascript:', links.length);
        }
        
        if (links.length === 0) {
            // Try even broader selector
            links = document.querySelectorAll('a.dcoLink');
            console.log('Method 3 - Found all dcoLink elements:', links.length);
        }
        
        if (links.length === 0) {
            // Try finding any links with document images
            links = document.querySelectorAll('a[href*="OpenImageViewer"]');
            console.log('Method 4 - Found links with OpenImageViewer:', links.length);
        }
        
        console.log('Final links found:', links.length, 'total');
        
        return Array.from(links);
    }

    // Function to click a link
    function clickLink(link) {
        if (link) {
            console.log('About to click link:', link);
            console.log('Link href:', link.href);
            
            // Extract the function call from the JavaScript URL
            if (link.href && link.href.startsWith('javascript:')) {
                const jsCode = link.href.substring(11); // Remove 'javascript:' prefix
                console.log('Executing JavaScript:', jsCode);
                
                // Parse the function call to extract function name and parameters
                console.log('Parsing JavaScript code:', jsCode);
                const match = jsCode.match(/(\w+)\((.*)\)/s); // Added 's' flag for multiline
                console.log('Regex match result:', match);
                
                if (match) {
                    const functionName = match[1];
                    const params = match[2];
                    
                    console.log('Function name:', functionName);
                    console.log('Parameters:', params);
                    
                    try {
                        // Check if the function exists and log debug info
                        console.log('Checking for function:', functionName);
                        console.log('Function exists?', typeof window[functionName]);
                        console.log('All window functions:', Object.keys(window).filter(k => typeof window[k] === 'function').slice(0, 20));
                        console.log('Window object keys containing "OpenImage":', Object.keys(window).filter(k => k.includes('OpenImage')));
                        console.log('Window object keys containing "Image":', Object.keys(window).filter(k => k.includes('Image')));
                        
                        // Also check if there are any JavaScript errors preventing function loading
                        console.log('Testing basic window access...');
                        try {
                            console.log('window.location:', window.location.href);
                            console.log('document.title:', document.title);
                        } catch (e) {
                            console.log('Basic window access failed:', e);
                        }
                        
                        // Try to call the function directly first
                        if (typeof window[functionName] === 'function') {
                            // Parse parameters more carefully
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
                            
                            console.log('Calling function directly with', paramArray.length, 'parameters');
                            window[functionName].apply(window, paramArray);
                            console.log('Direct function call successful');
                            
                        } else {
                            console.log('Function not found:', functionName, '- trying to reconstruct it');
                            
                            // Try to find and execute any scripts that might define the function
                            const scripts = document.querySelectorAll('script');
                            let functionFound = false;
                            
                            for (const script of scripts) {
                                if (script.textContent && script.textContent.includes('OpenImageViewerConf')) {
                                    console.log('Found script containing OpenImageViewerConf');
                                    try {
                                        // Try to extract just the function definition
                                        const functionMatch = script.textContent.match(/function\s+OpenImageViewerConf[^}]+}/);
                                        if (functionMatch) {
                                            console.log('Found function definition, attempting to define it');
                                            // Create the function in a safe way
                                            const funcDef = functionMatch[0];
                                            eval(funcDef); // This should define the function
                                            
                                            if (typeof window[functionName] === 'function') {
                                                console.log('Successfully defined function, calling it');
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
                                                
                                                window[functionName].apply(window, paramArray);
                                                console.log('Function call successful after reconstruction');
                                                functionFound = true;
                                                break;
                                            }
                                        }
                                    } catch (e) {
                                        console.log('Failed to reconstruct function:', e);
                                    }
                                }
                            }
                            
                            if (!functionFound) {
                                console.log('Could not reconstruct function, trying direct navigation');
                                
                                // As a last resort, try to navigate the current window
                                // Extract the parameters and construct a direct URL
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
                                
                                if (paramArray.length >= 1) {
                                    // The ViewFilePage.aspx returns HTML, not PDF directly
                                    // We need to open it in a tab to find the actual PDF URL
                                    const baseUrl = 'https://www.hcdistrictclerk.com/Edocs/Public/ViewFilePage.aspx';
                                    const fullUrl = `${baseUrl}?${paramArray[0]}`;
                                    
                                    console.log('Opening ViewFilePage to extract PDF URL:', fullUrl.substring(0, 100) + '...');
                                    
                                    // Open in new tab so we can extract the actual PDF URL
                                    window.open(fullUrl, '_blank');
                                    console.log('ViewFilePage opened - background script will handle PDF extraction');
                                } else {
                                    throw new Error('Could not extract parameters for direct navigation');
                                }
                            }
                        }
                        
                    } catch (error) {
                        console.log('Direct function call failed:', error);
                        // Fallback to click event
                        simulateClick(link);
                    }
                } else {
                    console.log('Could not parse JavaScript function, trying background script injection');
                    
                    // Send message to background script to inject with higher privileges
                    chrome.runtime.sendMessage({
                        action: 'executeScript',
                        code: jsCode
                    }, (response) => {
                        if (response && response.success) {
                            console.log('Background script execution successful');
                        } else {
                            console.log('Background script execution failed');
                            simulateClick(link);
                        }
                    });
                }
            } else {
                // For non-javascript links, use regular click
                link.click();
                console.log('Regular click executed');
            }
            
            console.log('Processed document link:', link.textContent.trim());
            
        } else {
            console.log('Invalid link:', link);
        }
    }

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
        const headerElement = document.querySelector('#ctl00_ContentPlaceHolder1_labelPageHeader');
        if (headerElement) {
            const headerText = headerElement.textContent.trim();
            console.log('Header text:', headerText);
            
            // Extract the 12-digit number and take first 7 digits
            const match = headerText.match(/(\d{12})/);
            if (match) {
                const fullNumber = match[1];
                const caseNumber = fullNumber.substring(0, 7);
                console.log('Extracted case number:', caseNumber);
                return caseNumber;
            }
        }
        
        console.log('Could not extract case number, using default');
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

        console.log(`Found ${documentLinks.length} document links`);
        console.log('Processing all document links sequentially...');
        
        // Get and send case number to background script
        const caseNumber = getCaseNumber();
        chrome.runtime.sendMessage({
            action: 'setCaseNumber',
            caseNumber: caseNumber
        });
        
        currentIndex = 0;
        isAutoClickingEnabled = true;

        // Start with the first link
        processNextLink();
    }

    // Function to process the next link in sequence
    function processNextLink() {
        if (!isAutoClickingEnabled || currentIndex >= documentLinks.length) {
            console.log('Finished processing all document links');
            stopAutoClicking();
            return;
        }

        const link = documentLinks[currentIndex];
        console.log(`Processing link ${currentIndex + 1}/${documentLinks.length}:`, link.href.substring(0, 100) + '...');
        
        clickLink(link);
        currentIndex++;

        // Wait briefly before processing next link to avoid overwhelming the server
        setTimeout(() => {
            processNextLink();
        }, clickDelay);
    }

    // Function to stop auto-clicking
    function stopAutoClicking() {
        isAutoClickingEnabled = false;
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
        currentIndex = 0;
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
            sendResponse({
                isRunning: isAutoClickingEnabled,
                totalLinks: links.length,
                currentIndex: currentIndex
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
        }
    });

    // Add visual indicator when extension is active
    function addIndicator() {
        if (document.getElementById('hcdc-auto-clicker-indicator')) return;

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
        indicator.textContent = 'HCDC Auto Clicker Ready';
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

    console.log('Harris County District Clerk Auto Clicker content script loaded on CaseDetails page');
})(); 