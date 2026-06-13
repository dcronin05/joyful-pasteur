const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 8080;

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// In-memory media state
let mediaState = {
  service: 'youtube', // 'youtube' or 'plex'
  url: 'https://www.youtube.com/watch?v=aAhm880quUg', // default Donald Trump name removal video!
  videoId: 'aAhm880quUg',
  timestamp: 0,
  isPlaying: false,
  updatedAt: Date.now()
};

// Helper to extract YouTube video ID from URL
function extractYouTubeId(url) {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

// Helper to extract Plex metadata key
function extractPlexMetadataKey(url) {
  try {
    const parsedUrl = new URL(url);
    let key = parsedUrl.searchParams.get('key');
    if (!key && parsedUrl.hash) {
      const hashQuery = parsedUrl.hash.substring(parsedUrl.hash.indexOf('?'));
      if (hashQuery) {
        const hashParams = new URLSearchParams(hashQuery);
        key = hashParams.get('key');
      }
    }
    return key;
  } catch (e) {
    console.error('Failed to parse Plex URL:', e);
    return null;
  }
}

const PLEX_SERVER_URL = process.env.PLEX_SERVER_URL;
const PLEX_TOKEN = process.env.PLEX_TOKEN;
const { exec } = require('child_process');

// Stream URL Resolvers
const resolvers = {
  youtube: async (url) => {
    return new Promise((resolve, reject) => {
      exec(`yt-dlp -4 -f "best[ext=mp4]/best" --get-url "${url}"`, (error, stdout, stderr) => {
        if (error) {
          reject(stderr || error.message);
        } else {
          resolve(stdout.trim());
        }
      });
    });
  },
  plex: async (url) => {
    if (!PLEX_SERVER_URL || !PLEX_TOKEN) {
      console.log('Plex Server URL or Token not configured, returning null stream URL (fallback to external link)');
      return null;
    }

    const metadataKey = extractPlexMetadataKey(url);
    if (!metadataKey) {
      throw new Error('Could not extract metadata key from Plex URL');
    }

    const plexApiUrl = `${PLEX_SERVER_URL}${metadataKey}`;
    console.log('Fetching metadata from Plex API:', plexApiUrl);

    const response = await fetch(plexApiUrl, {
      headers: {
        'Accept': 'application/json',
        'X-Plex-Token': PLEX_TOKEN
      }
    });

    if (!response.ok) {
      throw new Error(`Plex API request failed with status ${response.status}`);
    }

    const data = await response.json();
    const metadata = data.MediaContainer?.Metadata?.[0];
    if (!metadata) {
      throw new Error('No metadata found for Plex item');
    }

    const media = metadata.Media?.[0];
    const part = media?.Part?.[0];
    if (!part) {
      throw new Error('No media parts found for Plex item');
    }

    // Check if container and codecs are direct playable in standard browsers
    const isDirectPlayable = (media.container === 'mp4' || media.container === 'mov') &&
                             (media.videoCodec === 'h264') &&
                             (media.audioCodec === 'aac' || media.audioCodec === 'mp3');

    if (isDirectPlayable) {
      const streamUrl = `${PLEX_SERVER_URL}${part.key}?X-Plex-Token=${PLEX_TOKEN}`;
      console.log('Plex Direct Play stream URL resolved');
      return streamUrl;
    } else {
      // Transcode to HLS playlist (.m3u8) using Plex Universal Transcoder
      const transcodeUrl = new URL(`${PLEX_SERVER_URL}/video/:/transcode/universal/start.m3u8`);
      transcodeUrl.searchParams.set('path', metadata.key);
      transcodeUrl.searchParams.set('mediaIndex', '0');
      transcodeUrl.searchParams.set('partIndex', '0');
      transcodeUrl.searchParams.set('protocol', 'hls');
      transcodeUrl.searchParams.set('videoResolution', '1920x1080');
      transcodeUrl.searchParams.set('maxVideoBitrate', '10000');
      transcodeUrl.searchParams.set('videoCodec', 'h264');
      transcodeUrl.searchParams.set('audioCodec', 'aac');
      transcodeUrl.searchParams.set('X-Plex-Token', PLEX_TOKEN);
      transcodeUrl.searchParams.set('fastSeek', '1');
      transcodeUrl.searchParams.set('directPlay', '0');
      transcodeUrl.searchParams.set('directStream', '1');
      transcodeUrl.searchParams.set('subtitleSize', '100');
      transcodeUrl.searchParams.set('audioBoost', '100');
      
      const streamUrl = transcodeUrl.toString();
      console.log('Plex Transcoded HLS stream URL resolved');
      return streamUrl;
    }
  }
};

// GET stream URL endpoint
app.get('/api/stream-url', async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) return res.status(400).send('Missing url');

  console.log('Extracting stream URL for:', videoUrl);

  try {
    let service = 'youtube';
    if (videoUrl.includes('plex.tv') || videoUrl.includes('/web/index.html') || videoUrl.includes(':32400')) {
      service = 'plex';
    }

    const resolver = resolvers[service];
    if (!resolver) {
      return res.status(400).json({ error: 'Unsupported service' });
    }

    const streamUrl = await resolver(videoUrl);
    if (streamUrl) {
      // Return a proxied URL so that the client makes requests to this server instead of Google/Plex directly.
      // This resolves the CORS restrictions and client IP checks.
      const proxiedUrl = `${req.protocol}://${req.get('host')}/api/proxy?url=${encodeURIComponent(streamUrl)}`;
      res.json({ streamUrl: proxiedUrl });
    } else {
      res.json({ streamUrl: null });
    }
  } catch (error) {
    console.error('Resolution error:', error);
    res.status(500).json({ error: 'Failed to extract stream URL', details: error.message || error });
  }
});

// GET media proxy endpoint (resolves CORS and IP address locks)
const { Readable } = require('stream');
app.get('/api/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('Missing url');

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    // Forward the Range header if requested by the client browser (critical for Safari/iOS)
    if (req.headers.range) {
      headers['Range'] = req.headers.range;
    }

    const response = await fetch(targetUrl, { headers });

    // Allow 200 OK or 206 Partial Content
    if (!response.ok && response.status !== 206) {
      return res.status(response.status).send(`Failed to fetch remote resource: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    
    // Add CORS headers to bypass browser blocks
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    
    const cleanUrlPath = targetUrl.split('?')[0];
    const isM3u8 = contentType.includes('mpegurl') || 
                   contentType.includes('mpegURL') || 
                   contentType.includes('x-mpegurl') ||
                   cleanUrlPath.endsWith('.m3u8');

    if (isM3u8) {
      // It's an HLS manifest. We need to rewrite the segment/sub-playlist URLs on the fly.
      const text = await response.text();
      const lines = text.split('\n');
      const rewrittenLines = lines.map(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
          // Route through this proxy
          return `${req.protocol}://${req.get('host')}/api/proxy?url=${encodeURIComponent(trimmed)}`;
        }
        return line;
      });
      
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.send(Buffer.from(rewrittenLines.join('\n')));
    } else {
      // Binary segment (.ts) or progressive video file (.mp4)
      res.status(response.status); // Forward 200 or 206 Partial Content status
      res.setHeader('Content-Type', contentType);
      
      const contentLength = response.headers.get('content-length');
      if (contentLength) res.setHeader('Content-Length', contentLength);
      
      const acceptRanges = response.headers.get('accept-ranges');
      if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);

      const contentRange = response.headers.get('content-range');
      if (contentRange) res.setHeader('Content-Range', contentRange);

      // Pipe the stream
      const nodeStream = Readable.fromWeb(response.body);
      nodeStream.pipe(res);
    }
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).send('Proxy error: ' + error.message);
  }
});

// GET state
app.get('/api/state', (req, res) => {
  res.json(mediaState);
});



// Helper to process shared URL and broadcast it
function updateMedia(url) {
  if (!url) return false;
  
  let service = 'youtube';
  let videoId = extractYouTubeId(url);
  
  if (url.includes('plex.tv') || url.includes('/web/index.html') || url.includes(':32400')) {
    service = 'plex';
  } else if (!videoId) {
    service = 'youtube'; // Fallback default
  }

  mediaState = {
    service: service,
    url: url,
    videoId: videoId || '',
    timestamp: 0,
    isPlaying: true,
    updatedAt: Date.now()
  };

  // Broadcast to all connected clients
  io.emit('media-change', mediaState);
  return true;
}

// POST share (from PWA Web Share Target)
app.post('/api/share', (req, res) => {
  const url = req.body.url || req.body.text || req.body.title;
  console.log('Shared link received (POST):', url);
  
  const urlRegex = /(https?:\/\/[^\s]+)/;
  const match = url ? url.match(urlRegex) : null;
  const cleanUrl = match ? match[1] : null;

  if (cleanUrl && updateMedia(cleanUrl)) {
    res.redirect('/');
  } else {
    res.status(400).send('Invalid URL shared');
  }
});

// GET share (from Bookmarklet)
app.get('/api/share', (req, res) => {
  const url = req.query.url;
  console.log('Shared link received (GET):', url);
  
  if (url && updateMedia(url)) {
    res.redirect('/');
  } else {
    res.status(400).send('Missing or invalid url parameter');
  }
});

// WebSockets Syncing
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Send current state to newly connected client
  socket.emit('init-state', mediaState);

  // Listen for state changes (play, pause, seek)
  socket.on('state-change', (data) => {
    if (data.updatedAt > mediaState.updatedAt) {
      mediaState.timestamp = data.timestamp;
      mediaState.isPlaying = data.isPlaying;
      mediaState.updatedAt = data.updatedAt;
      
      // Broadcast update to all OTHER clients
      socket.broadcast.emit('state-change', mediaState);
    }
  });

  // Listen for manual URL submissions from the UI
  socket.on('media-change', (data) => {
    updateMedia(data.url);
  });

  // Listen for client-side JS debugging errors
  socket.on('debug-error', (data) => {
    console.error('*** CLIENT CONSOLE ERROR ***', data);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Tailnet Media Sync Portal running on port ${PORT}`);
});
