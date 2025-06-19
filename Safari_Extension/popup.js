// Popup script for Harris County District Clerk Auto Clicker - Safari Version
document.addEventListener('DOMContentLoaded', function() {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const testBtn = document.getElementById('testBtn');
    const statusText = document.getElementById('statusText');
    const caseNumber = document.getElementById('caseNumber');
    const caseNumberText = document.getElementById('caseNumberText');
    const linkCount = document.getElementById('linkCount');
    const linkCountText = document.getElementById('linkCountText');
    const progress = document.getElementById('progress');
    const progressText = document.getElementById('progressText');
    const delaySlider = document.getElementById('delaySlider');
    const delayDisplay = document.getElementById('delayDisplay');

    let statusInterval;

    // Safari/WebKit compatible API detection
    const runtime = (typeof browser !== 'undefined') ? browser.runtime : chrome.runtime;
    const tabs = (typeof browser !== 'undefined') ? browser.tabs : chrome.tabs;

    // Update delay display
    delaySlider.addEventListener('input', function() {
        const delay = parseFloat(this.value);
        delayDisplay.textContent = delay.toFixed(1) + ' seconds';
        
        // Send delay to content script
        tabs.query({active: true, currentWindow: true}, function(tabsArray) {
            if (tabsArray && tabsArray[0]) {
                const message = {
                    action: 'setDelay',
                    delay: delay * 1000 // Convert to milliseconds
                };
                
                if (tabs.sendMessage) {
                    tabs.sendMessage(tabsArray[0].id, message);
                }
            }
        });
    });

    // Start button click handler
    startBtn.addEventListener('click', function() {
        tabs.query({active: true, currentWindow: true}, function(tabsArray) {
            const tab = tabsArray[0];
            
            // Check if we're on the right page
            if (!tab.url.includes('hcdistrictclerk.com/Edocs/Public/CaseDetails.aspx')) {
                statusText.textContent = 'Not on Case Details page';
                return;
            }

            if (tabs.sendMessage) {
                tabs.sendMessage(tab.id, {action: 'startAutoClick'}, function(response) {
                    if (runtime.lastError) {
                        statusText.textContent = 'Error: ' + runtime.lastError.message;
                        return;
                    }
                    
                    if (response && response.success) {
                        startBtn.disabled = true;
                        stopBtn.disabled = false;
                        statusText.textContent = 'Running';
                        linkCountText.textContent = response.count;
                        linkCount.style.display = 'block';
                        progress.style.display = 'block';
                        
                        // Start status updates
                        startStatusUpdates();
                    } else {
                        statusText.textContent = 'Failed to start';
                    }
                });
            }
        });
    });

    // Stop button click handler
    stopBtn.addEventListener('click', function() {
        tabs.query({active: true, currentWindow: true}, function(tabsArray) {
            if (tabs.sendMessage && tabsArray[0]) {
                tabs.sendMessage(tabsArray[0].id, {action: 'stopAutoClick'}, function(response) {
                    if (response && response.success) {
                        startBtn.disabled = false;
                        stopBtn.disabled = true;
                        statusText.textContent = 'Stopped';
                        progress.style.display = 'none';
                        
                        // Stop status updates
                        stopStatusUpdates();
                    }
                });
            }
        });
    });

    // Test button click handler
    testBtn.addEventListener('click', function() {
        tabs.query({active: true, currentWindow: true}, function(tabsArray) {
            if (tabs.sendMessage && tabsArray[0]) {
                tabs.sendMessage(tabsArray[0].id, {action: 'testLinks'}, function(response) {
                    if (runtime.lastError) {
                        alert('Error: ' + runtime.lastError.message);
                        return;
                    }
                    
                    if (response) {
                        alert(`Test completed! Found ${response.linksFound} document links. Check the browser console (F12) for detailed results.`);
                    } else {
                        alert('No response from content script');
                    }
                });
            }
        });
    });

    // Function to get case number
    function getCaseNumber() {
        tabs.query({active: true, currentWindow: true}, function(tabsArray) {
            if (tabs.sendMessage && tabsArray[0]) {
                tabs.sendMessage(tabsArray[0].id, {action: 'getCaseNumber'}, function(response) {
                    if (response && response.caseNumber) {
                        caseNumberText.textContent = response.caseNumber;
                        caseNumber.style.display = 'block';
                    }
                });
            }
        });
    }

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
        tabs.query({active: true, currentWindow: true}, function(tabsArray) {
            if (tabs.sendMessage && tabsArray[0]) {
                tabs.sendMessage(tabsArray[0].id, {action: 'getStatus'}, function(response) {
                    if (runtime.lastError) {
                        return;
                    }
                    
                    if (response) {
                        if (!response.isRunning) {
                            startBtn.disabled = false;
                            stopBtn.disabled = true;
                            statusText.textContent = 'Completed';
                            stopStatusUpdates();
                        } else {
                            progressText.textContent = response.currentIndex + '/' + response.totalLinks;
                        }
                    }
                });
            }
        });
    }

    // Initial status check
    function checkInitialStatus() {
        tabs.query({active: true, currentWindow: true}, function(tabsArray) {
            const tab = tabsArray[0];
            
            if (!tab.url.includes('hcdistrictclerk.com/Edocs/Public/CaseDetails.aspx')) {
                statusText.textContent = 'Not on Case Details page';
                startBtn.disabled = true;
                return;
            }

            // Get case number
            getCaseNumber();

            if (tabs.sendMessage) {
                tabs.sendMessage(tab.id, {action: 'getStatus'}, function(response) {
                    if (runtime.lastError) {
                        statusText.textContent = 'Extension not loaded';
                        startBtn.disabled = true;
                        return;
                    }
                    
                    if (response) {
                        linkCountText.textContent = response.totalLinks;
                        linkCount.style.display = 'block';
                        
                        if (response.isRunning) {
                            startBtn.disabled = true;
                            stopBtn.disabled = false;
                            statusText.textContent = 'Running';
                            progress.style.display = 'block';
                            progressText.textContent = response.currentIndex + '/' + response.totalLinks;
                            startStatusUpdates();
                        } else {
                            statusText.textContent = 'Ready';
                            startBtn.disabled = false;
                            stopBtn.disabled = true;
                        }
                    } else {
                        statusText.textContent = 'No response from page';
                        startBtn.disabled = true;
                    }
                });
            }
        });
    }

    // Check status when popup opens
    setTimeout(checkInitialStatus, 100);
}); 