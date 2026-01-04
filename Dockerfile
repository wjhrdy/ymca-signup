FROM node:18-alpine

RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    python3 \
    make \
    g++

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY client/package*.json ./client/
WORKDIR /app/client
RUN npm ci
WORKDIR /app

COPY . .

WORKDIR /app/client
RUN npm run build

WORKDIR /app

RUN mkdir -p /app/data && \
    cp config.yaml.example /app/data/config.yaml.example

EXPOSE 3001

CMD ["node", "server/index.js"]
