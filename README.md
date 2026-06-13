# Portable n.eko Virtual Browser (IaC)

A portable, self-contained infrastructure-as-code repository to deploy **n.eko** (a self-hosted virtual browser streamed via WebRTC) using Docker Compose. 

This setup runs a single, persistent Google Chrome instance on your server. All connected devices (laptops, phones, tablets) act as real-time interactive screens to that exact same browser session, meaning:
- You get native, uncompromised YouTube UI (or other streaming apps).
- You can sign in and keep your history/subscriptions.
- You get perfect session handoff: you can start watching on a laptop, and then immediately pick up and control the exact same player/tab from your phone by visiting the portal URL.

---

## Architecture & Configuration

This deployment is fully parameterized using a `.env` file to support IaC orchestration.

### 1. Copy the Configuration Template
Copy `.env.example` to `.env` before running the stack:
```bash
cp .env.example .env
```

### 2. Crucial IaC Variables
- `NEKO_WEBRTC_NAT1TO1`: **MUST** be set to the server's IP address (e.g. its Tailscale IP like `100.79.77.74` or its DNS name). This allows the WebRTC protocol to establish a direct media streaming connection to your client devices.
- `NEKO_WEBRTC_PORT_RANGE`: A UDP port range (default `52000-52100`) mapped to the host. Ensure these UDP ports are open on the host's firewall (Tailscale interface allows this by default).
- `NEKO_PROFILE_VOLUME`: Maps the browser profile directory to persist settings, logged-in YouTube sessions, and extensions (like adblockers) across container restarts.

---

## Deployment

To deploy the container stack:
```bash
docker compose up -d
```

To tear down the container stack:
```bash
docker compose down
```

---

## How to Get the Floating (Always-on-Top) Player

Since n.eko streams Chrome via WebRTC inside a standard web page, you can achieve a perfect floating, resizable player on macOS and Windows without extra software:

1. Open the n.eko portal in **Chrome, Edge, or Safari** on your computer.
2. In the n.eko portal, double click the virtual browser's video stream or go full screen.
3. Right-click on the browser's video element (you might need to right-click twice in Chrome to bypass the custom player context menu and get the browser's native context menu).
4. Select **"Picture-in-Picture"** (or **"Enter Picture-in-Picture"**).
5. The WebRTC stream will pop out into a floating, resizable, always-on-top window that you can drag between monitors!
