FROM node:18-alpine

RUN apk add --no-cache \
    ca-certificates \
    python3 \
    make \
    g++

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

RUN mkdir -p /app/data

EXPOSE 3001

CMD ["node", "server/index.js"]
