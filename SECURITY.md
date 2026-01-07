# Security Guide

## Authentication System

This application now implements a multi-layer security system designed for safe web deployment.

### Layer 1: Admin Authentication
- **First-run setup**: Creates an admin account to control access to the application
- **Session-based**: Uses secure HTTP sessions with encrypted cookies
- **Required for all access**: All API endpoints require valid admin authentication

### Layer 2: YMCA Authentication  
- **Stored credentials**: YMCA email/password stored in SQLite database
- **API authentication**: Used to connect to YMCA's Fisikal system
- **Configurable via UI**: Set in Settings tab after admin login

## Deployment Security Checklist

### Before Deploying to Production

1. **Session Secret (Optional but Recommended)**
   
   The app will auto-generate a `SESSION_SECRET` if not provided, which is perfect for one-click deployments. However, for production with persistent sessions across restarts, set a fixed value:
   
   ```bash
   # Generate a cryptographically secure random secret
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Add to `.env`:
   ```
   SESSION_SECRET=<generated-secret-here>
   ```
   
   **Note**: If not set, sessions will be invalidated on server restart (users will need to login again).

2. **Create Strong Admin Account**
   - Username: At least 3 characters, unique
   - Password: Minimum 8 characters, use a strong password
   - Use a password manager to generate and store

3. **Enable HTTPS**
   - Use a reverse proxy (nginx, Caddy) with TLS certificates
   - Or deploy to a platform with built-in HTTPS (Railway, Heroku, etc.)
   - Never expose plain HTTP to the internet

4. **Configure Environment**
   ```env
   NODE_ENV=production
   SESSION_SECRET=<your-secret>
   PORT=3001
   ```

5. **Database Security**
   - The SQLite database contains sensitive data
   - Ensure proper file permissions: `chmod 600 data/database.db`
   - Back up regularly to a secure location
   - Never commit database files to version control

6. **Network Security**
   - Use firewall rules to restrict access
   - Consider IP whitelisting if possible
   - Use a VPN for additional security if needed

## Password Requirements

### Admin Account
- **Username**: Minimum 3 characters
- **Password**: Minimum 8 characters
- **Recommendation**: Use 16+ character passphrase or password manager

### YMCA Credentials
- Your existing YMCA account credentials
- Stored in database (not in environment variables)
- Only accessible after admin authentication

## Session Management

- **Session Duration**: 7 days by default
- **Cookie Settings**:
  - `httpOnly: true` - Prevents JavaScript access
  - `secure: true` (in production) - HTTPS only
  - `sameSite: lax` - CSRF protection
- **Session Storage**: Server-side in memory (express-session)

## Data Protection

### What's Stored in the Database
- Admin credentials (bcrypt hashed passwords)
- YMCA credentials (plaintext - consider encrypting in future)
- Tracked classes
- Signup logs
- Session cookies

### Protecting the Database
```bash
# Set restrictive permissions
chmod 600 data/database.db

# Regular backups
cp data/database.db backups/database-$(date +%Y%m%d).db

# Encrypt backups
gpg -c backups/database-*.db
```

## Security Best Practices

1. **Keep Software Updated**
   ```bash
   npm audit
   npm audit fix
   ```

2. **Monitor Logs**
   - Check for failed login attempts
   - Review unusual activity patterns
   - Use log aggregation tools in production

3. **Limit Access**
   - Only share admin credentials with trusted users
   - Change passwords if compromised
   - Consider implementing rate limiting for login attempts

4. **Regular Backups**
   - Automated daily database backups
   - Store backups in secure, separate location
   - Test restore procedures regularly

## Vulnerability Reporting

If you discover a security vulnerability:
1. Do not open a public issue
2. Contact the maintainer privately
3. Include details and steps to reproduce

## Future Enhancements

Potential security improvements for future versions:
- Database encryption at rest
- Rate limiting on login endpoints
- Two-factor authentication
- Audit logging
- Multiple user accounts with role-based access
- Password reset functionality
- Session timeout on inactivity
