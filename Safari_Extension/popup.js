// Popup script for Harris County District Clerk Auto Clicker
document.addEventListener('DOMContentLoaded', function() {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const testBtn = document.getElementById('testBtn');
    const statusText = document.getElementById('statusText');
    const caseNumber = document.getElementById('caseNumber');
    const caseNumberText = document.getElementById('caseNumberText');
    const linkCount = document.getElementById('linkCount');
    const linkCountText = document.getElementById('linkCountText');
    const pagination = document.getElementById('pagination');
    const paginationText = document.getElementById('paginationText');
    const progress = document.getElementById('progress');
    const progressText = document.getElementById('progressText');
    const delaySlider = document.getElementById('delaySlider');
    const delayDisplay = document.getElementById('delayDisplay');
    const versionDisplay = document.getElementById('versionDisplay');
    const debugMode = document.getElementById('debugMode');

    let statusInterval;

    // Load and display version from manifest
    function loadVersion() {
        const manifest = chrome.runtime.getManifest();
        versionDisplay.textContent = `v${manifest.version}`;
    }

    // Load version on popup open
    loadVersion();

    // Update delay display
    delaySlider.addEventListener('input', function() {
        const delay = parseFloat(this.value);
        delayDisplay.textContent = delay.toFixed(1) + ' seconds';
        
        // Send delay to content script
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: 'setDelay',
                delay: delay * 1000 // Convert to milliseconds
            });
        });
    });

    // Start button click handler
    startBtn.addEventListener('click', function() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const tab = tabs[0];
            
            // Check if we're on the right page
            if (!tab.url.includes('hcdistrictclerk.com/Edocs/Public/CaseDetails.aspx')) {
                statusText.textContent = 'Not on Case Details page';
                statusText.className = 'status error';
                return;
            }

            chrome.tabs.sendMessage(tab.id, {
                action: 'startAutoClick',
                debugMode: debugMode.checked
            }, function(response) {
                if (chrome.runtime.lastError) {
                    statusText.textContent = 'Error: ' + chrome.runtime.lastError.message;
                    statusText.className = 'status error';
                    return;
                }
                
                if (response && response.success) {
                    startBtn.disabled = true;
                    stopBtn.disabled = false;
                    statusText.textContent = debugMode.checked ? 'Running (Debug Mode)' : 'Running';
                    statusText.className = 'status running';
                    linkCountText.textContent = response.count;
                    linkCount.style.display = 'block';
                    progress.style.display = 'block';
                    
                    // Start status updates
                    startStatusUpdates();
                } else {
                    statusText.textContent = 'Failed to start';
                    statusText.className = 'status error';
                }
            });
        });
    });

    // Stop button click handler
    stopBtn.addEventListener('click', function() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {action: 'stopAutoClick'}, function(response) {
                if (response && response.success) {
                    startBtn.disabled = false;
                    stopBtn.disabled = true;
                    statusText.textContent = 'Stopped';
                    statusText.className = 'status ready';
                    progress.style.display = 'none';
                    
                    // Stop status updates
                    stopStatusUpdates();
                }
            });
        });
    });

    // Test button click handler
    testBtn.addEventListener('click', function() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {action: 'testLinks'}, function(response) {
                if (chrome.runtime.lastError) {
                    alert('Error: ' + chrome.runtime.lastError.message);
                    return;
                }
                
                if (response) {
                    alert(`Test completed! Found ${response.linksFound} document links. Check the browser console (F12) for detailed results.`);
                } else {
                    alert('No response from content script');
                }
            });
        });
    });

    // Function to start status updates
    function startStatusUpdates() {
        statusInterval = setInterval(updateStatus, 1000);
    }

    // Function to stop status updates
    function stopStatusUpdates() {
        if (statusInterval) {
            clearInterval(statusInterval);
            statusInterval = null;
        }
    }

    // Function to update status
    function updateStatus() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {action: 'getStatus'}, function(response) {
                if (chrome.runtime.lastError) {
                    return;
                }
                
                if (response) {
                    if (!response.isRunning) {
                        startBtn.disabled = false;
                        stopBtn.disabled = true;
                        statusText.textContent = 'Completed';
                        statusText.className = 'status ready';
                        stopStatusUpdates();
                    } else {
                        progressText.textContent = response.currentIndex + '/' + response.totalLinks;
                    }
                }
            });
        });
    }

    // Function to get case number
    function getCaseNumber() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {action: 'getCaseNumber'}, function(response) {
                if (response && response.caseNumber) {
                    caseNumberText.textContent = response.caseNumber;
                    caseNumber.style.display = 'block';
                }
            });
        });
    }

    // Initial status check
    function checkInitialStatus() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const tab = tabs[0];
            
            if (!tab.url.includes('hcdistrictclerk.com/Edocs/Public/CaseDetails.aspx')) {
                statusText.textContent = 'Not on Case Details page';
                statusText.className = 'status error';
                startBtn.disabled = true;
                return;
            }

            // Get case number
            getCaseNumber();

            chrome.tabs.sendMessage(tab.id, {action: 'getStatus'}, function(response) {
                if (chrome.runtime.lastError) {
                    statusText.textContent = 'Extension not loaded';
                    statusText.className = 'status error';
                    startBtn.disabled = true;
                    return;
                }
                
                if (response) {
                    linkCountText.textContent = response.totalLinks;
                    linkCount.style.display = 'block';
                    
                    // Show pagination status
                    if (response.hasNextPage !== undefined) {
                        paginationText.textContent = response.hasNextPage ? 'Multi-page case' : 'Single page';
                        pagination.style.display = 'block';
                    }
                    
                    if (response.isRunning) {
                        startBtn.disabled = true;
                        stopBtn.disabled = false;
                        statusText.textContent = response.debugMode ? 'Running (Debug Mode)' : 'Running';
                        statusText.className = 'status running';
                        progress.style.display = 'block';
                        progressText.textContent = response.currentIndex + '/' + response.totalLinks;
                        startStatusUpdates();
                    } else {
                        statusText.textContent = 'Ready';
                        statusText.className = 'status ready';
                        startBtn.disabled = false;
                        stopBtn.disabled = true;
                    }
                } else {
                    statusText.textContent = 'No response';
                    statusText.className = 'status error';
                }
            });
        });
    }

    // Check initial status when popup opens
    checkInitialStatus();
}); 