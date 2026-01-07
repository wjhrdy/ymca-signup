# YMCA Auto-Signup Application

A comprehensive web application for automatically signing up for YMCA classes using the Fisikal API. This application monitors your tracked classes and automatically registers you at a predefined time before the class starts (default: 46 hours).

## Deploy

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/MMEviu?referralCode=yfSbnH)

## Features

- 🔐 **Secure Authentication** - Multi-layer authentication with admin login and YMCA credentials
- 🛡️ **Web-Hardened** - Protected with user authentication for safe web deployment
- 📅 **Class Browser** - View and search available classes at your YMCA locations
- 📌 **Class Tracking** - Track specific classes you want to attend regularly
- ⚡ **Auto-Signup** - Automatically register for classes at the optimal time
- 📊 **Signup Logs** - View history of all signup attempts (successful and failed)
- 🐳 **Docker Support** - Easy deployment with Docker and Docker Compose
- 💻 **Modern UI** - Beautiful, responsive interface built with React and TailwindCSS

## Architecture

### Backend (Node.js + Express)
- RESTful API for class management
- SQLite database for persistent storage
- Cron scheduler for automated signups (runs every 5 minutes)

### Frontend (React + Vite)
- Modern React application with functional components
- TailwindCSS for styling
- Lucide React icons
- Real-time status updates

## Prerequisites

- Docker and Docker Compose (recommended)
- OR Node.js 18+ (for local development)
- YMCA Triangle account credentials

## Quick Start (Docker)

1. **Clone the repository**
   ```bash
   cd /Users/willy/Developer/ymca-signup
   ```

2. **Create environment file**
   ```bash
   cp .env.example .env
   ```

3. **Edit `.env` with configuration (Optional)**
   ```env
   NODE_ENV=production
   PORT=3001
   ```
   
   **Note**: `SESSION_SECRET` will auto-generate if not provided. For persistent sessions across server restarts, optionally set it:
   ```bash
   # Generate a session secret
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   # Add to .env: SESSION_SECRET=<generated-value>
   ```

4. **Build and run with Docker**
   ```bash
   docker-compose up -d
   ```

5. **Access the application**
   Open your browser to `http://localhost:3001`

6. **First-time setup**
   - On first run, you'll be prompted to create an admin account
   - Choose a strong username and password (minimum 8 characters)
   - This account protects access to your YMCA signup system
   - After setup, you'll login with these credentials
   - Configure your YMCA credentials in the Settings tab

## Local Development Setup

1. **Install dependencies**
   ```bash
   npm run install-all
   ```

2. **Create environment file**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Start development servers**
   ```bash
   npm run dev
   ```
   
   This starts:
   - Backend server on `http://localhost:3001`
   - Frontend dev server on `http://localhost:3000` (with proxy to backend)

4. **Build for production**
   ```bash
   npm run build
   npm start
   ```

## Usage Guide

### 1. Initial Setup (First Run)
- On first access, you'll see a setup screen
- Create an admin account with a username and password
- This account secures your application for web deployment
- **Keep these credentials safe** - they control access to your YMCA automation

### 2. Login
- After setup, login with your admin credentials
- You'll be taken to the main application

### 3. Configure YMCA Credentials
- Navigate to **Settings** tab
- Enter your YMCA account email and password
- Click **Save Credentials**
- The app will use these to authenticate with YMCA's system

### 4. Connect to YMCA
- Click **Connect YMCA** button in the header
- The system will authenticate using your stored YMCA credentials
- Once connected, you can browse and track classes

### 5. Browse Classes
- Navigate to the **Browse Classes** tab
- Adjust date filters to view classes in your desired timeframe
- Click **Refresh** to fetch the latest class list
- Click **Track** to add a class to your tracked list
- Click **Sign Up Now** to immediately register for a class

### 6. Track Classes
- Navigate to the **Tracked Classes** tab
- View all classes you're monitoring
- Toggle **Auto Signup** on/off for each class
- Adjust **signup timing** (hours before class starts)
- Remove classes you no longer want to track

### 7. View Signup History
- Navigate to the **Signup Logs** tab
- See all automatic and manual signup attempts
- View success/failure status and error messages
- Monitor signup statistics

## How Auto-Signup Works

1. **Scheduling**: The system runs a check every 5 minutes (cron job)
2. **Matching**: Compares upcoming classes against your tracked classes
3. **Timing**: For each match, checks if current time >= (class time - signup hours)
4. **Signup**: Attempts to register via API
5. **Logging**: Records all attempts in the database

### Tracking Criteria

Classes are matched based on:
- Service ID (required)
- Trainer ID (optional - if specified)
- Location ID (required)
- Day of week (optional)
- Start time (optional)

## Database Schema

### tracked_classes
- `id` - Auto-increment primary key
- `service_id` - Fisikal service ID
- `service_name` - Class name
- `trainer_id` - Trainer ID (optional)
- `trainer_name` - Trainer name
- `location_id` - Location ID
- `location_name` - Location name
- `day_of_week` - Day name (e.g., "Monday")
- `start_time` - Time in HH:MM format
- `auto_signup` - Boolean for auto-signup enabled
- `signup_hours_before` - Hours before class to attempt signup
- `created_at` - Timestamp

### signup_logs
- `id` - Auto-increment primary key
- `occurrence_id` - Fisikal occurrence ID
- `service_name` - Class name
- `trainer_name` - Trainer name
- `location_name` - Location name
- `class_time` - Scheduled class time
- `signup_time` - When signup was attempted
- `status` - 'success' or 'failed'
- `error_message` - Error details if failed

## API Endpoints

### User Authentication
- `GET /api/auth/setup-status` - Check if initial setup is required
- `POST /api/auth/setup` - Create first admin user (only works if no users exist)
- `POST /api/auth/user-login` - Login with admin credentials
- `POST /api/auth/logout` - Logout current session
- `GET /api/auth/session` - Check current authentication status

### Status (Protected)
- `GET /api/status` - System status and YMCA authentication state

### YMCA Authentication (Protected)
- `POST /api/auth/login` - Authenticate with YMCA credentials

### Classes
- `GET /api/classes` - Fetch available classes
  - Query params: `startDate`, `endDate`, `locationId`

### Tracked Classes
- `GET /api/tracked-classes` - Get all tracked classes
- `POST /api/tracked-classes` - Add a new tracked class
- `PUT /api/tracked-classes/:id` - Update tracked class settings
- `DELETE /api/tracked-classes/:id` - Remove tracked class

### Signup
- `POST /api/signup/:occurrenceId` - Manually sign up for a class

### Logs
- `GET /api/signup-logs` - Get signup history (last 50 entries)

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode (development/production) | `production` |
| `PORT` | Server port | `3001` |
| `SESSION_SECRET` | Secret key for session encryption (auto-generated if not set) | Auto-generated |
| `YMCA_EMAIL` | Your YMCA account email (optional - can set in UI) | None |
| `YMCA_PASSWORD` | Your YMCA account password (optional - can set in UI) | None |
| `YMCA_URL` | YMCA Fisikal web URL | `https://ymca-triangle.fisikal.com` |
| `API_BASE_URL` | Fisikal API base URL | `https://ymca-triangle.fisikal.com/api/web` |

### Signup Timing

The default of 46 hours is commonly used because:
- YMCA often opens registration 48 hours before a class
- Signing up 46 hours before ensures you're early in the queue
- Adjust per class based on popularity

## Docker Commands

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild after code changes
docker-compose up -d --build

# View database
docker-compose exec ymca-signup sqlite3 /app/database.db
```

## Troubleshooting

### Authentication Issues
- Verify credentials in `.env` are correct
- Check that YMCA website is accessible
- Look for authentication errors in logs

### Classes Not Showing
- Ensure you're authenticated (green status indicator)
- Check date filters aren't too restrictive
- Verify your YMCA has classes scheduled

### Auto-Signup Not Working
- Check that auto-signup is enabled (green toggle)
- Verify timing is appropriate (system checks every 5 minutes)
- Review signup logs for error messages
- Ensure class matching criteria are correct

### Docker Issues
- Ensure ports 3001 is not in use
- Check Docker logs: `docker-compose logs -f`
- Verify `.env` file exists and is properly formatted

## Security Notes

### For Web Deployment
- **Admin Login Required**: The app now requires admin authentication before access
- **First-Run Setup**: Create a strong admin account on first deployment
- **Session Security**: Always set a strong `SESSION_SECRET` in production
- **HTTPS Recommended**: Use HTTPS/TLS for production deployments
- **Credentials**: YMCA credentials are stored encrypted in the database

### General Security
- Never commit `.env` file to version control
- Keep both admin and YMCA credentials secure
- Run Docker container with appropriate security settings
- Consider using Docker secrets for production deployments
- Regularly update dependencies for security patches

### Password Requirements
- Admin username: Minimum 3 characters
- Admin password: Minimum 8 characters
- Use strong, unique passwords

## Development

### Project Structure
```
ymca-signup/
├── server/               # Backend Node.js application
│   ├── index.js         # Main server file
│   ├── database.js      # SQLite database layer
│   └── services/        # Business logic services
│       ├── authService.js
│       ├── classService.js
│       └── schedulerService.js
├── client/              # Frontend React application
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/  # React components
│   │   └── index.css    # Tailwind styles
│   ├── package.json
│   └── vite.config.js
├── Dockerfile           # Docker image definition
├── docker-compose.yml   # Docker Compose configuration
├── package.json         # Backend dependencies
└── .env                 # Environment configuration
```

### Tech Stack
- **Backend**: Node.js, Express, SQLite, node-cron
- **Frontend**: React, Vite, TailwindCSS, Lucide React, Axios
- **Deployment**: Docker, Docker Compose

## Contributing

To extend this application:

1. **Add new API endpoints** in `server/index.js`
2. **Create new services** in `server/services/`
3. **Add UI components** in `client/src/components/`
4. **Update database schema** in `server/database.js`

## License

MIT

## Support

For issues related to:
- **Fisikal API**: Check [Fisikal API Documentation](https://www.cuttingedge.fisikal.com/api/unified/docs)
- **Application bugs**: Check logs and error messages
- **YMCA account**: Contact your local YMCA

## Acknowledgments

- Built for YMCA Triangle area locations
- Uses Fisikal's class management system
