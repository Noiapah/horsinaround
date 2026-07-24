# Horsin' Around

The first local prototype for **horsinaround.io**: a top-down 8-bit meadow
where a horse can move in eight directions across an 8000 × 6000 field.

## Run locally

From PowerShell:

```powershell
./server.ps1
```

Then open <http://localhost:8080>.

Use **WASD** to move. Diagonal movement is normalized to the same speed as
horizontal and vertical movement.

- Hold **V** to walk slowly.
- Move without a modifier to trot.
- Hold **Shift** to canter.
- Keep moving with **Shift** held for 4.5 seconds to enter a full gallop.

Each direction has one standing image and a four-frame leg cycle (forward,
down, backward, recovery). The cycle runs faster for each faster gait. The
east/west profiles keep the visible eye, and the faster gaits kick up dust over
an animated ground shadow.

The horse has three hearts and the meadow contains solid fences and puddles.
V-walking into an obstacle is safe; hitting one at a trot costs one heart,
at a canter costs two, and at a gallop costs all three. Losing every heart
returns the horse to the starting position with three restored hearts.

## Project layout

- `src/game.js` — Phaser scene, controls, camera, and meadow
- `src/styles.css` — full-window game presentation
- `public/assets/horse/animation/` — five PNG frames for each of eight directions
- `public/assets/horse/animation-preview.png` — all idle and movement frames
- `scripts/build-animation-assets.ps1` — reproducible sprite-sheet converter
- `vendor/phaser.min.js` — locally pinned Phaser runtime
