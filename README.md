# YMCA Auto-Signup Application

A comprehensive web application for automatically signing up for YMCA classes using the Fisikal API. This application monitors your tracked classes and automatically registers you at a predefined time before the class starts (default: 46 hours).

## Features

- 🔐 **Secure Authentication** - API-based authentication with YMCA credentials
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

3. **Edit `.env` with your credentials**
   ```env
   YMCA_EMAIL=your-email@example.com
   YMCA_PASSWORD=your-password
   YMCA_URL=https://ymca-triangle.fisikal.com
   API_BASE_URL=https://ymca-triangle.fisikal.com/api/unified
   PORT=3001
   DEFAULT_SIGNUP_HOURS=46
   ```

4. **Build and run with Docker**
   ```bash
   docker-compose up -d
   ```

5. **Access the application**
   Open your browser to `http://localhost:3001`

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

### 1. Authentication
- Click the **Login** button in the header
- The system will authenticate using your credentials from `.env`
- Authentication happens via API using the Fisikal web service

### 2. Browse Classes
- Navigate to the **Browse Classes** tab
- Adjust date filters to view classes in your desired timeframe
- Click **Refresh** to fetch the latest class list
- Click **Track** to add a class to your tracked list
- Click **Sign Up Now** to immediately register for a class

### 3. Track Classes
- Navigate to the **Tracked Classes** tab
- View all classes you're monitoring
- Toggle **Auto Signup** on/off for each class
- Adjust **signup timing** (hours before class starts)
- Remove classes you no longer want to track

### 4. View Signup History
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

### Status
- `GET /api/status` - System status and authentication state

### Authentication
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
| `YMCA_EMAIL` | Your YMCA account email | Required |
| `YMCA_PASSWORD` | Your YMCA account password | Required |
| `YMCA_URL` | YMCA Fisikal web URL | `https://ymca-triangle.fisikal.com` |
| `API_BASE_URL` | Fisikal API base URL | `https://ymca-triangle.fisikal.com/api/unified` |
| `PORT` | Server port | `3001` |
| `DEFAULT_SIGNUP_HOURS` | Default hours before class to signup | `46` |

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

- Never commit `.env` file to version control
- Keep credentials secure
- Run Docker container with appropriate security settings
- Consider using Docker secrets for production deployments

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
