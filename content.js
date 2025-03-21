// ReachPaglu content script - runs on X/Twitter and LinkedIn

// Configuration
const API_URL = 'https://reach-paglu-backend.onrender.com'
const CHECK_INTERVAL = 2000; // Check every 2 seconds for account changes (navigation)
const MAX_RETRIES = 3;       // Maximum number of retries when getting extension context errors
const RETRY_DELAY = 500;     // 500ms between retries

// State
let lastCheckedUrl = '';
let warningBanner = null;

// Helper function to sanitize input strings
function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  // Basic sanitization to prevent XSS
  return input.replace(/[<>]/g, '');
}

// Safely create HTML content
function createSafeHTML(tagName, attributes = {}, textContent = '') {
  const element = document.createElement(tagName);
  
  // Set attributes safely
  Object.keys(attributes).forEach(key => {
    if (key === 'style' && typeof attributes[key] === 'object') {
      // Handle style objects
      Object.keys(attributes[key]).forEach(styleKey => {
        element.style[styleKey] = attributes[key][styleKey];
      });
    } else if (key.startsWith('on')) {
      // Don't allow inline event handlers (security risk)
      console.warn('Inline event handlers not allowed:', key);
    } else {
      // Set regular attributes
      element.setAttribute(key, attributes[key]);
    }
  });
  
  // Set text content safely
  if (textContent) {
    element.textContent = textContent;
  }
  
  return element;
}

// Detect which platform we're on
function detectPlatform() {
  const url = window.location.hostname;
  if (url.includes('twitter.com') || url.includes('x.com')) {
    return 'twitter';
  } else if (url.includes('linkedin.com')) {
    return 'linkedin';
  }
  return null;
}

// Extract account ID based on platform and current page
function extractAccountId() {
  const platform = detectPlatform();
  
  if (platform === 'twitter') {
    // Twitter profile URLs are like: twitter.com/username
    const path = window.location.pathname;
    if (path.split('/').length >= 2) {
      const username = path.split('/')[1];
      // Exclude Twitter internal pages
      if (!username.match(/^(home|explore|notifications|messages|i|settings)$/) && username !== '') {
        return { platform, id: username };
      }
    }
  } else if (platform === 'linkedin') {
    // LinkedIn profile URLs are like: linkedin.com/in/username
    const inMatch = window.location.pathname.match(/\/in\/([^/]+)/);
    if (inMatch && inMatch[1]) {
      return { platform, id: inMatch[1] };
    }
    
    // LinkedIn company pages
    const companyMatch = window.location.pathname.match(/\/company\/([^/]+)/);
    if (companyMatch && companyMatch[1]) {
      return { platform, id: `company_${companyMatch[1]}` };
    }
  }
  
  return null;
}

// Check if an account is flagged as a scammer with retry mechanism
async function checkAccount(accountInfo, forceRefresh = false, retryCount = 0) {
  if (!accountInfo) return null;
  
  try {
    // Sanitize inputs
    const platform = sanitizeInput(accountInfo.platform);
    const id = sanitizeInput(accountInfo.id);
    
    if (!platform || !id) {
      console.error('Invalid account info');
      return null;
    }
    
    // Add forceRefresh flag to message if needed
    const message = {
      action: 'checkAccount',
      platform,
      accountId: id
    };
    
    if (forceRefresh) {
      // If forcing a refresh, first clear the cache for this account
      try {
        await chrome.runtime.sendMessage({
          action: 'clearCache',
          accountKey: `${platform}:${id}`
        });
      } catch (error) {
        console.warn('Cache clearing failed, continuing with check:', error);
        // Continue anyway - non-critical operation
      }
    }
    
    // Wrap message sending in a promise with timeout
    const response = await sendMessageWithTimeout(message);
    
    if (response && response.success) {
      return response.data;
    } else if (response && response.error && response.error.includes('context invalidated')) {
      throw new Error('Extension context invalidated');
    }
    
    return null;
  } catch (error) {
    console.error('Error checking account:', error);
    
    // Implement retry logic for context invalidation
    if (error.message.includes('context invalidated') && retryCount < MAX_RETRIES) {
      console.log(`Retry attempt ${retryCount + 1} for ${accountInfo.platform}:${accountInfo.id}`);
      
      // Wait a bit before retrying to let the extension context stabilize
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      
      // Try a direct API call to the backend as a fallback
      try {
        const data = await fetchAccountDataDirectly(accountInfo.platform, accountInfo.id);
        if (data) return data;
      } catch (directError) {
        console.warn('Direct API call failed:', directError);
        // Continue with retry
      }
      
      return checkAccount(accountInfo, forceRefresh, retryCount + 1);
    }
  }
  
  return null;
}

// Send message with timeout to avoid hanging when context is invalid
function sendMessageWithTimeout(message, timeout = 5000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ success: false, error: 'Message timeout' });
    }, timeout);
    
    try {
      chrome.runtime.sendMessage(message, (response) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          console.warn('Runtime error:', chrome.runtime.lastError);
          resolve({ 
            success: false, 
            error: chrome.runtime.lastError.message || 'Extension context invalidated'
          });
        } else {
          resolve(response || { success: false, error: 'Empty response' });
        }
      });
    } catch (error) {
      clearTimeout(timer);
      console.error('Send message error:', error);
      resolve({ success: false, error: error.message });
    }
  });
}

// Fallback function to fetch data directly from API if extension context fails
async function fetchAccountDataDirectly(platform, accountId) {
  try {
    console.log('Attempting direct API call as fallback');
    const response = await fetch(
      `https://reach-paglu-backend.onrender.com/check/${encodeURIComponent(platform)}/${encodeURIComponent(accountId)}`,
      {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' }
      }
    );
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Direct API call failed:', error);
    throw error;
  }
}

// Create and show warning banner
function showWarningBanner(accountInfo, data) {
  // Remove existing banner if present
  if (warningBanner) {
    warningBanner.remove();
  }
  
  // Create warning element with modern glassmorphism design
  warningBanner = createSafeHTML('div', {
    class: 'reachpaglu-warning',
    style: {
      position: 'fixed',
      top: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      width: '90%',
      maxWidth: '600px',
      background: 'rgba(247, 37, 133, 0.85)',
      color: 'white',
      textAlign: 'center',
      padding: '16px',
      fontSize: '16px',
      fontWeight: '600',
      zIndex: '10000',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderRadius: '12px',
      boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid rgba(255, 255, 255, 0.18)',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, sans-serif',
      animation: 'slideDown 0.5s ease forwards'
    }
  });
  
  // Add animation style
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideDown {
      from { transform: translate(-50%, -20px); opacity: 0; }
      to { transform: translate(-50%, 0); opacity: 1; }
    }
    @keyframes pulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.05); }
      100% { transform: scale(1); }
    }
    @keyframes slideUp {
      from { transform: translate(-50%, 0); opacity: 1; }
      to { transform: translate(-50%, -20px); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
  
  // Create warning text container
  const warningTextContainer = createSafeHTML('div');
  
  // Create warning content
  const warningContent = createSafeHTML('div', {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px'
    }
  });
  
  // Create warning icon
  const warningIcon = createSafeHTML('div', {
    style: {
      fontSize: '24px',
      animation: 'pulse 2s infinite ease-in-out'
    }
  }, '⚠️');
  
  // Create warning message
  const warningMessage = createSafeHTML('div');
  
  // Add strong warning text
  const strongWarning = createSafeHTML('strong', {}, 'WARNING:');
  warningMessage.appendChild(strongWarning);
  warningMessage.appendChild(document.createTextNode(' This account has been flagged as a potential scammer'));
  
  // Add vote count
  const voteCount = createSafeHTML('div', {
    style: {
      fontSize: '14px',
      opacity: '0.9',
      marginTop: '4px'
    }
  }, `${data.votes} community reports`);
  
  warningMessage.appendChild(voteCount);
  
  // Assemble warning content
  warningContent.appendChild(warningIcon);
  warningContent.appendChild(warningMessage);
  warningTextContainer.appendChild(warningContent);
  
  // Create button container
  const buttonContainer = createSafeHTML('div', {
    style: {
      display: 'flex',
      gap: '10px'
    }
  });
  
  // Create report button
  const reportButton = createSafeHTML('button', {
    style: {
      backgroundColor: 'white',
      color: '#f72585',
      border: 'none',
      borderRadius: '8px',
      padding: '8px 14px',
      cursor: 'pointer',
      fontWeight: '600',
      fontSize: '14px',
      transition: 'all 0.3s ease'
    }
  }, 'Submit Evidence');
  
  reportButton.addEventListener('mouseover', () => {
    reportButton.style.transform = 'translateY(-2px)';
    reportButton.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
  });
  
  reportButton.addEventListener('mouseout', () => {
    reportButton.style.transform = 'translateY(0)';
    reportButton.style.boxShadow = 'none';
  });
  
  reportButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      action: 'openReport',
      accountId: accountInfo.id,
      platform: accountInfo.platform
    });
  });
  
  // Create close button
  const closeButton = createSafeHTML('button', {
    style: {
      backgroundColor: 'transparent',
      color: 'white',
      border: '1px solid rgba(255, 255, 255, 0.5)',
      borderRadius: '8px',
      padding: '8px 14px',
      cursor: 'pointer',
      fontWeight: '600',
      fontSize: '14px',
      transition: 'all 0.3s ease'
    }
  }, 'Dismiss');
  
  closeButton.addEventListener('mouseover', () => {
    closeButton.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
  });
  
  closeButton.addEventListener('mouseout', () => {
    closeButton.style.backgroundColor = 'transparent';
  });
  
  closeButton.addEventListener('click', () => {
    warningBanner.style.animation = 'slideUp 0.5s ease forwards';
    setTimeout(() => {
      warningBanner.remove();
      warningBanner = null;
    }, 500);
  });
  
  // Add buttons to container
  buttonContainer.appendChild(reportButton);
  buttonContainer.appendChild(closeButton);
  
  // Assemble banner
  warningBanner.appendChild(warningTextContainer);
  warningBanner.appendChild(buttonContainer);
  
  // Add to document
  document.body.prepend(warningBanner);
}

// Create a warning badge element
function createWarningBadge() {
  const badge = document.createElement('span');
  badge.className = 'reachpaglu-badge';
  badge.innerHTML = '⚠️ Reported as reachpaglu';
  badge.style.cssText = `
    background-color: rgba(247, 37, 133, 0.9);
    color: white;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    margin-left: 6px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    animation: fadeIn 0.3s ease;
  `;

  // Add animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-2px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);

  return badge;
}

// Inject badges for Twitter/X
function injectTwitterBadges(accountInfo, data) {
  if (data.status !== 'scammer') return;

  // Name header on profile page
  const nameHeader = document.querySelector('[data-testid="UserName"]');
  if (nameHeader && !nameHeader.querySelector('.reachpaglu-badge')) {
    nameHeader.appendChild(createWarningBadge());
  }

  // Usernames in tweets and replies
  document.querySelectorAll('[data-testid="User-Name"]').forEach(element => {
    const usernameLink = element.querySelector('a');
    if (usernameLink && !element.querySelector('.reachpaglu-badge')) {
      const username = usernameLink.href.split('/').pop();
      if (username === accountInfo.id) {
        element.appendChild(createWarningBadge());
      }
    }
  });
}

// Inject badges for LinkedIn
function injectLinkedInBadges(accountInfo, data) {
  if (data.status !== 'scammer') return;

  // Profile name on profile page
  const profileName = document.querySelector('.text-heading-xlarge');
  if (profileName && !profileName.querySelector('.reachpaglu-badge')) {
    profileName.appendChild(createWarningBadge());
  }

  // Names in feed posts
  document.querySelectorAll('.feed-shared-actor__name, .update-components-actor__name').forEach(element => {
    if (!element.querySelector('.reachpaglu-badge')) {
      const link = element.closest('a');
      if (link) {
        const href = link.href;
        if (href.includes(`/in/${accountInfo.id}`) || href.includes(`/company/${accountInfo.id.replace('company_', '')}`)) {
          element.appendChild(createWarningBadge());
        }
      }
    }
  });
}

// Main function to check accounts and display warnings
async function checkCurrentPage(forceRefresh = false) {
  try {
    // Only check if URL changed to avoid constant API calls, unless forceRefresh is true
    if (forceRefresh || window.location.href !== lastCheckedUrl) {
      lastCheckedUrl = window.location.href;
      
      const accountInfo = extractAccountId();
      if (accountInfo) {
        const data = await checkAccount(accountInfo, forceRefresh);
        
        if (data && data.status === 'scammer') {
          // Only show warning banner for platforms other than Twitter/X
          if (accountInfo.platform !== 'twitter') {
            showWarningBanner(accountInfo, data);
          }
          
          // Add badge injection based on platform
          if (accountInfo.platform === 'twitter') {
            injectTwitterBadges(accountInfo, data);
          } else if (accountInfo.platform === 'linkedin') {
            injectLinkedInBadges(accountInfo, data);
          }
        } else if (warningBanner) {
          // Remove warning if account is now safe
          warningBanner.remove();
          warningBanner = null;
        }
      }
    }
  } catch (error) {
    console.error('Check page error:', error);
    // Don't throw the error further, just log it
  }
}

// Add MutationObserver to handle dynamically loaded content
function initializeBadgeObserver() {
  const observer = new MutationObserver(async (mutations) => {
    const accountInfo = extractAccountId();
    if (accountInfo) {
      const data = await checkAccount(accountInfo);
      if (data && data.status === 'scammer') {
        if (accountInfo.platform === 'twitter') {
          injectTwitterBadges(accountInfo, data);
        } else if (accountInfo.platform === 'linkedin') {
          injectLinkedInBadges(accountInfo, data);
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Initialize and set up periodic checking with error handling
function initialize() {
  // Do an initial check with error handling
  checkCurrentPage().catch(err => {
    console.warn('Initial page check failed:', err);
  });
  
  // Set up interval to check periodically with error handling
  setInterval(() => {
    checkCurrentPage().catch(err => {
      console.warn('Periodic page check failed:', err);
    });
  }, CHECK_INTERVAL);
  
  initializeBadgeObserver();

  // Listen for manual check requests from popup with force refresh option
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.action === 'checkNow') {
      checkCurrentPage(message.forceRefresh === true)
        .then(() => sendResponse({success: true}))
        .catch(error => {
          console.error('Check now failed:', error);
          sendResponse({success: false, error: error.message});
        });
      return true;
    }
    return false;
  });
}

// Start the extension
initialize();
