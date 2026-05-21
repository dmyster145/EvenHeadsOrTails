# Heads or Tails

Coin flip for **Even Realities G2** smart glasses. Tap or double-tap to flip; animated drizzle and coin art on the 576×288 HUD.

This project is licensed under the MIT License — see [LICENSE](LICENSE).

## Tech stack

- **Runtime:** TypeScript, Vite
- **Glasses:** [Even Hub SDK](https://www.npmjs.com/package/@evenrealities/even_hub_sdk) — containers, 1-bit images, touchpad/ring events
- **Layout:** [@evenrealities/pretext](https://www.npmjs.com/package/@evenrealities/pretext) for text measurement

## Prerequisites

- **Even Realities** — G2 glasses and the [Even App](https://www.evenrealities.com/)
- **Node.js** — v20.19.0 or newer

## Setup

1. **Clone and install**

   ```bash
   git clone https://github.com/dmyster145/EvenHeadsOrTails.git
   cd EvenHeadsOrTails
   npm install
   ```

2. **Run locally**

   ```bash
   npm run dev
   ```

3. **Open on glasses**

   - **Simulator:** `npm run simulate`
   - **Real glasses:** `npx evenhub qr --url http://<your-ip>:5173` and scan with the Even Hub companion app.

## Pack for distribution

```bash
npm run build
npm run pack
```

Produces `heads-or-tails.ehpk`.

## Project structure

```
EvenHeadsOrTails/
├── index.html       # WebView host + phone preview
├── src/
│   ├── main.ts      # SDK bridge, containers, input
│   ├── flip.ts      # Flip animation and result logic
│   ├── layout.ts    # Container definitions
│   ├── drizzle.ts   # Background animation frames
│   └── assets.ts    # Coin image loading
├── app.json         # Even Hub manifest
└── vite.config.ts   # Dev server (port 5173, LAN binding)
```
