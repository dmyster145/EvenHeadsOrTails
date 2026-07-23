# Heads or Tails

Coin flip for **Even Realities G2** smart glasses: swipe up to flip a coin on the 576×288 HUD, with an animated tumble, drizzle background, and an optional Heads/Tails tally. Use the touchpad or ring controller (R1).

Prefer dice? Pick **Dice Roll** on the home screen and swipe up to roll a pewter d6.

This project is licensed under the MIT License. See [LICENSE](LICENSE).

## Screenshots

| Home screen |
|-------------|
| ![Home screen with mode picker](assets/home.png) |

| Heads | Heads (flipping) |
|-------|------------------|
| ![Heads result](assets/heads.png) | ![Coin flipping toward heads](assets/heads_flipping.png) |

| Tails (flipping) | Tails |
|------------------|-------|
| ![Coin flipping toward tails](assets/tails_flipping.png) | ![Tails result](assets/tails.png) |

| Dice (rolling) | Dice |
|----------------|------|
| ![Die tumbling over the debris field](assets/dice_rolling_1.png) | ![Rolled six result](assets/dice.png) |

| Dice (rolling) | Dice (rolling) |
|----------------|----------------|
| ![Die tumbling, five face up](assets/dice_rolling_2.png) | ![Die tumbling, four face up](assets/dice_rolling_3.png) |

| Phone UI |
|----------|
| ![Phone preview and settings](assets/phone_UI.png) |

## Quick links

- **In-app help:** Open the app on your phone for a live HUD preview and settings (mode, background, tally). Same page as [index.html](index.html) in this repo.

## Tech stack

- **Runtime:** TypeScript, Vite
- **Glasses:** [Even Hub SDK](https://www.npmjs.com/package/@evenrealities/even_hub_sdk) for containers, 4-bit images, and touchpad/ring events
- **Layout:** [@evenrealities/pretext](https://www.npmjs.com/package/@evenrealities/pretext) for text measurement
- **Images:** [upng-js](https://www.npmjs.com/package/upng-js) for image decoding and encoding

## Project structure

```
EvenHeadsOrTails/
├── index.html        # WebView host + phone preview
├── src/
│   ├── main.ts       # SDK bridge, containers, input routing
│   ├── flip.ts       # Flip animation and result logic
│   ├── roll.ts       # Dice roll animation and result logic
│   ├── dice.ts       # Die face and tumble image processing
│   ├── layout.ts     # Container definitions
│   ├── drizzle.ts    # Background animation frames
│   ├── assets.ts     # Coin and banner image loading
│   ├── bridgeQueue.ts# Serial BLE bridge-call queue
│   ├── keepAlive.ts  # WebView keep-alive (audio + Web Lock)
│   ├── storage.ts    # Tally + settings persistence
│   └── preview.ts    # Phone-side HUD mirror
├── public/coin/      # Coin frame art (heads/tails, half, rotated)
├── public/dice/      # Dice art (see assets/dice-asset-spec.md)
├── app.json          # Even Hub manifest
└── vite.config.ts    # Dev server (port 5173, LAN binding)
```

## Prerequisites

- **Even Realities:** G2 glasses and the [Even App](https://www.evenrealities.com/), so you can open the widget on your glasses.
- **Node.js:** v20.19.0 or newer. [Download Node.js](https://nodejs.org/) if you don't have it.

## Setup

1. **Clone and install**
   - Open a terminal (Command Prompt, PowerShell, or Terminal app).
   - Clone the repo (use the project’s clone URL from GitHub, or your fork):
     ```bash
     git clone https://github.com/dmyster145/EvenHeadsOrTails.git
     cd EvenHeadsOrTails
     ```
   - Install dependencies:
     ```bash
     npm install
     ```

2. **Run locally**
   ```bash
   npm run dev
   ```
   - You’ll see a local URL (e.g. `http://localhost:5173`). Keep this terminal open while you use the app.

3. **Open on the glasses**
   - **Simulator:** `npm run simulate` to run the desktop simulator against the dev server.
   - **Real glasses:** `npx evenhub qr --url http://<your-computer-ip>:5173` and scan the QR code with the Even App to open the widget on your G2 glasses.

4. **Try it**
   - On your **phone:** Open the same URL in a browser to see the [help page](index.html) with a live HUD preview and settings.
   - On your **glasses:** Pick a mode on the home screen, then swipe up to flip or roll.

## Usage on the glasses

- **Swipe up:** Flip the coin, or roll the die in dice mode. Swipe up on a result to go again.
- **Tap / swipe down:** Dismiss the result and return to the idle prompt.
- **Double-tap:** Open the settings menu (home, background, tally, exit); double-tap again to close it. On the home screen, double-tap opens the exit prompt.

## Scripts

| Command            | Description               |
|--------------------|---------------------------|
| `npm run dev`      | Start dev server          |
| `npm run build`    | Build for production      |
| `npm run preview`  | Preview production build  |
| `npm run simulate` | Run the desktop simulator |
| `npm run pack`     | Pack into an `.ehpk`      |

## Build and pack

```bash
npm run build
npm run pack
```

`build` outputs to `dist/`; `pack` produces `heads-or-tails.ehpk` for distribution. Deploy `dist/` to any static host, then open the deployed URL in the Even App to use the widget in production.

## Features (summary)

- **Fair flips:** Outcomes use `crypto.getRandomValues()` for a true 50/50.
- **Dice mode:** Roll a pewter pip d6. The die tumbles through isometric poses over a decelerating debris field, then settles onto the rolled face. Rolls are unbiased (rejection sampling).
- **Animated tumble:** Multi-frame coin/die rotation over a drizzle background.
- **Tally counter:** Optional running Heads/Tails totals (or roll count and last roll in dice mode), persisted across sessions, with a reset option.
- **Settings (phone + glasses):** Mode, background pattern, tally counter, reset on startup, and reset on demand, from the phone page or the on-glasses menu.
