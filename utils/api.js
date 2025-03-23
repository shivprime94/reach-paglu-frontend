/**
 * Centralized API client for ReachPaglu
 * Handles security headers, request formatting, and error handling
 */

// Configuration
// const API_URL = 'https://reach-paglu-backend.onrender.com';
const API_URL = 'http://localhost:3000'; // Development URL

// Extension version from manifest
const EXTENSION_VERSION = chrome.runtime.getManifest().version;

/**
 * Make an API request with proper security headers
 * @param {string} endpoint - API endpoint (without base URL)
 * @param {Object} options - Request options
 * @returns {Promise<any>} Response data
 */
async function apiRequest(endpoint, options = {}) {
  try {
    // Generate security headers
    const timestamp = Date.now();
    const nonce = Math.random().toString(36).substring(2);
    
    // Get fingerprint if available
    let fingerprintId = null;
    try {
      const result = await chrome.storage.local.get('fingerprint');
      fingerprintId = result.fingerprint;
    } catch (error) {
      console.warn('Failed to get fingerprint', error);
    }
    
    // Default headers
    const headers = {
      'X-Requested-With': 'XMLHttpRequest',
      'X-Extension-Version': EXTENSION_VERSION,
      'X-Request-Timestamp': timestamp.toString(),
      'X-Nonce': nonce,
      'Cache-Control': 'no-cache',
      ...options.headers
    };
    
    // Add fingerprint if available
    if (fingerprintId) {
      headers['X-Fingerprint-ID'] = fingerprintId;
    }
    
    // Add Content-Type for non-GET requests
    if (options.method && options.method !== 'GET') {
      headers['Content-Type'] = 'application/json';
    }
    
    // Full request options
    const requestOptions = {
      method: options.method || 'GET',
      headers,
      ...options
    };
    
    // Add body for non-GET requests with proper serialization
    if (options.body && options.method && options.method !== 'GET') {
      requestOptions.body = JSON.stringify(options.body);
    }
    
    // Make the request
    const response = await fetch(`${API_URL}${endpoint}`, requestOptions);
    
    // Handle HTTP errors
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `API error: ${response.status}`);
    }
    
    // Parse response
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error(`API error (${endpoint}):`, error);
    return { 
      success: false, 
      error: error.message || 'Unknown error',
      isDuplicate: error.message?.includes('already reported')
    };
  }
}

// API endpoints
const api = {
  /**
   * Check account status
   */
  checkAccount: async (platform, accountId) => {
    return apiRequest(`/check/${encodeURIComponent(platform)}/${encodeURIComponent(accountId)}`);
  },
  
  /**
   * Submit report
   */
  submitReport: async (reportData) => {
    return apiRequest('/report', {
      method: 'POST',
      body: reportData
    });
  },
  
  /**
   * Get evidence
   */
  getEvidence: async (platform, accountId) => {
    return apiRequest(`/evidence/${encodeURIComponent(platform)}/${encodeURIComponent(accountId)}`);
  }
};

export default api;
