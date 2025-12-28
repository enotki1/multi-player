# JS Multiplayer Fighting Game

A real-time **2D multiplayer fighting game** built with **Node.js, Express and Socket.IO**.  
Players join rooms and fight each other with movement, jumping, attacks and blocking.

---

## Requirements

- **Node.js** v16 or newer
- **npm**
- Modern browser (Chrome / Firefox / Edge)

---

## Installation

Clone the repository and install dependencies:

```bash
git clone <your-repository-url>
cd multi-player
npm install
```

---

## Running the Server

Start the server with:

```bash
npm start
```

or directly:

```bash
node server/server.js
```

The server will run on:

```
http://localhost:3000
```

---

## How to Join a Room

1. Open your browser and go to:

```
http://localhost:3000
```

2. Enter a **Room ID** (any name, e.g. `room1`)
3. Enter your **Player Name**
4. Click **Join**

- Each room supports **2 players**
- When the second player joins, the match starts automatically

---

## Testing Multiplayer on One Computer

You can test multiplayer locally on a single PC.

### Option 1: Two Browser Tabs
1. Open **two browser tabs**
2. Go to `http://localhost:3000` in both
3. Join the **same Room ID**
4. Use different player names

### Option 2: Normal + Incognito
1. Open one normal browser window
2. Open one **Incognito / Private** window
3. Join the same room in both

Each tab/window creates a separate socket connection.

---

## Controls

### Keyboard Controls

| Key | Action |
|---|---|
| **A** | Move Left |
| **D** | Move Right |
| **W** | Jump |
| **Space** | Attack |
| **Shift** | Block |

### Gameplay Notes
- Attacks and physics are **server-authoritative**
- Blocking reduces incoming damage
- You cannot attack while blocking
- Jumping is only possible when on the ground

---

## Project Structure

```
multi-player/
├── public/
│   ├── img/           # Game assets (sprites, background)
│   ├── js/            # Client-side logic
│   ├── index.html
│   └── game.html
├── server/
│   ├── server.js      # Main server + game loop
│   ├── rooms.js       # Room management
│   └── gameState.js   # Game state logic
├── package.json
├── package-lock.json
└── README.md
```

---

## Notes

- Game logic and hit detection run on the **server**
- Client handles rendering and animation
- Designed for learning and prototyping purposes

---

## Troubleshooting

- **Server does not start**
  - Make sure port `3000` is free
  - Restart the server after changes

- **Assets do not load**
  - Ensure `public/img/` exists and contains the sprites

- **Players do not see each other**
  - Make sure both players joined the **same Room ID**

---