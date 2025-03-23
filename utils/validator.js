/**
 * Client-side validators that mirror backend validation
 */

// Validation schemas
const schemas = {
  // Check account schema
  checkAccount: {
    validate(data) {
      const errors = [];
      
      if (!data.platform) {
        errors.push('Platform is required');
      } else if (data.platform !== 'twitter' && data.platform !== 'linkedin') {
        errors.push('Platform must be either twitter or linkedin');
      }
      
      if (!data.accountId) {
        errors.push('Account ID is required');
      } else if (data.accountId.length > 100) {
        errors.push('Account ID must be 100 characters or less');
      }
      
      return {
        valid: errors.length === 0,
        errors
      };
    }
  },
  
  // Submit report schema
  submitReport: {
    validate(data) {
      const errors = [];
      
      if (!data.platform) {
        errors.push('Platform is required');
      } else if (data.platform !== 'twitter' && data.platform !== 'linkedin') {
        errors.push('Platform must be either twitter or linkedin');
      }
      
      if (!data.accountId) {
        errors.push('Account ID is required');
      } else if (data.accountId.length > 100) {
        errors.push('Account ID must be 100 characters or less');
      }
      
      if (!data.evidence) {
        errors.push('Evidence is required');
      } else if (data.evidence.length < 1) {
        errors.push('Evidence is required');
      } else if (data.evidence.length > 800) {
        errors.push('Evidence must be 800 characters or less');
      }
      
      if (data.evidenceUrl && !isValidUrl(data.evidenceUrl)) {
        errors.push('Evidence URL must be a valid URL');
      }
      
      return {
        valid: errors.length === 0,
        errors
      };
    }
  }
};

// Validate URL format
function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch (error) {
    return false;
  }
}

// Sanitize input to prevent XSS
function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/[<>]/g, '').trim();
}

// Export the validator
const validator = {
  // Validate against a schema
  validate(schemaName, data) {
    if (!schemas[schemaName]) {
      throw new Error(`Schema "${schemaName}" not found`);
    }
    return schemas[schemaName].validate(data);
  },
  
  // Sanitize an object's string properties
  sanitizeObject(obj) {
    if (!obj || typeof obj !== 'object') return {};
    
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        result[key] = sanitizeInput(value);
      } else if (value === null || value === undefined) {
        result[key] = value;
      } else if (typeof value === 'object') {
        result[key] = this.sanitizeObject(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  },
  
  // Sanitize a single input
  sanitize: sanitizeInput
};

export default validator;
