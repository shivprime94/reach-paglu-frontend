/**
 * Enhanced caching system for API responses
 */

// Default cache duration in milliseconds
const DEFAULT_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// In-memory cache
const memoryCache = {};

/**
 * Cache manager with tiered storage (memory + chrome.storage)
 */
const cache = {
  /**
   * Get item from cache with key
   * @param {string} key - Cache key
   * @returns {Promise<any>} Cached data or null
   */
  async get(key) {
    // First check in-memory cache (fastest)
    if (memoryCache[key] && memoryCache[key].expires > Date.now()) {
      return memoryCache[key].data;
    }
    
    // Then check chrome.storage (persists across sessions)
    try {
      const result = await chrome.storage.local.get(key);
      if (result[key] && result[key].expires > Date.now()) {
        // Update memory cache for faster access next time
        memoryCache[key] = result[key];
        return result[key].data;
      }
    } catch (error) {
      console.warn('Cache get error:', error);
    }
    
    return null;
  },
  
  /**
   * Store item in cache
   * @param {string} key - Cache key
   * @param {any} data - Data to cache
   * @param {number} duration - Cache duration in ms
   */
  async set(key, data, duration = DEFAULT_CACHE_DURATION) {
    const cacheItem = {
      data,
      expires: Date.now() + duration,
      timestamp: Date.now()
    };
    
    // Store in memory
    memoryCache[key] = cacheItem;
    
    // Store in chrome.storage
    try {
      await chrome.storage.local.set({ [key]: cacheItem });
    } catch (error) {
      console.warn('Cache set error:', error);
    }
  },
  
  /**
   * Remove item from cache
   * @param {string} key - Cache key
   */
  async remove(key) {
    // Remove from memory
    delete memoryCache[key];
    
    // Remove from chrome.storage
    try {
      await chrome.storage.local.remove(key);
    } catch (error) {
      console.warn('Cache remove error:', error);
    }
  },
  
  /**
   * Remove items matching a pattern
   * @param {string} pattern - Key pattern (simple wildcard matching)
   */
  async removePattern(pattern) {
    // Convert pattern to regex
    const regexPattern = new RegExp('^' + pattern.replace('*', '.*') + '$');
    
    // Remove from memory
    Object.keys(memoryCache).forEach(key => {
      if (regexPattern.test(key)) {
        delete memoryCache[key];
      }
    });
    
    // Remove from chrome.storage (need to get all items first)
    try {
      const allItems = await chrome.storage.local.get(null);
      const keysToRemove = Object.keys(allItems).filter(key => regexPattern.test(key));
      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
      }
    } catch (error) {
      console.warn('Cache removePattern error:', error);
    }
  },
  
  /**
   * Get item with cache key format helper
   * @param {string} prefix - Cache prefix
   * @param {string} params - Cache parameters
   */
  async getFormatted(prefix, ...params) {
    const key = `${prefix}:${params.join(':')}`;
    return this.get(key);
  },
  
  /**
   * Set item with cache key format helper
   * @param {string} prefix - Cache prefix
   * @param {any} data - Data to cache
   * @param {number} duration - Cache duration in ms
   * @param {string} params - Cache parameters
   */
  async setFormatted(prefix, data, duration, ...params) {
    const key = `${prefix}:${params.join(':')}`;
    return this.set(key, data, duration);
  }
};

export default cache;
