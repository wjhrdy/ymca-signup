const axios = require('axios');
const logger = require('../logger');
const db = require('../database');

const API_BASE_URL = process.env.API_BASE_URL || 'https://ymca-triangle.fisikal.com/api/web';
const YMCA_URL = process.env.YMCA_URL || 'https://ymca-triangle.fisikal.com';

async function loginWithAPI() {
  try {
    // Step 1: Get CSRF token and initial cookies from main page
    const initialResponse = await axios.get(YMCA_URL);
    const csrfMatch = initialResponse.data.match(/<meta name="csrf-token" content="([^"]+)"/);
    const csrfToken = csrfMatch ? csrfMatch[1] : null;
    
    // Extract initial cookies
    const setCookieHeaders = initialResponse.headers['set-cookie'] || [];
    let cookies = {};
    setCookieHeaders.forEach(cookie => {
      const [nameValue] = cookie.split(';');
      const [name, value] = nameValue.split('=');
      cookies[name] = value;
    });
    
    const initialCookieString = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    
    // Step 2: Login with CSRF token
    const loginData = {
      user: {
        email: process.env.YMCA_EMAIL,
        password: process.env.YMCA_PASSWORD,
        errors: null
      }
    };
    
    const formData = new URLSearchParams();
    formData.append('json', JSON.stringify(loginData));

    const response = await axios.post(`${API_BASE_URL}/sessions`, formData.toString(), {
      headers: {
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRF-Token': csrfToken,
        'Cookie': initialCookieString,
        'Referer': YMCA_URL + '/'
      }
    });

    const setCookieHeader = response.headers['set-cookie'];
    if (setCookieHeader && setCookieHeader.length > 0) {
      const sessionCookie = setCookieHeader.find(cookie => cookie.includes('fisikal_v2_session'));
      if (sessionCookie) {
        const cookieValue = sessionCookie.split(';')[0];
        logger.info('Successfully authenticated with API');
        
        // CRITICAL: Call /users/clients/linked to establish full session state
        // This is what the browser does after login and enables lock_version in responses
        // We also extract the client_id from this response
        try {
          const linkedResponse = await axios.get(`${API_BASE_URL}/users/clients/linked?include_self=true&json=${encodeURIComponent(JSON.stringify({ limit: { start: 0, count: 10 } }))}`, {
            headers: {
              'Cookie': cookieValue,
              'Accept': '*/*',
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
              'X-Requested-With': 'XMLHttpRequest'
            }
          });
          logger.info('Session state initialized');
          
          // Extract client_id from response
          const clients = linkedResponse.data?.data || linkedResponse.data?.clients || [];
          if (clients.length > 0) {
            const clientId = clients[0].id;
            logger.info(`✓ Auto-detected client_id: ${clientId}`);
            
            // Save to database for future use
            try {
              await db.saveClientId(clientId);
              logger.info('✓ Saved client_id to database');
            } catch (dbError) {
              logger.warn('Could not save client_id to database:', dbError.message);
            }
          } else {
            logger.warn('⚠️  No client data found in /users/clients/linked response');
          }
        } catch (initError) {
          logger.warn('Session initialization failed:', initError.message);
        }
        
        return cookieValue;
      }
    }
    
    throw new Error('Authentication failed - no session cookie received');
  } catch (error) {
    logger.error('API authentication failed:', error.message);
    throw error;
  }
}

async function login() {
  try {
    return await loginWithAPI();
  } catch (error) {
    logger.error('Login failed:', error);
    throw error;
  }
}

module.exports = {
  login
};
