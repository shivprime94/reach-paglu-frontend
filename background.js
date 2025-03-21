// Reach Paglu background script

// Configuration
const API_URL = 'https://reach-paglu-backend.onrender.com'
const LOCAL_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds
const localCache = {};

// Helper function to sanitize input strings
function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  // Basic sanitization to prevent XSS
  return input.replace(/[<>]/g, '');
}

// Listen for messages with improved error handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const asyncOperation = async () => {
    try {
      // Basic message validation
      if (!message || typeof message !== 'object' || !message.action) {
        return {success: false, error: 'Invalid message format'};
      }
      
      // Check if context is still valid
      if (chrome.runtime.lastError) {
        console.error('Extension context error:', chrome.runtime.lastError);
        return {success: false, error: 'Extension context error'};
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
      
      // Handle checking account
      if (message.action === 'checkAccount') {
        // Validate inputs
        const platform = sanitizeInput(message.platform);
        const accountId = sanitizeInput(message.accountId);
        
        if (!platform || !accountId) {
          return {success: false, error: 'Invalid parameters'};
        }
        
        const data = await checkAccount(platform, accountId);
        return {success: true, data};
      }
      
      // Handle submitting report
      if (message.action === 'submitReport') {
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
          reporterToken: message.reportData.reporterToken ? sanitizeInput(message.reportData.reporterToken) : null
        };
        
        // Validate required fields
        if (!reportData.platform || !reportData.accountId || !reportData.evidence) {
          return {success: false, error: 'Missing required fields'};
        }
        
        const result = await submitReport(reportData);
        // Clear local cache for this account when submitting a new report
        if (result.success) {
          const cacheKey = `${reportData.platform}:${reportData.accountId}`;
          delete localCache[cacheKey];
        }
        return {success: true, result};
      }
      
      // Handle clearing cache
      if (message.action === 'clearCache') {
        if (message.accountKey) {
          const accountKey = sanitizeInput(message.accountKey);
          delete localCache[accountKey];
          return {success: true, message: `Cache cleared for ${accountKey}`};
        } else {
          // Clear all cache
          Object.keys(localCache).forEach(key => delete localCache[key]);
          return {success: true, message: 'All cache cleared'};
        }
      }
      
      return {success: false, error: 'Unknown action'};
      
    } catch (error) {
      console.error('Message handler error:', error);
      return {success: false, error: error.message};
    }
  };
  
  // Execute the async operation and handle the response
  asyncOperation()
    .then(result => {
      try {
        sendResponse(result);
      } catch (error) {
        console.error('Error sending response:', error);
      }
    })
    .catch(error => {
      console.error('Async operation error:', error);
      try {
        sendResponse({success: false, error: error.message});
      } catch (sendError) {
        console.error('Error sending error response:', sendError);
      }
    });
  
  return true; // Keep the message channel open for async response
});

// Check if an account is flagged as a scammer with enhanced error handling
async function checkAccount(platform, accountId) {
  try {
    // Check if context is still valid
    if (chrome.runtime.lastError) {
      console.error('Runtime error detected:', chrome.runtime.lastError);
      throw new Error('Extension context invalidated');
    }
    
    const cacheKey = `${platform}:${accountId}`;
    
    // Check if we have a valid cached response
    if (localCache[cacheKey] && localCache[cacheKey].expires > Date.now()) {
      return localCache[cacheKey].data;
    }
    
    // No valid cache, fetch from API with better error handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
    
    try {
      const response = await fetch(
        `${API_URL}/check/${encodeURIComponent(platform)}/${encodeURIComponent(accountId)}`, 
        {
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
          },
          signal: controller.signal
        }
      );
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Cache the response locally
      localCache[cacheKey] = {
        data,
        expires: Date.now() + LOCAL_CACHE_DURATION
      };
      
      return data;
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error('API fetch error:', fetchError);
      
      // If we have expired cache, return it as a fallback
      if (localCache[cacheKey]) {
        console.log('Using expired cache as fallback');
        return localCache[cacheKey].data;
      }
      
      throw fetchError;
    }
  } catch (error) {
    console.error('Error checking account:', error);
    throw error;
  }
}

// Submit a scam report
async function submitReport(reportData) {
  try {
    // Create a random nonce for CSRF protection
    const nonce = Math.random().toString(36).substring(2);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
    
    try {
      const response = await fetch(`${API_URL}/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Requested-With': 'XMLHttpRequest',
          'X-Nonce': nonce
        },
        body: JSON.stringify(reportData),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      const data = await response.json();
      
      if (!response.ok) {
        return {
          success: false,
          error: data.message || `API error: ${response.status}`,
          isDuplicate: data.isDuplicate || false
        };
      }
      
      return {
        success: true,
        result: data
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error('API fetch error:', fetchError);
      throw fetchError;
    }
    
  } catch (error) {
    console.error('Error submitting report:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Add a function to get evidence with caching
async function getEvidence(platform, accountId) {
  try {
    const cacheKey = `evidence:${platform}:${accountId}`;
    
    // Check if we have a valid cached response
    if (localCache[cacheKey] && localCache[cacheKey].expires > Date.now()) {
      return localCache[cacheKey].data;
    }
    
    const response = await fetch(`${API_URL}/evidence/${encodeURIComponent(platform)}/${encodeURIComponent(accountId)}`, {
      headers: {
        'Cache-Control': 'no-cache',
        'X-Requested-With': 'XMLHttpRequest'
      }
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Cache the response locally with shorter duration
    localCache[cacheKey] = {
      data,
      expires: Date.now() + (LOCAL_CACHE_DURATION / 2) // Half the normal cache time
    };
    
    return data;
  } catch (error) {
    console.error('Error fetching evidence:', error);
    throw error;
  }
}

// Get system statistics
async function getStats() {
  try {
    const cacheKey = 'stats:global';
    
    // Check if we have a valid cached response (shorter cache for stats)
    if (localCache[cacheKey] && localCache[cacheKey].expires > Date.now()) {
      return localCache[cacheKey].data;
    }
    
    const response = await fetch(`${API_URL}/stats`, {
      headers: {
        'Cache-Control': 'no-cache',
        'X-Requested-With': 'XMLHttpRequest'
      }
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Cache the response locally
    localCache[cacheKey] = {
      data,
      expires: Date.now() + (LOCAL_CACHE_DURATION / 2) // Half the normal cache time
    };
    
    return data;
  } catch (error) {
    console.error('Error fetching stats:', error);
    throw error;
  }
}
