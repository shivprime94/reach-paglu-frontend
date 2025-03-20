// ReachPaglu content script - runs on X/Twitter and LinkedIn

// Configuration
const API_URL = 'https://reach-paglu-backend.onrender.com'
const CHECK_INTERVAL = 2000; // Check every 2 seconds for account changes (navigation)

// State
let lastCheckedUrl = '';
let warningBanner = null;

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

// Check if an account is flagged as a scammer
async function checkAccount(accountInfo) {
  if (!accountInfo) return null;
  
  try {
    const response = await fetch(`${API_URL}/check/${accountInfo.platform}/${accountInfo.id}`);
    if (response.ok) {
      const data = await response.json();
      return data;
    }
  } catch (error) {
    console.error('Error checking account:', error);
  }
  
  return null;
}

// Create and show warning banner
function showWarningBanner(accountInfo, data) {
  // Remove existing banner if present
  if (warningBanner) {
    warningBanner.remove();
  }
  
  // Create warning element with modern glassmorphism design
  warningBanner = document.createElement('div');
  warningBanner.className = 'reachpaglu-warning';
  warningBanner.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    width: 90%;
    max-width: 600px;
    background: rgba(247, 37, 133, 0.85);
    color: white;
    text-align: center;
    padding: 16px;
    font-size: 16px;
    font-weight: 600;
    z-index: 10000;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-radius: 12px;
    box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.18);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    animation: slideDown 0.5s ease forwards;
  `;
  
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
  `;
  document.head.appendChild(style);
  
  // Create warning text
  const warningText = document.createElement('div');
  warningText.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px;">
      <div style="font-size: 24px; animation: pulse 2s infinite ease-in-out;">⚠️</div>
      <div>
        <strong>WARNING:</strong> This account has been flagged as a potential scammer
        <div style="font-size: 14px; opacity: 0.9; margin-top: 4px;">${data.votes} community reports</div>
      </div>
    </div>
  `;
  
  // Create button container
  const buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = `
    display: flex;
    gap: 10px;
  `;
  
  // Create report button
  const reportButton = document.createElement('button');
  reportButton.innerText = 'Submit Evidence';
  reportButton.style.cssText = `
    background-color: white;
    color: #f72585;
    border: none;
    border-radius: 8px;
    padding: 8px 14px;
    cursor: pointer;
    font-weight: 600;
    font-size: 14px;
    transition: all 0.3s ease;
  `;
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
  const closeButton = document.createElement('button');
  closeButton.innerText = 'Dismiss';
  closeButton.style.cssText = `
    background-color: transparent;
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.5);
    border-radius: 8px;
    padding: 8px 14px;
    cursor: pointer;
    font-weight: 600;
    font-size: 14px;
    transition: all 0.3s ease;
  `;
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
  
  // Add animation for dismissal
  style.textContent += `
    @keyframes slideUp {
      from { transform: translate(-50%, 0); opacity: 1; }
      to { transform: translate(-50%, -20px); opacity: 0; }
    }
  `;
  
  // Add buttons to container
  buttonContainer.appendChild(reportButton);
  buttonContainer.appendChild(closeButton);
  
  // Assemble banner
  warningBanner.appendChild(warningText);
  warningBanner.appendChild(buttonContainer);
  
  // Add to document
  document.body.prepend(warningBanner);
}

// Create a warning badge element
function createWarningBadge() {
  const badge = document.createElement('span');
  badge.className = 'reachpaglu-badge';
  badge.innerHTML = '⚠️ Reported Scammer';
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
async function checkCurrentPage() {
  // Only check if URL changed to avoid constant API calls
  if (window.location.href !== lastCheckedUrl) {
    lastCheckedUrl = window.location.href;
    
    const accountInfo = extractAccountId();
    if (accountInfo) {
      const data = await checkAccount(accountInfo);
      
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

// Initialize and set up periodic checking
function initialize() {
  // Do an initial check
  checkCurrentPage();
  
  // Set up interval to check periodically (handles SPA navigation)
  setInterval(checkCurrentPage, CHECK_INTERVAL);
  initializeBadgeObserver();  // Add this line

  // Listen for manual check requests from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'checkNow') {
      checkCurrentPage();
      sendResponse({success: true});
    }
  });
}

// Start the extension
initialize();
