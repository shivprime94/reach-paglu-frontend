// Reach Paglu background script

// Configuration
const API_URL = 'https://reach-paglu-backend.onrender.com'

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  
  // Handle opening report form
  if (message.action === 'openReport') {
    chrome.tabs.create({
      url: `popup.html?platform=${message.platform}&accountId=${message.accountId}&reportMode=true`
    });
    sendResponse({success: true});
  }
  
  // Handle checking account
  if (message.action === 'checkAccount') {
    checkAccount(message.platform, message.accountId)
      .then(data => sendResponse({success: true, data}))
      .catch(error => sendResponse({success: false, error: error.message}));
    return true; // Keep the message channel open for async response
  }
  
  // Handle submitting report
  if (message.action === 'submitReport') {
    submitReport(message.reportData)
      .then(result => sendResponse({success: true, result}))
      .catch(error => sendResponse({success: false, error: error.message}));
    return true; // Keep the message channel open for async response
  }
});

// Check if an account is flagged as a scammer
async function checkAccount(platform, accountId) {
  try {
    const response = await fetch(`${API_URL}/check/${platform}/${accountId}`);
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error checking account:', error);
    throw error;
  }
}

// Submit a scam report
async function submitReport(reportData) {
  try {
    const response = await fetch(`${API_URL}/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(reportData)
    });
    
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
    
  } catch (error) {
    console.error('Error submitting report:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
