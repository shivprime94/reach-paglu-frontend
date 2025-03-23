/**
 * Main entry point for the ReachPaglu extension
 * Exports common utilities and configuration
 */

// Extension configuration
export const config = {
  API_URL: 'https://reach-paglu-backend.onrender.com',
  VERSION: chrome.runtime.getManifest().version,
  CACHE_DURATIONS: {
    ACCOUNT_STATUS: {
      SAFE: 5 * 60 * 1000,         // 5 minutes for safe accounts (may change status)
      SCAMMER: 7 * 24 * 60 * 60 * 1000  // 7 days for scammer accounts (unlikely to change)
    },
    ACCOUNT_EVIDENCE: 15 * 60 * 1000, // 15 minutes
    REPORTED_ACCOUNT: 24 * 60 * 60 * 1000 // 24 hours
  }
};

// Simplified helpers - removed unused functions
export const helpers = {
  // Sanitize input to prevent XSS
  sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    return input.replace(/[<>]/g, '').trim();
  }
};

// Export fingerprint functions
export { getFingerprint, ensureFingerprint } from './utils/fingerprint.js';

// Export API client
export { default as api } from './utils/api.js';

// Export cache utilities
export { default as cache } from './utils/cache.js';

// Export validation utilities
export { default as validator } from './utils/validator.js';
