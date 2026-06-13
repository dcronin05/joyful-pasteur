# Tailnet Media Sync Portal

A portable, containerized real-time playback synchronization portal for **YouTube** and **Plex** across your desktop and mobile devices. 

This portal uses a native HTML5 `<video>` player paired with Socket.io WebSockets to synchronize seeking, playing, and pausing in real time. Because it runs natively inside the client's browser, it dynamically adapts to any mobile or desktop aspect ratio, handles live HLS stream rendering, and supports native, always-on-top Picture-in-Picture.

---

## Key Features

1. **Native Player & Responsive Layout**: Responsive viewport support without letterboxing. Supports native Picture-in-Picture (PiP) via the browser's native API on macOS, iOS, Windows, and Android.
2. **Modular Stream Resolvers**:
   - **YouTube**: Resolves standard and live videos on the fly using containerized `yt-dlp`.
   - **Plex**: Resolves library item detail links (e.g. `plex.tv` metadata pages) to direct play stream URLs (`.mp4`) or transcode `.m3u8` playlists (using Plex's Universal Transcoder).
3. **CORS & IP-Bypassing Media Proxy**: Contains an integrated streaming proxy (`/api/proxy`) that rewrites HLS manifests on the fly and streams media chunks. This bypasses client-side CORS errors and locks Google Video streams to the portal's outbound network signature.
4. **PWA & Bookmarklet casting**:
   - Registerable as a PWA with a **Web Share Target** (allowing you to "Share" links directly from mobile YouTube/Plex apps).
   - "Cast to Portal" bookmarklet for one-click casting from desktop browsers.
5. **Autoplay & Loopback Protection**: Includes custom browser synchronization states that handle browser autoplay policies and protect against infinite WebSocket state ping-pong loops.

---

## Environment Configuration

This portal is fully parameterizable via Docker Compose and environment variables. Copy the template to initialize your configuration:

```bash
cp .env.example .env
```

### Configuration Variables

| Variable | Description | Example / Default |
| :--- | :--- | :--- |
| `PORTAL_IMAGE` | The target container image tag. | `ghcr.io/dcronin05/joyful-pasteur:latest` |
| `PORTAL_PORT` | The external port for the web interface. | `8080` |
| `PLEX_SERVER_URL` | *(Optional)* The URL of your Plex server. | `http://10.100.15.22:32400` |
| `PLEX_TOKEN` | *(Optional)* Your Plex authentication token. | `YourSecretPlexToken` |

> [!NOTE]
> If `PLEX_SERVER_URL` and `PLEX_TOKEN` are not provided, Plex links shared to the portal will gracefully fall back to a styled UI button redirecting the client to open and watch the video in the official Plex Web/Desktop client.

---

## Deployment & Running

### Running with Docker Compose (Recommended)
Launch the containerized stack in detached mode:
```bash
docker compose up -d
```

#### Hardware Acceleration (GPU)
If you run this portal on a host equipped with an NVIDIA GPU (e.g. Tower) and wish to enable hardware access in the container for future transcoding hooks, uncomment the `deploy` resources section in `docker-compose.yml`:
```yaml
    # deploy:
    #   resources:
    #     reservations:
    #       devices:
    #         - driver: nvidia
    #           count: all
    #           capabilities: [gpu]
```

### Running Locally (Development)
Ensure `Node.js` (v20+), `yt-dlp`, and `ffmpeg` are installed locally and in your system PATH.
```bash
# Install dependencies
npm install

# Start the server (includes IPv4 DNS resolution preference)
node --dns-result-order=ipv4first server.js
```

---

## Integration Guidelines for Other Agents

If another agent is wrapping this sync portal into a custom Tailscale container architecture (e.g. sidecar routing), it should:

1. **Deploy in the same Network Namespace**: Share the network namespace of a Tailscale sidecar container to assign the sync portal a dedicated Tailscale IP on your Tailnet.
2. **Inject Credentials**: Pass the `PLEX_SERVER_URL` and `PLEX_TOKEN` as environment variables directly to the container environment.
3. **Configure Volume Mounts**: (Optional) Mount persistent application states if extending the server. No volume mapping is required for normal operations as media states are held in-memory.
