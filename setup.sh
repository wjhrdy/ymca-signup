#!/bin/bash

echo "🏊 YMCA Auto-Signup Setup Script"
echo "================================"
echo ""

if [ ! -f .env ]; then
    echo "Creating .env file from template..."
    cp .env.example .env
    echo "✓ Created .env file"
    echo ""
    echo "⚠️  IMPORTANT: Edit .env and add your YMCA credentials!"
    echo ""
else
    echo "✓ .env file already exists"
    echo ""
fi

if command -v docker &> /dev/null && command -v docker-compose &> /dev/null; then
    echo "Docker detected. You can run the application with:"
    echo "  docker-compose up -d"
    echo ""
elif command -v node &> /dev/null; then
    echo "Node.js detected. Installing dependencies..."
    npm run install-all
    echo ""
    echo "✓ Dependencies installed"
    echo ""
    echo "You can run the application with:"
    echo "  npm run dev     (development mode)"
    echo "  npm run build && npm start  (production mode)"
    echo ""
else
    echo "❌ Neither Docker nor Node.js found!"
    echo "Please install Docker or Node.js 18+ to continue."
    exit 1
fi

echo "📝 Next steps:"
echo "  1. Edit .env with your YMCA credentials"
echo "  2. Start the application using one of the commands above"
echo "  3. Open http://localhost:3001 in your browser"
echo ""
echo "For more information, see README.md"
