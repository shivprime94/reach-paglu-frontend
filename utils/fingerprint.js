// Fingerprint management module

let cachedFingerprint = null;

// Initialize FingerprintJS and get visitor identifier
async function getFingerprint() {
  if (cachedFingerprint) {
    return cachedFingerprint;
  }

  try {
    // Initialize FingerprintJS agent
    const fpPromise = FingerprintJS.load();
    const fp = await fpPromise;

    // Get visitor identifier
    const result = await fp.get();
    
    // Cache the fingerprint
    cachedFingerprint = result.visitorId;
    
    // Store in extension storage
    chrome.storage.local.set({ 'fingerprint': result.visitorId });
    
    return result.visitorId;
  } catch (error) {
    console.error('Error generating fingerprint:', error);
    return null;
  }
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
