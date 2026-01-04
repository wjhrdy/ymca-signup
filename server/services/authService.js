const axios = require('axios');

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
        console.log('Successfully authenticated with API');
        
        // CRITICAL: Call /users/clients/linked to establish full session state
        // This is what the browser does after login and enables lock_version in responses
        try {
          await axios.get(`${API_BASE_URL}/users/clients/linked?include_self=true&json=${encodeURIComponent(JSON.stringify({ limit: { start: 0, count: 10 } }))}`, {
            headers: {
              'Cookie': cookieValue,
              'Accept': '*/*',
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
              'X-Requested-With': 'XMLHttpRequest'
            }
          });
          console.log('Session state initialized');
        } catch (initError) {
          console.warn('Session initialization failed:', initError.message);
        }
        
        return cookieValue;
      }
    }
    
    throw new Error('Authentication failed - no session cookie received');
  } catch (error) {
    console.error('API authentication failed:', error.message);
    throw error;
  }
}

async function login() {
  try {
    return await loginWithAPI();
  } catch (error) {
    console.error('Login failed:', error);
    throw error;
  }
}

module.exports = {
  login
};
