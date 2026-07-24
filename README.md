# Horsin' Around

The first local prototype for **horsinaround.io**: a top-down 16-bit meadow
where a horse can move in eight directions.

## Run locally

From PowerShell:

```powershell
./server.ps1
```

Then open <http://localhost:8080>.

Use **WASD** to move. Diagonal movement is normalized to the same speed as
horizontal and vertical movement.

- Hold **Ctrl** to walk slowly.
- Move without a modifier to trot.
- Hold **Shift** to canter.
- Keep moving with **Shift** held for 4.5 seconds to enter a full gallop.

## Project layout

- `src/game.js` — Phaser scene, controls, camera, and meadow
- `src/styles.css` — full-window game presentation
- `public/assets/horse/` — eight generated directional horse sprites
- `vendor/phaser.min.js` — locally pinned Phaser runtime
