// Fingerprint management module

let cachedFingerprint = null;

// Initialize FingerprintJS and get visitor identifier with retries
async function getFingerprint(retries = 3) {
  if (cachedFingerprint) {
    return cachedFingerprint;
  }

  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      // First check storage
      const stored = await new Promise(resolve => {
        chrome.storage.local.get('fingerprint', result => {
          resolve(result.fingerprint);
        });
      });

      if (stored) {
        cachedFingerprint = stored;
        return stored;
      }

      // Initialize FingerprintJS agent
      const fpPromise = FingerprintJS.load();
      const fp = await fpPromise;

      // Get visitor identifier
      const result = await fp.get();
      
      // Cache the fingerprint
      cachedFingerprint = result.visitorId;
      
      // Store in extension storage
      await chrome.storage.local.set({ 'fingerprint': result.visitorId });
      
      return result.visitorId;
    } catch (error) {
      console.warn(`Fingerprint attempt ${i + 1} failed:`, error);
      lastError = error;
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
      }
    }
  }

  console.error('All fingerprint attempts failed:', lastError);
  return null;
}

// Get cached fingerprint or generate new one
async function ensureFingerprint() {
  // First check extension storage
  const stored = await new Promise(resolve => {
    chrome.storage.local.get('fingerprint', result => {
      resolve(result.fingerprint);
    });
  });

  if (stored) {
    cachedFingerprint = stored;
    return stored;
  }

  return getFingerprint();
}
