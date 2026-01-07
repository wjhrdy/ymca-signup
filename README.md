# YMCA Auto-Signup

Automatically signs you up for YMCA classes at the right time. You track the classes you want, and the app handles registration when spots open up.

## Deploy

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/MMEviu?referralCode=yfSbnH)

## What it does

This app monitors YMCA classes and registers you automatically based on rules you set. Instead of manually checking and signing up at 2am when registration opens, the app does it for you.

**Main features:**
- Browse and search YMCA classes
- Track classes with flexible matching (specific instructor, any time on Mondays, etc.)
- Auto-signup at a set time before class starts (default 46 hours)
- View your registration history
- Web UI for everything, no config files needed

**Stack:**
- Backend: Node.js + Express + SQLite
- Frontend: React + Vite + TailwindCSS
- Deployment: Docker or Railway

## Prerequisites

- Docker and Docker Compose (recommended)
- OR Node.js 18+ (for local development)
- YMCA Triangle account credentials

## Quick Start

**Using Docker (recommended):**

```bash
docker-compose up -d
```

Then open `http://localhost:3001` in your browser.

**First-time setup:**
1. Create an admin account (username + password)
2. Log in with those credentials
3. Go to Settings and enter your YMCA email/password
4. Click "Connect YMCA" in the header
5. Start tracking classes

**Optional - Persistent sessions:**

By default, your session expires when the server restarts. To keep sessions alive:

```bash
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Add the output to .env as SESSION_SECRET=<value>
```

## Local Development

Install dependencies:
```bash
npm run install-all
```

Start dev servers:
```bash
npm run dev
```

This runs the backend on `http://localhost:3001` and frontend on `http://localhost:3000`.

Build for production:
```bash
npm run build
npm start
```

You don't need a `.env` file. Everything is configured through the Settings UI.

## How to use it

### Setup
1. Create an admin account (min 8 characters for password)
2. Log in
3. Go to Settings and add your YMCA email/password
4. Click "Connect YMCA" in the header

### Settings (optional)
You can configure:
- **Preferred Locations** - Which YMCAs to monitor (blank = all)
- **Check Interval** - How often to check for classes (default: 5 minutes)
- **Default Signup Hours** - When to auto-signup (default: 46 hours before class)
- **Days Ahead** - How many days of classes to fetch (default: 7)

### Browse classes
- Go to the Browse Classes tab
- Search by name, instructor, or location
- Scroll to load more (infinite scroll)
- Click "Track" to set up auto-signup for a class
- Click "Sign Up Now" for immediate registration

### Track classes
When you track a class, you set matching rules:
- **Match Instructor** - Specific instructor or any
- **Match Exact Time** - Exact time or within a tolerance window
- **Auto-Signup** - Turn auto-signup on/off
- **Signup Hours Before** - When to register (overrides default)

Use "Preview Matches" to see what classes will match your rules before saving.

Examples:
- Track "Yoga with Sarah on Mondays at 6pm" (specific match)
- Track "Any instructor's Tuesday Spin class" (flexible instructor)
- Track "Pilates around 10am ±30 minutes" (flexible time)

### Manage tracked classes
- Go to Tracked Classes tab
- Toggle auto-signup on/off for each class
- Edit matching rules or timing
- Remove classes you don't want anymore

### View history
- Go to Booked Classes tab
- See all your registrations (auto and manual)
- Check signup status and error messages

## How auto-signup works

Every 5 minutes, a cron job:
1. Fetches upcoming classes from YMCA
2. Compares them against your tracked classes
3. For each match, checks if it's time to sign up (current time >= class time - signup hours)
4. Attempts registration via the Fisikal API
5. Logs the result to the database

The matching system uses:
- **Class type** (required) - e.g., "Yoga"
- **Location** (required) - e.g., "Downtown Durham YMCA"
- **Day of week** (required) - e.g., "Monday"
- **Instructor** (optional) - Specific instructor or any
- **Time** (flexible) - Exact time or within a tolerance window

The default signup time is 46 hours before class because YMCA usually opens registration 48 hours ahead. Signing up at 46 hours puts you near the front of the queue.

## Database

SQLite database with these tables:

**tracked_classes** - Classes you're monitoring
- Stores matching rules (instructor, time, location, day)
- Auto-signup settings per class

**signup_logs** - Registration history
- Success/failure status
- Error messages if signup failed

**settings** - App configuration
- Preferred locations, check interval, etc.

**credentials** - YMCA account info
- Email and password (encrypted with bcrypt)

## API

All endpoints except `/api/auth/setup-status`, `/api/auth/setup`, and `/api/auth/user-login` require authentication.

**Auth:**
- `GET /api/auth/setup-status` - Check if setup is needed
- `POST /api/auth/setup` - Create first admin user
- `POST /api/auth/user-login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/session` - Get current session
- `POST /api/auth/login` - Connect to YMCA

**Settings:**
- `GET /api/settings` - Get settings
- `PUT /api/settings` - Update settings
- `GET /api/credentials/status` - Check if YMCA credentials exist
- `PUT /api/credentials` - Save YMCA credentials

**Classes:**
- `GET /api/classes?startDate=&endDate=&locationId=&limit=&offset=` - Fetch classes
- `GET /api/tracked-classes` - Get tracked classes
- `POST /api/tracked-classes` - Track a class
- `POST /api/tracked-classes/preview` - Preview matches
- `PUT /api/tracked-classes/:id` - Update tracked class
- `DELETE /api/tracked-classes/:id` - Delete tracked class

**Signup:**
- `POST /api/signup/:occurrenceId` - Register for a class
- `DELETE /api/signup/:occurrenceId` - Cancel registration
- `GET /api/signup-logs` - Get signup history

## Configuration

You can configure everything through the Settings UI. Environment variables are optional.

**Environment variables:**
- `NODE_ENV` - development or production (default: production)
- `PORT` - Server port (default: 3001)
- `SESSION_SECRET` - Session encryption key (auto-generated if not set)
- `YMCA_EMAIL` - Your YMCA email (use Settings UI instead)
- `YMCA_PASSWORD` - Your YMCA password (use Settings UI instead)
- `YMCA_URL` - YMCA web URL (default: https://ymca-triangle.fisikal.com)
- `API_BASE_URL` - Fisikal API URL (default: https://ymca-triangle.fisikal.com/api/web)

**Settings UI:**
- YMCA credentials (encrypted in database)
- Preferred locations
- Check interval (how often to look for classes)
- Default signup timing
- Days ahead to fetch

## Docker commands

```bash
# Start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down

# Rebuild after code changes
docker-compose up -d --build

# Access database
docker-compose exec ymca-signup sqlite3 /app/data/database.db

# Reset everything (deletes database)
docker-compose down && rm -rf data/ && docker-compose up -d
```

## Troubleshooting

**Can't login:**
- Make sure you completed initial setup
- Check YMCA credentials in Settings are correct
- Click "Connect YMCA" to authenticate
- Check logs: `docker-compose logs -f`

**Classes not showing:**
- Make sure you're connected (green indicator)
- Click refresh to fetch classes
- Check if preferred locations are too restrictive
- Try searching - it fetches more classes

**Auto-signup not working:**
- Check auto-signup toggle is on in Tracked Classes
- Verify signup timing is correct
- Look at Booked Classes for error messages
- Use Preview to check if matching rules are too strict
- The system checks every 5 minutes

**Tracking not finding classes:**
- Use Preview Matches to see what will match
- Relax criteria (allow any instructor, use time tolerance)
- Verify class name, day, and location are correct

**Docker issues:**
- Check port 3001 is free: `lsof -i :3001`
- Check logs: `docker-compose logs -f`
- Database is in `./data` - delete to reset

## Security

**Built-in:**
- Admin login required for all endpoints
- YMCA credentials encrypted with bcrypt in database
- Session-based authentication
- Auto-generated session secrets

**For production:**
- Set `SESSION_SECRET` in `.env` for persistent sessions
- Use HTTPS (deploy behind nginx or use Railway/similar)
- Use strong admin passwords (8+ characters)
- Keep dependencies updated
- Don't commit `.env` to git

## Project structure

```
ymca-signup/
├── server/
│   ├── index.js              # Express server + API routes
│   ├── database.js           # SQLite + migrations
│   ├── config.js             # Config management
│   ├── logger.js             # Logging
│   └── services/
│       ├── authService.js    # YMCA auth (Puppeteer)
│       ├── classService.js   # Class fetching + matching
│       └── schedulerService.js # Cron scheduler
├── client/
│   └── src/
│       ├── App.jsx           # Main app
│       ├── api.js            # Axios setup
│       └── components/       # React components
├── data/                     # Database (Docker volume)
├── Dockerfile
└── docker-compose.yml
```

**Tech stack:**
- Backend: Node.js, Express, SQLite, node-cron, Puppeteer
- Frontend: React, Vite, TailwindCSS, Lucide icons
- Auth: express-session + bcrypt

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
