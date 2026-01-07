# YMCA Auto-Signup Application

A comprehensive web application for automatically signing up for YMCA classes using the Fisikal API. This application monitors your tracked classes and automatically registers you at a predefined time before the class starts (default: 46 hours).

## Deploy

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/MMEviu?referralCode=yfSbnH)

## Features

- 🔐 **Secure Authentication** - Multi-layer authentication with admin login and YMCA credentials
- 🛡️ **Web-Hardened** - Protected with user authentication for safe web deployment
- 📅 **Class Browser** - Search and browse available classes with infinite scroll
- 🎯 **Smart Tracking** - Flexible class matching with instructor/time/location options
- 🔍 **Live Preview** - See matching classes before confirming tracking
- ⚡ **Auto-Signup** - Automatically register for classes at the optimal time
- ⚙️ **Settings UI** - Configure everything through the web interface (no .env required!)
- 📍 **Location Filtering** - Select preferred YMCA locations to monitor
- 📊 **Booked Classes** - View all your registered classes and signup history
- 🐳 **Docker Support** - One-command deployment with Docker Compose
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

## Quick Start (Docker) - 2 Commands!

1. **Start the application**
   ```bash
   docker-compose up -d
   ```

2. **Open in browser**
   ```
   http://localhost:3001
   ```

That's it! On first launch, you'll be guided through a simple setup wizard to create your admin account and configure your YMCA credentials through the web interface.

### What Happens on First Run

1. **Create Admin Account** - Set up a username and password to secure your application
2. **Login** - Sign in with your new admin credentials  
3. **Configure YMCA Credentials** - Go to Settings tab and enter your YMCA email/password
4. **Connect** - Click "Connect YMCA" button in the header
5. **Start Browsing** - You're ready to browse and track classes!

### Optional: Persistent Sessions

By default, sessions reset on server restart. For persistent sessions across restarts:

```bash
cp .env.example .env
# Generate a session secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Add to .env: SESSION_SECRET=<generated-value>
```

## Local Development Setup

1. **Install dependencies**
   ```bash
   npm run install-all
   ```

2. **Start development servers**
   ```bash
   npm run dev
   ```
   
   This starts:
   - Backend server on `http://localhost:3001`
   - Frontend dev server on `http://localhost:3000` (with proxy to backend)

3. **Build for production**
   ```bash
   npm run build
   npm start
   ```

No `.env` file required! Configure everything through the Settings UI after first login.

## Usage Guide

### 1. Initial Setup (First Run)
- On first access, you'll see a setup wizard
- Create an admin account with a username and password (min 8 characters)
- This account secures your application for web deployment
- **Keep these credentials safe** - they control access to your YMCA automation

### 2. Configure YMCA Credentials
- After login, navigate to **Settings** tab
- Enter your YMCA account email and password
- Click **Save Credentials**
- Credentials are securely stored in the database

### 3. Set Your Preferences (Optional)
In the **Settings** tab, you can configure:
- **Preferred Locations** - Select which YMCA locations to monitor (or leave blank for all)
- **Check Interval** - How often to check for classes (default: 5 minutes)
- **Default Signup Hours** - How far in advance to auto-signup (default: 46 hours)
- **Days Ahead** - How many days of classes to fetch (default: 7 days)

### 4. Connect to YMCA
- Click **Connect YMCA** button in the header
- The system will authenticate using your stored YMCA credentials
- Once connected (green status indicator), you can browse and track classes

### 5. Browse Classes
- Navigate to the **Browse Classes** tab
- Use the **search bar** to find classes by name, instructor, or location
- Classes load with **infinite scroll** - scroll down to load more
- View class details including instructor, time, location, and enrollment status
- Click **Track** to add a class with flexible matching options
- Click **Sign Up Now** to immediately register for a class

### 6. Track Classes with Smart Matching
When clicking **Track**, you'll see a configuration modal:
- **Match Instructor** - Require the same instructor (or allow any)
- **Match Exact Time** - Require exact time (or allow ±tolerance in minutes)
- **Auto-Signup** - Enable/disable automatic registration
- **Signup Hours Before** - Customize when to auto-signup for this class
- **Preview Matches** - See upcoming classes that match your criteria before confirming

This flexible system lets you track:
- Specific instructor + time combinations
- Any instructor at a specific time
- Any time on a specific day at a location
- And more!

### 7. Manage Tracked Classes
- Navigate to the **Tracked Classes** tab
- View all classes you're monitoring with their matching criteria
- Toggle **Auto Signup** on/off for each tracked class
- Edit tracking settings or signup timing
- Remove classes you no longer want to track
- See matching rules and next signup time

### 8. View Booked Classes
- Navigate to the **Booked Classes** tab
- See all your registered classes (both auto and manual signups)
- View signup history with success/failure status
- Check error messages if signup failed
- Monitor your class schedule

## How Auto-Signup Works

1. **Scheduling**: The system runs a check every 5 minutes (cron job)
2. **Matching**: Compares upcoming classes against your tracked classes
3. **Timing**: For each match, checks if current time >= (class time - signup hours)
4. **Signup**: Attempts to register via API
5. **Logging**: Records all attempts in the database

### Smart Matching System

The app uses a flexible matching system. When you track a class, you configure:
- **Service/Class Type** (always required) - e.g., "Yoga", "Spin"
- **Location** (always required) - e.g., "Downtown Durham YMCA"
- **Day of Week** (always required) - e.g., "Monday"
- **Instructor** (optional) - Match specific instructor or allow any
- **Time** (flexible) - Exact time or fuzzy match within tolerance

This means you can track:
- Every Monday yoga class with Sarah at 6pm (exact match)
- Any Monday yoga class at around 6pm ±15 minutes (fuzzy time)
- Any instructor's Monday yoga class at Downtown (any instructor)
- And many other combinations!

## Database Schema

### tracked_classes
- `id` - Auto-increment primary key
- `service_id` - Fisikal service ID
- `service_name` - Class name
- `trainer_id` - Trainer ID (null if any instructor)
- `trainer_name` - Trainer name
- `location_id` - Location ID
- `location_name` - Location name
- `day_of_week` - Day name (e.g., "Monday")
- `start_time` - Time in HH:MM format
- `match_trainer` - Boolean (match specific instructor or allow any)
- `match_exact_time` - Boolean (exact time or fuzzy match)
- `time_tolerance` - Minutes tolerance for fuzzy time matching
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

### settings
- `key` - Setting identifier
- `value` - JSON-encoded setting value
- Stores: preferred locations, scheduler config, class fetch settings

### credentials
- `id` - Primary key
- `email` - YMCA account email (encrypted)
- `password` - YMCA account password (encrypted)
- `created_at` - Timestamp
- `updated_at` - Timestamp

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

### Settings (Protected)
- `GET /api/settings` - Get current settings
- `PUT /api/settings` - Update settings
- `GET /api/credentials/status` - Check if YMCA credentials are configured
- `PUT /api/credentials` - Save YMCA credentials (encrypted)

### Classes (Protected)
- `GET /api/classes` - Fetch available classes
  - Query params: `startDate`, `endDate`, `locationId`, `limit`, `offset`
  - Supports infinite scroll with pagination

### Tracked Classes (Protected)
- `GET /api/tracked-classes` - Get all tracked classes
- `POST /api/tracked-classes` - Add a new tracked class
- `POST /api/tracked-classes/preview` - Preview matching classes before tracking
- `PUT /api/tracked-classes/:id` - Update tracked class settings
- `DELETE /api/tracked-classes/:id` - Remove tracked class

### Signup (Protected)
- `POST /api/signup/:occurrenceId` - Manually sign up for a class
- `DELETE /api/signup/:occurrenceId` - Cancel a class registration

### Logs (Protected)
- `GET /api/signup-logs` - Get signup history with enrolled classes

## Configuration

### Environment Variables

**All environment variables are OPTIONAL!** Configure everything through the Settings UI instead.

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode (development/production) | `production` |
| `PORT` | Server port | `3001` |
| `SESSION_SECRET` | Secret for session encryption (auto-generated if not set) | Auto-generated |
| `YMCA_EMAIL` | YMCA email (use Settings UI instead) | None |
| `YMCA_PASSWORD` | YMCA password (use Settings UI instead) | None |
| `YMCA_URL` | YMCA Fisikal web URL (rarely needs override) | `https://ymca-triangle.fisikal.com` |
| `API_BASE_URL` | Fisikal API base URL (rarely needs override) | `https://ymca-triangle.fisikal.com/api/web` |

### Settings Configurable via UI

Everything can be configured through the **Settings** tab:
- **YMCA Credentials** - Email and password (stored encrypted)
- **Preferred Locations** - Select which YMCAs to monitor
- **Scheduler Settings** - Check interval and default signup timing
- **Class Fetch Settings** - How many days ahead and max classes per fetch

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

### Can't Login / Authentication Issues
- **Admin Login**: Make sure you completed the initial setup wizard
- **YMCA Connection**: Check credentials in Settings tab are correct
- **Red indicator**: Click "Connect YMCA" button to authenticate
- Check YMCA website is accessible at https://ymca-triangle.fisikal.com
- Review logs for authentication errors: `docker-compose logs -f`

### Classes Not Showing
- Ensure you're connected to YMCA (green status indicator in header)
- Click the refresh button to fetch latest classes
- Try using the search bar - it automatically fetches full month of classes
- Check if your preferred locations in Settings are too restrictive
- Verify your YMCA has classes scheduled for the date range

### Auto-Signup Not Working
- Verify auto-signup is enabled (green toggle) in Tracked Classes tab
- Check the signup timing is set correctly (hours before class)
- Review Booked Classes tab for error messages
- Ensure matching criteria aren't too restrictive (use Preview feature)
- System checks every 5 minutes - signup happens at the right time window
- Look for YMCA authentication issues (re-connect if needed)

### Tracking Not Finding Classes
- Use the **Preview Matches** button when tracking to see what will match
- Try relaxing criteria: allow any instructor or use fuzzy time matching
- Check day of week and location are correct
- Verify the class type/service name matches exactly

### Docker Issues
- Ensure port 3001 is not in use: `lsof -i :3001`
- Check Docker logs: `docker-compose logs -f`
- Rebuild after updates: `docker-compose up -d --build`
- Database persists in `./data` directory - delete to reset

## Security Notes

### Built-in Security Features
- 🔐 **Multi-Layer Authentication**: Admin login + YMCA authentication
- 🔒 **Encrypted Storage**: YMCA credentials are encrypted in the database using bcrypt
- 🛡️ **Session Management**: Secure session-based authentication with auto-generated secrets
- 🌐 **Web-Safe**: Protected endpoints - all API routes require authentication

### For Production Deployment
- **Set SESSION_SECRET**: Generate and set in `.env` for persistent sessions
- **Use HTTPS**: Deploy behind reverse proxy with TLS (Railway, nginx, etc.)
- **Strong Passwords**: Use strong, unique admin credentials
- **Regular Updates**: Keep dependencies updated for security patches
- **Secure Environment**: Never commit `.env` to version control

### Password Requirements
- Admin username: Minimum 3 characters
- Admin password: Minimum 8 characters (enforced at setup)
- YMCA credentials: Your actual YMCA login credentials

## Development

### Project Structure
```
ymca-signup/
├── server/               # Backend Node.js application
│   ├── index.js         # Main Express server with all API routes
│   ├── database.js      # SQLite database layer with migrations
│   ├── config.js        # Configuration management
│   ├── logger.js        # Winston logging
│   └── services/        # Business logic services
│       ├── authService.js      # YMCA authentication via Puppeteer
│       ├── classService.js     # Class fetching and matching
│       └── schedulerService.js # Cron-based auto-signup scheduler
├── client/              # Frontend React application
│   ├── src/
│   │   ├── App.jsx              # Main app with routing & auth
│   │   ├── api.js               # Axios instance with interceptors
│   │   ├── components/          # React components
│   │   │   ├── ClassBrowser.jsx     # Browse & search classes
│   │   │   ├── TrackedClasses.jsx   # Manage tracked classes
│   │   │   ├── TrackClassModal.jsx  # Smart tracking config
│   │   │   ├── SignupLogs.jsx       # Booked classes & history
│   │   │   ├── Settings.jsx         # Settings management UI
│   │   │   ├── Setup.jsx            # First-run setup wizard
│   │   │   ├── Login.jsx            # Admin login
│   │   │   └── ConfirmDialog.jsx    # Confirmation dialogs
│   │   └── index.css    # Tailwind styles
│   ├── package.json
│   └── vite.config.js
├── data/                # Persistent data directory (mounted volume)
│   └── database.db      # SQLite database (auto-created)
├── Dockerfile           # Multi-stage Docker build
├── docker-compose.yml   # Production deployment config
├── package.json         # Backend dependencies & scripts
└── .env.example         # Example environment file (optional)
```

### Tech Stack
- **Backend**: Node.js 18+, Express, SQLite3, node-cron, Puppeteer, bcrypt
- **Frontend**: React 18, Vite, TailwindCSS, Lucide React, Axios, Fuse.js, react-hot-toast
- **Database**: SQLite with encrypted credentials storage
- **Auth**: Express-session with bcrypt password hashing
- **Deployment**: Docker, Docker Compose, Railway-ready

## Key Features Explained

### 🎯 Smart Class Tracking
Instead of tracking individual class instances, you define matching rules. For example:
- **Track "Yoga with Sarah on Mondays at 6pm"** - Gets you every Monday class
- **Track "Any Spin class on Tuesdays"** - Flexible instructor
- **Track "Pilates around 10am ±30min"** - Flexible timing

The Preview feature shows exactly what will match before you commit!

### 📍 Location Filtering
In Settings, select your preferred YMCA locations. The app will only fetch and show classes from those locations, making browsing faster and more relevant.

### ⚡ Infinite Scroll
The class browser loads quickly with initial classes, then seamlessly loads more as you scroll. Search mode fetches the full month for comprehensive results.

### 🔄 Zero Configuration Required
No `.env` files to edit, no command-line setup. Just run Docker Compose, open your browser, and configure everything through the beautiful web UI.

## Contributing

To extend this application:

1. **Add new API endpoints** in `server/index.js`
2. **Create new services** in `server/services/`
3. **Add UI components** in `client/src/components/`
4. **Update database schema** in `server/database.js` (uses migrations)
5. **Test locally** with `npm run dev`
6. **Build & test** with `docker-compose up --build`

## Support & Resources

### For Issues
- **Application Bugs**: Check `docker-compose logs -f` for detailed error messages
- **YMCA Account Issues**: Contact your local YMCA or verify credentials at [YMCA Triangle](https://ymca-triangle.fisikal.com)
- **Fisikal API**: [API Documentation](https://www.cuttingedge.fisikal.com/api/unified/docs)

### Helpful Commands
```bash
# View logs in real-time
docker-compose logs -f

# Restart the application
docker-compose restart

# Reset everything (deletes database!)
docker-compose down && rm -rf data/ && docker-compose up -d

# Access database directly
docker-compose exec ymca-signup sqlite3 /app/data/database.db
```

## License

MIT - Free to use and modify

## Acknowledgments

- Built for YMCA Triangle area locations (Durham, Raleigh, Chapel Hill, Cary, etc.)
- Uses Fisikal's class management system
- Designed for reliability and ease of use

---

**Happy Class Signing! 🏋️‍♀️🧘‍♂️💪**
