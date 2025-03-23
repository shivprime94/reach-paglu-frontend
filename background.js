// Reach Paglu background script
import api from './utils/api.js';
import cache from './utils/cache.js';

// Cache durations
const CACHE_DURATIONS = {
  ACCOUNT_STATUS: {
    SAFE: 5 * 60 * 1000,         // 5 minutes for safe accounts
    SCAMMER: 7 * 24 * 60 * 60 * 1000  // 7 days for scammer accounts
  },
  ACCOUNT_EVIDENCE: 15 * 60 * 1000, // 15 minutes
  REPORTED_ACCOUNT: 24 * 60 * 60 * 1000 // 24 hours
};

// Helper function to sanitize input strings
function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  // Basic sanitization to prevent XSS
  return input.replace(/[<>]/g, '').trim();
}

// Helper function to safely call cache methods with error handling
function safeCache(method, ...args) {
  try {
    if (cache && typeof cache[method] === 'function') {
      return cache[method](...args);
    }
    console.warn(`Cache method ${method} not available`);
    return Promise.resolve(null);
  } catch (error) {
    console.error(`Error calling cache.${method}:`, error);
    return Promise.resolve(null);
  }
}

// Rate limiting for API requests (in-memory)
const rateLimits = {
  lastRequests: {},
  
  // Check if request should be rate limited
  shouldLimit(action, maxPerMinute = 30) {
    const now = Date.now();
    const key = `rateLimit:${action}`;
    const requests = this.lastRequests[key] || [];
    
    // Remove requests older than 1 minute
    const recentRequests = requests.filter(time => now - time < 60000);
    this.lastRequests[key] = recentRequests;
    
    // Check if under the limit
    if (recentRequests.length < maxPerMinute) {
      this.lastRequests[key].push(now);
      return false;
    }
    
    return true;
  }
};

// Listen for messages with improved error handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const asyncOperation = async () => {
    try {
      // Basic message validation
      if (!message || typeof message !== 'object' || !message.action) {
        return {success: false, error: 'Invalid message format'};
      }
      
      // Handle opening report form
      if (message.action === 'openReport') {
        // Validate inputs
        const platform = sanitizeInput(message.platform);
        const accountId = sanitizeInput(message.accountId);
        
        if (!platform || !accountId) {
          return {success: false, error: 'Invalid parameters'};
        }
        
        chrome.tabs.create({
          url: `popup.html?platform=${encodeURIComponent(platform)}&accountId=${encodeURIComponent(accountId)}&reportMode=true`
        });
        return {success: true};
      }
      
      // Handle checking account with rate limiting
      if (message.action === 'checkAccount') {
        // Check rate limit (10 requests per minute)
        if (rateLimits.shouldLimit('checkAccount', 10)) {
          return {success: false, error: 'Rate limit exceeded. Please try again later.'};
        }
        
        // Validate inputs
        const platform = sanitizeInput(message.platform);
        const accountId = sanitizeInput(message.accountId);
        const forceRefresh = !!message.forceRefresh;
        
        if (!platform || !accountId) {
          return {success: false, error: 'Invalid parameters'};
        }
        
        // Check cache first if not forcing refresh
        if (!forceRefresh) {
          const cachedData = await safeCache('getFormatted', 'accountStatus', platform, accountId);
          if (cachedData) {
            return {success: true, data: cachedData, cached: true};
          }
        }
        
        // Fetch from API
        const response = await api.checkAccount(platform, accountId);
        
        // Cache successful response with different durations based on status
        if (response.success) {
          // Determine cache duration based on account status
          const cacheDuration = response.data.status === 'scammer' 
            ? CACHE_DURATIONS.ACCOUNT_STATUS.SCAMMER  // 7 days for scammer accounts
            : CACHE_DURATIONS.ACCOUNT_STATUS.SAFE;    // 5 minutes for safe accounts
            
          await safeCache('setFormatted', 'accountStatus', response.data, cacheDuration, platform, accountId);
        }
        
        return response;
      }
      
      // Handle submitting report with rate limiting
      if (message.action === 'submitReport') {
        // Check rate limit (3 reports per 5 minutes)
        if (rateLimits.shouldLimit('submitReport', 3)) {
          return {success: false, error: 'Rate limit exceeded. Please try again later.'};
        }
        
        // Validate input
        if (!message.reportData || typeof message.reportData !== 'object') {
          return {success: false, error: 'Invalid report data'};
        }
        
        // Sanitize report data
        const reportData = {
          platform: sanitizeInput(message.reportData.platform),
          accountId: sanitizeInput(message.reportData.accountId),
          evidence: sanitizeInput(message.reportData.evidence),
          evidenceUrl: message.reportData.evidenceUrl ? sanitizeInput(message.reportData.evidenceUrl) : null,
          reporterToken: message.reportData.reporterToken ? sanitizeInput(message.reportData.reporterToken) : null,
          fingerprintId: message.reportData.fingerprintId ? sanitizeInput(message.reportData.fingerprintId) : null
        };
        
        // Validate required fields
        if (!reportData.platform || !reportData.accountId || !reportData.evidence) {
          return {success: false, error: 'Missing required fields'};
        }
        
        // Submit report
        const response = await api.submitReport(reportData);
        
        // If successful, invalidate related caches
        if (response.success) {
          await safeCache('removePattern', `accountStatus:${reportData.platform}:${reportData.accountId}`);
          await safeCache('removePattern', `evidence:${reportData.platform}:${reportData.accountId}`);
          
          // Store in reported accounts
          const accountKey = `${reportData.platform}:${reportData.accountId}`;
          await storeReportedAccount(accountKey);
        }
        
        return response;
      }
      
      // Handle getting evidence
      if (message.action === 'getEvidence') {
        // Validate inputs
        const platform = sanitizeInput(message.platform);
        const accountId = sanitizeInput(message.accountId);
        const forceRefresh = !!message.forceRefresh;
        
        if (!platform || !accountId) {
          return {success: false, error: 'Invalid parameters'};
        }
        
        // Check cache first if not forcing refresh
        if (!forceRefresh) {
          const cachedData = await safeCache('getFormatted', 'evidence', platform, accountId);
          if (cachedData) {
            return {success: true, data: cachedData, cached: true};
          }
        }
        
        // Fetch from API
        const response = await api.getEvidence(platform, accountId);
        
        // Cache successful response
        if (response.success) {
          await safeCache('setFormatted', 'evidence', response.data, CACHE_DURATIONS.ACCOUNT_EVIDENCE, platform, accountId);
        }
        
        return response;
      }
      
      // Handle clearing cache
      if (message.action === 'clearCache') {
        if (message.accountKey) {
          const accountKey = sanitizeInput(message.accountKey);
          const [platform, accountId] = accountKey.split(':');
          
          await safeCache('removePattern', `*:${platform}:${accountId}`);
          return {success: true, message: `Cache cleared for ${accountKey}`};
        } else {
          // Clear all account-related caches
          await safeCache('removePattern', 'accountStatus:*');
          await safeCache('removePattern', 'evidence:*');
          return {success: true, message: 'All cache cleared'};
        }
      }
      
      // Handle checking if account is already reported
      if (message.action === 'hasReportedAccount') {
        const platform = sanitizeInput(message.platform);
        const accountId = sanitizeInput(message.accountId);
        
        if (!platform || !accountId) {
          return {success: false, error: 'Invalid parameters'};
        }
        
        const accountKey = `${platform}:${accountId}`;
        const isReported = await checkReportedAccount(accountKey);
        
        return {success: true, isReported};
      }
      
      return {success: false, error: 'Unknown action'};
      
    } catch (error) {
      console.error('Message handler error:', error);
      return {success: false, error: error.message || 'Unknown error'};
    }
  };
  
  // Execute the async operation and handle the response
  asyncOperation()
    .then(sendResponse)
    .catch(error => {
      console.error('Async operation error:', error);
      sendResponse({success: false, error: error.message || 'Unknown error'});
    });
  
  return true; // Keep the message channel open for async response
});

// Store reported account
async function storeReportedAccount(accountKey) {
  try {
    const result = await chrome.storage.local.get('reportedAccounts');
    const reportedAccounts = result.reportedAccounts || [];
    
    if (!reportedAccounts.includes(accountKey)) {
      reportedAccounts.push(accountKey);
      await chrome.storage.local.set({ reportedAccounts });
    }
  } catch (error) {
    console.error('Error storing reported account:', error);
  }
}

// Check if account is already reported
async function checkReportedAccount(accountKey) {
  try {
    const result = await chrome.storage.local.get('reportedAccounts');
    const reportedAccounts = result.reportedAccounts || [];
    return reportedAccounts.includes(accountKey);
  } catch (error) {
    console.error('Error checking reported account:', error);
    return false;
  }
}

// On install/update event listener
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') {
    // Clear all caches on fresh install
    safeCache('removePattern', '*').catch(console.error);
  } else if (details.reason === 'update') {
    // Only clear API response caches on update, preserve user preferences
    safeCache('removePattern', 'accountStatus:*').catch(console.error);
    safeCache('removePattern', 'evidence:*').catch(console.error);
  }
});
