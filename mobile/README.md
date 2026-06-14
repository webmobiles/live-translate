# Hellovia Translate — Mobile (Android)

React Native app built with Expo. Connects to `https://translate.hellovia.app`.

---
## Install

cd /Users/dave/projects/live-translate/mobile
rm -rf node_modules
#The root cause was one thing: expo package installed without its JS build files. Everything else was a symptom of that.
npm install expo@54 --legacy-peer-deps
npm install --legacy-peer-deps
npx expo start --clear

## Development

```bash
npm install
npx expo start
```

Scan the QR code with the Expo Go app on your phone.

---

## Publish to Google Play Store

### Prerequisites

- Free [Expo account](https://expo.dev) (for EAS Build)
- Google Play Developer account ($25 one-time at [play.google.com/console](https://play.google.com/console))
- Node.js installed
- `npx eas` works (no global install needed)

---

### Step 1 — Generate app icons

Requires the `canvas` package (one-time install):

```bash
npm install canvas
node assets/generate-icons.mjs
```

This creates:
- `assets/icon.png` — 1024×1024 app icon
- `assets/adaptive-icon.png` — 1024×1024 Android adaptive icon
- `assets/splash.png` — splash screen

> Replace these files with your final artwork before submitting to the store.

---

### Step 2 — Configure environment

Create `mobile/.env` (already done, do not commit to git):

```env
EXPO_PUBLIC_SERVER_URL=https://translate.hellovia.app
```

---

### Step 3 — Link your Expo account

```bash
npx eas login
npx eas build:configure
```

`build:configure` writes your `projectId` into `app.json`. Commit that change.

---

### Step 4 — Build the AAB for Play Store

```bash
npx eas build --platform android --profile production
```

- Takes ~15 minutes
- On first run EAS creates and stores a keystore (signing key) in the cloud — keep it safe, you need it for every future update
- When done, EAS gives you a download link for the `.aab` file

> **Never lose your keystore.** Without it you cannot publish updates to the same Play Store listing.

---

### Step 5 — Upload to Google Play Console

1. Go to [play.google.com/console](https://play.google.com/console)
2. Create a new app → "Hellovia Translate"
3. Go to **Testing → Internal testing → Create new release**
4. Upload the `.aab` file
5. Fill in release notes and save

---

### Step 6 — Store listing (required before publishing)

In the Play Console under **Store presence → Main store listing**:

| Field | Value |
|---|---|
| App name | Hellovia Translate |
| Short description | Real-time AI voice translation across languages (max 80 chars) |
| Full description | Up to 4000 chars — describe the app features |
| Category | Tools or Communication |
| Screenshots | Min 2 phone screenshots (1080×1920 recommended) |
| Feature graphic | 1024×500 PNG banner |
| Icon | 512×512 PNG (separate from the one in `assets/`) |

---

### Step 7 — Content rating

In the Play Console: **Policy → App content → Rating**

Fill out the questionnaire (takes ~5 min). Answer:
- Contains voice recording: **yes**
- Violence / adult content: **no**

---

### Step 8 — Privacy policy (required)

Google requires a public privacy policy URL because the app records audio.

Add a `/privacy` route to the Express server, or host a simple page at:

```
https://translate.hellovia.app/privacy
```

Paste that URL in Play Console under **Policy → App content → Privacy policy**.

Minimum content to include:
- What data is collected (voice audio, nickname, language preference)
- How it is used (real-time translation only)
- Data retention (audio is not stored permanently)
- Contact email

---

### Step 9 — Submit for review

In Play Console, promote the release from Internal Testing to **Production** and submit. Google reviews the first release in **3–7 days**. Subsequent updates are usually approved the same day.

---

## App config reference

| Field | Value |
|---|---|
| Package name | `app.hellovia.translate` — **permanent, cannot be changed** |
| Version | `1.0.0` (update `version` + increment `versionCode` for each release) |
| Bundle tool | EAS Build (Expo Application Services) |
| Build output | `.aab` (Android App Bundle) |
| Min permissions | `RECORD_AUDIO`, `READ_MEDIA_IMAGES`, `INTERNET` |

---

## Publishing updates

For every new release:

1. Increment `versionCode` in `app.json` (e.g. 1 → 2)
2. Update `version` string if needed (e.g. `1.0.1`)
3. Run `npx eas build --platform android --profile production`
4. Upload the new `.aab` in Play Console → Internal Testing → New release
5. Promote to Production

---

## Nginx + SSL (server side)

The app connects via WebSocket. Nginx config for `translate.hellovia.app`:

```nginx
server {
    listen 80;
    server_name translate.hellovia.app;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

Add SSL with Certbot:

```bash
sudo certbot --nginx -d translate.hellovia.app
```

> When you add Cloudflare proxy later, enable **WebSockets** in Cloudflare dashboard → Network → WebSockets.
