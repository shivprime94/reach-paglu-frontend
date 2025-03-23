// ReachPaglu popup script

// Get URL parameters (for direct report links)
const urlParams = new URLSearchParams(window.location.search);
const isReportMode = urlParams.get('reportMode') === 'true';
const urlPlatform = urlParams.get('platform');
const urlAccountId = urlParams.get('accountId');

// Current account
let currentAccount = null;

// Show the appropriate section based on context with smooth transitions
function showSection(section, elements) {
  const { loadingEl, reportFormEl, accountInfoEl, homeScreenEl } = elements;
  
  // Fade out all sections first
  const sections = [loadingEl, reportFormEl, accountInfoEl, homeScreenEl];
  sections.forEach(el => {
    if (el.style.display !== 'none') {
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px)';
      el.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    }
  });
  
  // After a short delay, hide previous sections and show the new one
  setTimeout(() => {
    loadingEl.style.display = 'none';
    reportFormEl.style.display = 'none';
    accountInfoEl.style.display = 'none';
    homeScreenEl.style.display = 'none';
    
    let targetEl;
    if (section === 'loading') {
      targetEl = loadingEl;
    } else if (section === 'report') {
      targetEl = reportFormEl;
    } else if (section === 'account') {
      targetEl = accountInfoEl;
    } else if (section === 'home') {
      targetEl = homeScreenEl;
    }
    
    if (targetEl) {
      targetEl.style.display = 'block';
      targetEl.style.opacity = '0';
      targetEl.style.transform = 'translateY(10px)';
      
      // Trigger reflow to ensure transition works
      void targetEl.offsetWidth;
      
      // Fade in the new section
      targetEl.style.opacity = '1';
      targetEl.style.transform = 'translateY(0)';
    }
  }, 150);
}

// Initialize the popup based on context and params
async function initializePopup(elements) {
  showSection('loading', elements);
  
  // If URL parameters specify report mode, show the report form
  if (isReportMode) {
    if (urlPlatform && urlAccountId) {
      elements.platformSelect.value = urlPlatform;
      elements.accountIdInput.value = urlAccountId;
    }
    showSection('report', elements);
    return;
  }
  
  // Try to get account info from the active tab
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!activeTab) {
      showSection('home', elements);
      return;
    }
    
    // Check if we're on Twitter or LinkedIn
    const url = activeTab.url || '';
    
    let platform = null;
    let accountId = null;
    
    if (url.includes('twitter.com') || url.includes('x.com')) {
      platform = 'twitter';
      // Extract username from Twitter URL
      const match = url.match(/(?:twitter|x)\.com\/([^/]+)/);
      if (match && match[1] && !['home', 'explore', 'notifications', 'messages', 'i', 'settings'].includes(match[1])) {
        accountId = match[1];
      }
    } else if (url.includes('linkedin.com')) {
      platform = 'linkedin';
      // Extract LinkedIn profile ID
      const inMatch = url.match(/linkedin\.com\/in\/([^/]+)/);
      if (inMatch && inMatch[1]) {
        accountId = inMatch[1];
      }
      
      // LinkedIn company pages
      const companyMatch = url.match(/linkedin\.com\/company\/([^/]+)/);
      if (companyMatch && companyMatch[1]) {
        accountId = `company_${companyMatch[1]}`;
      }
    }
    
    // If we found an account, check its status
    if (platform && accountId) {
      await checkAccount(platform, accountId, false, elements);
      return;
    }
    
    // If no account found, show home screen
    showSection('home', elements);
    
  } catch (error) {
    console.error('Error initializing popup:', error);
    showSection('home', elements);
  }
}

// Check account status with enhanced UI feedback
async function checkAccount(platform, accountId, forceRefresh = false, elements) {
  showSection('loading', elements);
  
  try {
    const fingerprintId = await ensureFingerprint();
    
    // First clear cache if forcing refresh
    if (forceRefresh) {
      await chrome.runtime.sendMessage({
        action: 'clearCache',
        accountKey: `${platform}:${accountId}`
      });
    }
    
    const message = {
      action: 'checkAccount',
      platform,
      accountId,
      fingerprintId // Add fingerprint ID
    };

    const response = await chrome.runtime.sendMessage(message);
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to check account');
    }
    
    // Save current account data
    currentAccount = {
      platform,
      id: accountId,
      ...response.data
    };
    
    // Update UI with enhanced visuals
    elements.accountIdDisplay.textContent = `@${accountId} (${platform === 'twitter' ? 'Twitter/X' : 'LinkedIn'})`;
    
    if (response.data.status === 'scammer') {
      elements.accountStatus.textContent = 'FLAGGED';
      elements.accountStatus.className = 'status danger';
      elements.votesInfo.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle; margin-right: 5px;">
          <path d="M12 9V13M12 17H12.01M7.8 21H16.2C17.8802 21 18.7202 21 19.362 20.673C19.9265 20.3854 20.3854 19.9265 20.673 19.362C21 18.7202 21 17.8802 21 16.2V7.8C21 6.11984 21 5.27976 20.673 4.63803C20.3854 4.07354 19.9265 3.6146 19.362 3.32698C18.7202 3 17.8802 3 16.2 3H7.8C6.11984 3 5.27976 3 4.63803 3.32698C4.07354 3.6146 3.6146 4.07354 3.32698 4.63803C3 5.27976 3 6.11984 3 7.8V16.2C3 17.8802 3 18.7202 3.32698 19.362C3.6146 19.9265 4.07354 20.3854 4.63803 20.673C5.27976 21 6.11984 21 7.8 21Z" stroke="#f72585" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        This account has <strong>${response.data.votes} community reports</strong>
      `;
      elements.scammerWarning.style.display = 'block';
      
      // Disable report button and change text for scammer accounts
      if (elements.reportBtn) {
        elements.reportBtn.textContent = 'Already Flagged';
        elements.reportBtn.disabled = true;
        elements.reportBtn.classList.add('disabled');
        
        // Add tooltip
        elements.reportBtn.title = 'This account is already flagged as a scammer by the community';
      }
    } else {
      elements.accountStatus.textContent = 'SAFE';
      elements.accountStatus.className = 'status success';
      if (response.data.votes > 0) {
        elements.votesInfo.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle; margin-right: 5px;">
            <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="#4cc9f0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          This account has <strong>${response.data.votes} reports</strong>, below the threshold
        `;
      } else {
        elements.votesInfo.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle; margin-right: 5px;">
            <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="#4cc9f0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          No reports found for this account
        `;
      }
      elements.scammerWarning.style.display = 'none';
      
      // Ensure report button is enabled for safe accounts
      if (elements.reportBtn) {
        elements.reportBtn.textContent = 'Report Account';
        elements.reportBtn.disabled = false;
        elements.reportBtn.classList.remove('disabled');
        elements.reportBtn.title = '';
      }
    }
    
    showSection('account', elements);
    
  } catch (error) {
    console.error('Error checking account:', error);
    // Show error in a more user-friendly way
    elements.homeScreenEl.innerHTML = `
      <div class="card" style="border-left: 4px solid #f72585;">
        <h3 style="color: #f72585; margin-bottom: 10px;">Error</h3>
        <p>${error.message || 'Failed to check account'}</p>
        <button id="tryAgainBtn" class="btn primary" style="margin-top: 12px;">Try Again</button>
      </div>
      <div class="manual-check">
        <h3>Check account manually</h3>
        <div class="form-inline">
          <select id="manualPlatform">
            <option value="twitter">Twitter/X</option>
            <option value="linkedin">LinkedIn</option>
          </select>
          <input type="text" id="manualAccountId" placeholder="Username or profile ID">
          <button id="manualCheckBtn" class="btn primary">Check</button>
        </div>
      </div>
    `;
    
    // Re-attach the event listener for the new button
    document.getElementById('tryAgainBtn').addEventListener('click', () => {
      initializePopup(elements);
    });
    
    document.getElementById('manualCheckBtn').addEventListener('click', () => {
      const platform = document.getElementById('manualPlatform').value;
      const accountId = document.getElementById('manualAccountId').value;
      
      if (!accountId) {
        alert('Please enter an account ID');
        return;
      }
      
      checkAccount(platform, accountId, false, elements);
    });
    
    showSection('home', elements);
  }
}

// Generate a unique user token if not already exists
async function ensureUserToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get('userToken', (result) => {
      if (result.userToken) {
        resolve(result.userToken);
      } else {
        // Generate a random token
        const token = Math.random().toString(36).substring(2, 15) + 
                     Math.random().toString(36).substring(2, 15);
        chrome.storage.local.set({ userToken: token }, () => {
          resolve(token);
        });
      }
    });
  });
}

// Check if user has already reported this account
async function hasReportedAccount(platform, accountId) {
  return new Promise((resolve) => {
    const accountKey = `${platform}:${accountId}`;
    chrome.storage.local.get('reportedAccounts', (result) => {
      const reportedAccounts = result.reportedAccounts || [];
      resolve(reportedAccounts.includes(accountKey));
    });
  });
}

// Show a custom notification instead of alert
function showNotification(message, type = 'error') {
  // Create notification container if it doesn't exist
  let notificationContainer = document.getElementById('notification-container');
  
  if (!notificationContainer) {
    notificationContainer = document.createElement('div');
    notificationContainer.id = 'notification-container';
    notificationContainer.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      width: 90%;
      z-index: 1000;
    `;
    document.body.appendChild(notificationContainer);
  }
  
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  
  // Set notification content
  notification.innerHTML = `
    <div class="notification-content">
      <div class="notification-icon">
        ${type === 'error' ? 
          '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 9V13M12 17H12.01M7.8 21H16.2C17.8802 21 18.7202 21 19.362 20.673C19.9265 20.3854 20.3854 19.9265 20.673 19.362C21 18.7202 21 17.8802 21 16.2V7.8C21 6.11984 21 5.27976 20.673 4.63803C20.3854 4.07354 19.9265 3.6146 19.362 3.32698C18.7202 3 17.8802 3 16.2 3H7.8C6.11984 3 5.27976 3 4.63803 3.32698C4.07354 3.6146 3.6146 4.07354 3.32698 4.63803C3 5.27976 3 6.11984 3 7.8V16.2C3 17.8802 3 18.7202 3.32698 19.362C3.6146 19.9265 4.07354 20.3854 4.63803 20.673C5.27976 21 6.11984 21 7.8 21Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' : 
          '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        }
      </div>
      <div class="notification-message">${message}</div>
    </div>
    <button class="notification-close">×</button>
  `;
  
  // Add notification to container
  notificationContainer.appendChild(notification);
  
  // Add animation
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  
  // Set up auto-dismiss
  const dismissTimeout = setTimeout(() => {
    dismissNotification(notification);
  }, 5000);
  
  // Set up close button
  const closeButton = notification.querySelector('.notification-close');
  closeButton.addEventListener('click', () => {
    clearTimeout(dismissTimeout);
    dismissNotification(notification);
  });
  
  return notification;
}

// Dismiss notification with animation
function dismissNotification(notification) {
  notification.classList.remove('show');
  notification.classList.add('hide');
  
  // Remove element after animation completes
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 300);
}

// Mark account as reported by current user
async function markAccountAsReported(platform, accountId) {
  return new Promise((resolve) => {
    const accountKey = `${platform}:${accountId}`;
    chrome.storage.local.get('reportedAccounts', (result) => {
      const reportedAccounts = result.reportedAccounts || [];
      if (!reportedAccounts.includes(accountKey)) {
        reportedAccounts.push(accountKey);
        chrome.storage.local.set({ reportedAccounts }, resolve);
      } else {
        resolve();
      }
    });
  });
}

// Submit a report with improved feedback
async function submitReport(elements) {
  try {
    // Get fingerprint before submitting
    const fingerprintId = await ensureFingerprint();
    if (!fingerprintId) {
      showNotification('Unable to generate unique identifier', 'error');
      return;
    }

    // Validate form
    if (!elements.platformSelect.value) {
      showNotification('Please select a platform');
      return;
    }
    
    if (!elements.accountIdInput.value) {
      showNotification('Please enter an account ID');
      return;
    }
    
    if (!elements.evidenceInput.value) {
      showNotification('Please provide evidence of why this account is suspicious');
      return;
    }
    
    const platform = elements.platformSelect.value;
    const accountId = elements.accountIdInput.value;
    
    // NEW: Check if account is already known to be a scammer
    try {
      const cachedAccount = await chrome.runtime.sendMessage({
        action: 'checkAccount',
        platform,
        accountId,
        checkCacheOnly: true
      });
      
      if (cachedAccount && cachedAccount.success && 
          cachedAccount.data && cachedAccount.data.status === 'scammer') {
        showNotification(
          `This account is already flagged as a scammer with ${cachedAccount.data.votes} reports. No need to report again.`,
          'info'
        );
        
        // Return to appropriate section
        if (currentAccount) {
          showSection('account', elements);
        } else {
          showSection('home', elements);
        }
        return;
      }
    } catch (cacheError) {
      console.warn('Cache check error:', cacheError);
      // Continue with submission even if cache check fails
    }
    
    // Check if already reported - THIS IS THE KEY PART FOR FIXING THE LOADING ANIMATION
    const alreadyReported = await hasReportedAccount(platform, accountId);
    if (alreadyReported) {
      // Use custom notification instead of alert
      showNotification(`You have already reported the account @${accountId}. Each user can only report an account once.`, 'error');
      // Show the appropriate section rather than getting stuck in loading
      if (currentAccount) {
        showSection('account', elements);
      } else {
        showSection('home', elements);
      }
      return;
    }
    
    // Get user token
    const userToken = await ensureUserToken();
    
    // Prepare report data with fingerprint
    const reportData = {
      platform,
      accountId,
      evidence: elements.evidenceInput.value,
      evidenceUrl: elements.evidenceUrlInput.value || null,
      reporterToken: userToken,
      fingerprintId // Add fingerprint ID
    };
    
    // Update button state and show loading indicator
    elements.submitReportBtn.disabled = true;
    elements.submitReportBtn.innerHTML = `
      <svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" stroke-dasharray="30 30" stroke-dashoffset="0">
          <animateTransform attributeName="transform" attributeType="XML" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
        </circle>
      </svg>
      Submitting...
    `;
    
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'submitReport',
        reportData
      });
      
      // After a successful report submission, refresh data for this account
      if (response.success) {
        // Clear the cache for this account to ensure fresh data
        await chrome.runtime.sendMessage({
          action: 'clearCache',
          accountKey: `${platform}:${accountId}`
        });
      }
      
      if (!response.success) {
        // Check if it's a duplicate report error from the server
        if (response.isDuplicate) {
          // Mark the account as reported locally to avoid future attempts
          await markAccountAsReported(platform, accountId);
          
          throw new Error('You have already reported this account');
        }
        throw new Error(response.error || 'Failed to submit report');
      }
      
      // Mark account as reported locally
      await markAccountAsReported(platform, accountId);
      
      // Success message with animation
      elements.reportFormEl.innerHTML = `
        <div class="success-animation">
          <svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
            <circle class="checkmark__circle" cx="26" cy="26" r="25" fill="none" />
            <path class="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
          </svg>
        </div>
        <h2 style="text-align: center; margin: 16px 0;">Report Submitted</h2>
        <p style="text-align: center; margin-bottom: 24px;">Thank you for helping keep the community safe!</p>
        <button id="viewAccountBtn" class="btn primary" style="width: 100%;">View Account Status</button>
      `;
      
      // Add animation styles
      const style = document.createElement('style');
      style.textContent = `
        .success-animation {
          display: flex;
          justify-content: center;
          margin: 20px 0;
        }
        .checkmark {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          display: block;
          stroke-width: 2;
          stroke: #4cc9f0;
          stroke-miterlimit: 10;
          box-shadow: 0 0 0 #4cc9f0;
          animation: fill 0.4s ease-in-out 0.4s forwards, scale 0.3s ease-in-out 0.9s both;
        }
        .checkmark__circle {
          stroke-dasharray: 166;
          stroke-dashoffset: 166;
          stroke-width: 2;
          stroke: #4cc9f0;
          fill: none;
          animation: stroke 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards;
        }
        .checkmark__check {
          transform-origin: 50% 50%;
          stroke-dasharray: 48;
          stroke-dashoffset: 48;
          animation: stroke 0.3s cubic-bezier(0.65, 0, 0.45, 1) 0.8s forwards;
        }
        @keyframes stroke {
          100% { stroke-dashoffset: 0; }
        }
        @keyframes scale {
          0%, 100% { transform: none; }
          50% { transform: scale3d(1.1, 1.1, 1); }
        }
        @keyframes fill {
          100% { box-shadow: inset 0 0 0 80px rgba(76, 201, 240, 0.1); }
        }
      `;
      document.head.appendChild(style);
      
      // Add event listener to view account button
      document.getElementById('viewAccountBtn').addEventListener('click', () => {
        checkAccount(reportData.platform, reportData.accountId, false, elements);
      });
      
      showSection('report', elements);
      
    } catch (error) {
      console.error('Error submitting report:', error);
      
      // Reset button state
      elements.submitReportBtn.disabled = false;
      elements.submitReportBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M5 13L9 17L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Submit Report
      `;
      
      // Show error notification
      showNotification(`Error: ${error.message}`, 'error');
      
      // Show the appropriate section
      if (currentAccount) {
        showSection('account', elements);
      } else {
        showSection('report', elements); // Stay on report form to let user try again
      }
    }
  } catch (error) {
    console.error('Error submitting report:', error);
  }
}

// Initialize the popup
document.addEventListener('DOMContentLoaded', async () => {
  // Get all DOM elements after document is loaded
  const loadingEl = document.getElementById('loading');
  const mainContentEl = document.getElementById('mainContent');
  const reportFormEl = document.getElementById('reportForm');
  const accountInfoEl = document.getElementById('accountInfo');
  const homeScreenEl = document.getElementById('homeScreen');

  // Form elements
  const platformSelect = document.getElementById('platform');
  const accountIdInput = document.getElementById('accountId');
  const evidenceInput = document.getElementById('evidence');
  const evidenceUrlInput = document.getElementById('evidenceUrl');
  const submitReportBtn = document.getElementById('submitReportBtn');
  const cancelReportBtn = document.getElementById('cancelReportBtn');

  // Account info elements
  const accountIdDisplay = document.getElementById('accountIdDisplay');
  const accountStatus = document.getElementById('accountStatus');
  const votesInfo = document.getElementById('votesInfo');
  const scammerWarning = document.getElementById('scammerWarning');
  const reportBtn = document.getElementById('reportBtn');
  const checkAgainBtn = document.getElementById('checkAgainBtn');

  // Home screen elements
  const manualPlatformSelect = document.getElementById('manualPlatform');
  const manualAccountIdInput = document.getElementById('manualAccountId');
  const manualCheckBtn = document.getElementById('manualCheckBtn');
  const reportNewBtn = document.getElementById('reportNewBtn');
  
  // Create an elements object to pass to functions
  const elements = {
    loadingEl,
    mainContentEl,
    reportFormEl,
    accountInfoEl,
    homeScreenEl,
    platformSelect,
    accountIdInput,
    evidenceInput,
    evidenceUrlInput,
    submitReportBtn,
    cancelReportBtn,
    accountIdDisplay,
    accountStatus,
    votesInfo,
    scammerWarning,
    reportBtn,
    checkAgainBtn,
    manualPlatformSelect,
    manualAccountIdInput,
    manualCheckBtn,
    reportNewBtn
  };
  
  // Setup event listeners, with null checks to prevent errors
  if (elements.reportBtn) {
    elements.reportBtn.addEventListener('click', async () => {
      if (currentAccount) {
        // Check if already reported before showing the form
        const alreadyReported = await hasReportedAccount(currentAccount.platform, currentAccount.id);
        if (alreadyReported) {
          showNotification(`You have already reported the account @${currentAccount.id}. Each user can only report an account once.`, 'error');
          return;
        }
        
        elements.platformSelect.value = currentAccount.platform;
        elements.accountIdInput.value = currentAccount.id;
        showSection('report', elements);
      }
    });
  }

  if (elements.submitReportBtn) {
    elements.submitReportBtn.addEventListener('click', () => {
      submitReport(elements);
    });
  }

  if (elements.cancelReportBtn) {
    elements.cancelReportBtn.addEventListener('click', () => {
      if (currentAccount) {
        elements.platformSelect.value = currentAccount.platform;
        elements.accountIdInput.value = currentAccount.id;
        checkAccount(currentAccount.platform, currentAccount.id, false, elements);
        showSection('account', elements);
        elements.evidenceInput.value = '';
        elements.evidenceUrlInput.value = '';
      } else {
        showSection('home', elements);
      }
    });
  }

  if (elements.reportNewBtn) {
    elements.reportNewBtn.addEventListener('click', () => {
      elements.platformSelect.value = 'twitter';
      elements.accountIdInput.value = '';
      elements.evidenceInput.value = '';
      elements.evidenceUrlInput.value = '';
      showSection('report', elements);
    });
  }

  if (elements.checkAgainBtn) {
    elements.checkAgainBtn.addEventListener('click', () => {
      if (currentAccount) {
        checkAccount(currentAccount.platform, currentAccount.id, true, elements); // true = force refresh
      }
    });
  }

  if (elements.manualCheckBtn) {
    elements.manualCheckBtn.addEventListener('click', () => {
      const platform = elements.manualPlatformSelect.value;
      const accountId = elements.manualAccountIdInput.value;
      
      if (!accountId) {
        alert('Please enter an account ID');
        return;
      }
      
      checkAccount(platform, accountId, false, elements);
    });
  }

  // Add input animations
  const inputs = document.querySelectorAll('input, select, textarea');
  inputs.forEach(input => {
    input.addEventListener('focus', () => {
      input.parentElement.classList.add('focused');
    });
    input.addEventListener('blur', () => {
      input.parentElement.classList.remove('focused');
    });
  });

  // Generate fingerprint in background
  ensureFingerprint().catch(console.error);
  
  // Initialize popup
  initializePopup(elements);
});
