# Portal

A sleek, minimalist, containerized real-time media synchronization portal for **YouTube** and **Plex** across tailnets (or local networks).

**Portal** runs as a self-contained web service, utilizing a native HTML5 `<video>` player and Socket.io WebSockets to synchronize seeking, playing, and pausing in real time across any number of connected browser clients.

---

## Key Features

1. **Minimalist Responsive Aesthetics**: Styled in a Zinc-dark palette with clean, low-contrast typography and a unified command input bar.
2. **Edge-to-Edge Fluid Resizing**: Spans 100% of the window width, preserving aspect ratio natively. 
3. **Height-Adaptive Layout (Header/Footer Hiding)**: A dynamic Javascript resize listener monitors viewport constraints relative to the video height, automatically hiding the top header and footer details on short screens so you can resize your desktop browser into a compact floating view without vertical cropping or scrollbars.
4. **🔴 Live Stream Sync**: Auto-detects livestreams and renders a red **🔴 Live** button. Clicking it seeks to the live edge (using a buffer-safe 2-second offset), and automatically jumps all other connected clients to the live edge in sync.
5. **Autoplay Bypass & Drift Correction**:
   - **Bypass**: Triggers playback on first click anywhere on the page if autoplay is blocked by browser policies.
   - **Sync Drift Correction**: Calculates connection latency and drift since the last server state update (`(Date.now() - state.updatedAt) / 1000`) on page load/seek, ensuring newly joining clients snap to the exact second active on other devices.
6. **Modular Stream Resolvers**:
   - **YouTube**: Resolves standard and live videos on the fly using containerized `yt-dlp`.
   - **Plex**: Resolves detail links to direct play stream URLs (`.mp4`) or transcode `.m3u8` playlists using Plex's Universal Transcoder.
7. **CORS & IP-Bypassing Media Proxy**: Integrated streaming proxy (`/api/proxy`) that streams manifests/video chunks, bypasses CORS blocks, and locks Google Video streams to the portal's outbound network signature.
8. **PWA & Bookmarklet casting**:
   - Fully PWA-compliant with local vector assets (`/icon.svg`) and **Web Share Target** for mobile app sharing.
   - Draggable "Cast to Portal" bookmarklet badge for desktop browsers.

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
