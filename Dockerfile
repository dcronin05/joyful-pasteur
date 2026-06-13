FROM node:20-alpine

LABEL org.opencontainers.image.title="Portal"
LABEL org.opencontainers.image.description="Portal - A sleek, minimalist tailnet media sync portal to sync YouTube and Plex playback in real-time across devices."
LABEL org.opencontainers.image.source="https://github.com/dcronin05/joyful-pasteur"
LABEL org.opencontainers.image.licenses="MIT"

# Install python3, ffmpeg, curl and download/install the latest yt-dlp
RUN apk add --no-cache python3 ffmpeg curl && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install --production

# Copy application files
COPY server.js ./
COPY public/ ./public/

EXPOSE 8080

CMD ["node", "--dns-result-order=ipv4first", "server.js"]
