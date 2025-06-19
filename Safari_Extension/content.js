// Harris County District Clerk Auto Clicker - Safari Content Script
(function() {
    'use strict';
    
    // Check if we're on the correct page
    if (!window.location.href.includes('/Edocs/Public/CaseDetails.aspx')) {
        console.log('Not on CaseDetails page, extension inactive');
        return;
    }

    // Global variables
    let documentLinks = [];
    let currentIndex = 0;
    let isAutoClickingEnabled = false;
    let intervalId = null;
    let clickDelay = 3000; // Default 3 seconds

    // Function to find document links
    function findDocumentLinks() {
        // Look for links with class 'dcoLink' that contain 'OpenImageViewerConf'
        const links = document.querySelectorAll('a.dcoLink[href*="OpenImageViewerConf"]');
        console.log(`Found ${links.length} document links`);
        return Array.from(links);
    }

    // Function to extract Get parameter from JavaScript URL
    function extractGetParameter(jsUrl) {
        try {
            // Extract the part between single quotes after 'Get='
            const match = jsUrl.match(/Get=([^']+)/);
            if (match) {
                return match[1].trim();
            }
        } catch (e) {
            console.log('Error extracting Get parameter:', e);
        }
        return null;
    }

    // Function to click a document link (Safari-compatible)
    function clickLink(link) {
        console.log('Clicking link:', link.href.substring(0, 100) + '...');
        
        // Extract the Get parameter from the JavaScript URL
        const getParam = extractGetParameter(link.href);
        if (!getParam) {
            console.log('Could not extract Get parameter from link');
            return;
        }

        // Construct the direct URL to ViewFilePage.aspx
        const directUrl = `https://www.hcdistrictclerk.com/Edocs/Public/ViewFilePage.aspx?Get=${getParam}`;
        console.log('Opening direct URL:', directUrl);

        // Open the URL in a new tab (Safari will handle this)
        window.open(directUrl, '_blank');
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
        
        // Get and send case number to background script (Safari compatible)
        const caseNumber = getCaseNumber();
        if (typeof browser !== 'undefined' && browser.runtime) {
            browser.runtime.sendMessage({
                action: 'setCaseNumber',
                caseNumber: caseNumber
            });
        }
        
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

    // Safari-compatible message listener
    if (typeof browser !== 'undefined' && browser.runtime) {
        browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
            handleMessage(request, sendResponse);
            return true; // Keep message channel open
        });
    } else if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            handleMessage(request, sendResponse);
            return true; // Keep message channel open
        });
    }

    function handleMessage(request, sendResponse) {
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
        } else if (request.action === 'getCaseNumber') {
            const caseNumber = getCaseNumber();
            sendResponse({caseNumber: caseNumber});
        } else if (request.action === 'setDelay') {
            clickDelay = request.delay;
            sendResponse({success: true});
        } else if (request.action === 'testLinks') {
            testDocumentLinks();
            const links = findDocumentLinks();
            sendResponse({success: true, linksFound: links.length});
        }
    }

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
        indicator.textContent = 'HCDC Auto Clicker Ready (Safari)';
        document.body.appendChild(indicator);

        // Remove indicator after 3 seconds
        setTimeout(() => {
            if (indicator.parentNode) {
                indicator.parentNode.removeChild(indicator);
            }
        }, 3000);
    }

    // Initialize when page loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', addIndicator);
    } else {
        addIndicator();
    }

    console.log('Harris County District Clerk Auto Clicker content script loaded on CaseDetails page (Safari)');
})(); 