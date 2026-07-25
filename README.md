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
- Press **Space** to jump over puddles and fences.
- Press **E** at a marked doorway to enter or leave a facility.

Each direction has one standing image and a four-frame leg cycle (forward,
down, backward, recovery). The cycle runs faster for each faster gait. The
east/west profiles keep the visible eye, and the faster gaits kick up dust over
an animated ground shadow.

The horse has three hearts and the meadow contains colorful flower patches,
solid fences, and puddles.
V-walking into an obstacle is safe; hitting one at a trot costs one heart,
at a canter costs two, and at a gallop costs all three. Losing every heart
returns the horse to the starting position with three restored hearts.
Obstacle collision and damage are disabled while the horse is airborne.

## Facilities

Three authored structures are placed in the meadow:

- **Meadow Stable** — an enterable stall and feed-room interior.
- **Horse Hospital** — entering restores all three hearts.
- **Trotting Track** — a four-checkpoint timed lap with a saved personal best.

Each facility is a separate Phaser scene. Its graphics and collision layout are
created on the first visit, then the scene sleeps and is reused on later visits.
The meadow also sleeps while the horse is indoors, so leaving a facility returns
to the existing world and its already-loaded chunks instead of rebuilding it.

## Progress and world streaming

Browser progress uses a versioned serializable model containing lives, current
location, facility position, save revision, and track records. The older
position-only save format is migrated automatically. Progress is saved every
five seconds, during transitions, and when the page closes.

Loaded meadow and interior positions are checked against boundaries and solid
colliders. Unsafe positions search outward on a 64-pixel grid before falling
back to a known entrance.

Grass details and flower patches are generated in deterministic 1024 × 1024
chunks. Only the player’s current chunk and its neighbors remain active, so the
meadow can gain more landmarks without generating every decoration at boot.
New chunks are queued by distance and limited to one per frame to avoid a
noticeable frame-time spike when the horse crosses a chunk boundary.

## Project layout

- `src/game.js` — Phaser scene, controls, camera, and meadow
- `src/styles.css` — full-window game presentation
- `public/assets/horse/animation/` — five PNG frames for each of eight directions
- `public/assets/horse/animation-preview.png` — all idle and movement frames
- `scripts/build-animation-assets.ps1` — reproducible sprite-sheet converter
- `vendor/phaser.min.js` — locally pinned Phaser runtime
