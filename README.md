# Horsin' Around

**Horsin' Around** is a local prototype for **horsinaround.io**, built with
[Phaser](https://phaser.io/). It is a top-down, single-player horse game with
8-bit artwork, eight-direction movement, jumping, speed-based obstacle damage,
enterable facilities, local progress saving, and a timed Circus Maximus
racetrack with collectible coins.

The project currently runs entirely in the browser. Phaser 3.90.0 and all game
assets are included in the repository, so there is no package installation or
external asset download.

## Quick start

From PowerShell in the project directory:

```powershell
./server.ps1
```

Open <http://localhost:8080> in a browser. To use another port:

```powershell
./server.ps1 -Port 3000
```

Press `Ctrl+C` in the terminal to stop the server.

The included server is a loopback-only development server. It intentionally
serves only the game's approved static files and should not be exposed directly
to the internet.

## Controls

The controls and horse HUD are shared across the meadow, stable, hospital, and
racetrack.

| Input | Action |
| --- | --- |
| **WASD** | Move in eight directions |
| **V** | Hold while moving to walk |
| **Shift** | Hold while moving to canter and charge a gallop |
| **Space** | Jump over eligible obstacles |
| **E** | Enter or leave a nearby facility, or select a displayed stable horse |

Diagonal movement is normalized, so it is not faster than horizontal or
vertical movement.

### Gaits and obstacle damage

| Gait | How to use it | Speed | Hearts lost on impact |
| --- | --- | ---: | ---: |
| Walk | Hold **V** while moving | 110 | 0 |
| Trot | Move without a speed modifier | 240 | 1 |
| Canter | Hold **Shift** while moving | 345 | 2 |
| Gallop | Keep cantering for 4.5 seconds | 470 | 3 |

The horse has three hearts. Puddles and fences block the horse in the meadow,
but they do not cause damage during a slow walk or while the horse is airborne.
Losing all hearts returns the horse to the starting position and restores all
three hearts.

Each of the eight directions has one idle frame and a four-frame movement cycle.
Animation speed increases with the gait, the side profiles show the horse's
eye, and cantering and galloping produce hoof-dust effects.

## HUD and minimap

The compact top-left HUD shows:

- Three heart icons.
- The current gait.
- The horse's current speed.
- A gallop-charge bar that fills linearly during the 4.5-second canter.
- Gallop-charge percentage while cantering.
- The persistent coin-account balance.

The bottom-right minimap is visible in the meadow, stable, and hospital. It
keeps the horse or current facility centered, plots nearby puddles and fences,
and uses distinct markers for each facility. Distant facility markers are
clamped to the map edge.

The minimap is intentionally hidden inside the Circus Maximus so the race view
stays uncluttered. Race status and the live lap timer appear in the top-right
corner instead.

## World and facilities

The meadow is an 8000 × 6000 world containing deterministic grass details,
flower patches, puddles, fences, and three enterable structures:

- **Meadow Stable** — an authored stall and feed-room interior.
- **Horse Hospital** — restores all three hearts for 20 coins. Healthy horses
  are not charged, and healing is refused when the account balance is too low.
- **Circus Maximus** — a large Roman-inspired oval with stone stands, a central
  spina, turning posts, checkpoint markers, and a visible exit gate.

All facilities use the same movement, gait, jump, interaction, and HUD systems
as the meadow. Ordinary interior obstacles can be jumped, while boundary walls
remain solid.

### Stable horse selection

The Meadow Stable displays three selectable horse skins: **Chestnut**,
**Palomino**, and **Midnight**. Stand before a displayed horse and press **E**
to select it. The selected skin is applied in every area and remains selected
after leaving the stable or reloading the game.

### Circus Maximus laps

Cross the checkered starting line and follow the checkpoint route around the
arena. The live timer:

- Starts when the first lap begins.
- Displays elapsed time as `MM:SS.mmm`.
- Saves a personal best in browser progress.
- Resets at the finish line and immediately times the next continuous lap.

Twelve pixel coins are placed between the ordered race checkpoints. Each coin
adds one coin to the persistent account and disappears when collected. The set
respawns after a valid completed lap and whenever the arena is entered again.
Coins can be spent on a full heal at the Horse Hospital.

The arena exit is marked by a bright ground arrow and animated **EXIT** sign.
Move near it and press **E** to return to the meadow.

Each facility is a separate Phaser scene. Its graphics and collision layout are
created on the first visit, then the scene sleeps and is reused. The meadow also
sleeps while the horse is indoors, so returning does not rebuild the world or
its loaded chunks.

## Progress and world streaming

Progress is stored in browser `localStorage` using a versioned, serializable
model containing:

- Remaining lives.
- Current world or facility location.
- Validated horse position.
- Coin-account balance.
- Selected horse skin.
- Save revision and timestamp.
- Racetrack records.

Older position-only saves are migrated automatically. Progress is saved every
five seconds, during scene transitions, and when the page closes. A short-lived
tab lease prevents two open copies from overwriting each other, and best-time
records are merged when save ownership changes.

Loaded meadow and facility positions are validated against boundaries and solid
colliders. If a saved position is unsafe after a map update, the game searches
outward on a 64-pixel grid for a safe replacement.

Meadow decoration is generated in deterministic 1024 × 1024 chunks. Only the
horse's current chunk and its neighbors remain active. New chunks are ordered by
distance and limited to one per frame, which keeps first load and traversal
responsive as the map expands.

## Development

Run the portable server and asset checks:

```powershell
./scripts/test-project.ps1
```

The checks also run dependency-free gameplay-logic tests and launch an
installed Chrome or Edge browser in headless mode for a Phaser startup smoke
test. They cover gait transitions, facing and collider rules, save conflict
reconciliation, asset integrity, server path handling, and module startup.

Rebuild all 40 runtime animation frames from the checked-in source sheets:

```powershell
./scripts/build-animation-assets.ps1 -Force
```

Rebuild the Chestnut, Palomino, and Midnight runtime sheets from those canonical
frames and the checked-in Palomino semantic mask:

```powershell
./scripts/build-horse-skins.ps1
```

Chestnut and Midnight use exact palette remaps. Palomino has its own golden
coat palette plus a semantic flaxen atlas, so its pale mane and tail remain
separate from dark hooves and moving leg shadows. Rebuild that atlas from the
checked-in design reference with:

```powershell
./scripts/build-palomino-mask.ps1
```

The full animation rebuild runs both mask and skin builders automatically.

Each generated skin sheet is 640 x 1024 pixels. Its eight rows contain `n`,
`ne`, `e`, `se`, `s`, `sw`, `w`, and `nw`; its five 128 x 128 columns contain
the idle frame followed by walk frames 0 through 3.

Build the static production bundle:

```powershell
./scripts/build-release.ps1
```

The release is written to `dist/` and contains only the HTML, CSS, game code,
pinned Phaser runtime, and runtime horse animation assets. Source artwork and
animation working files are excluded.

## Deployment and current limitations

The generated `dist/` directory can be hosted by any static web server or CDN.
For AWS, a typical first deployment would use a private S3 bucket behind
CloudFront with HTTPS and the future domain pointed at the distribution.

The current game is single-player and has no application server, user accounts,
or shared profile database. Progress belongs to one browser installation and
does not synchronize across devices. Online profiles and server-backed progress
will require an authenticated API and persistent database in a later phase.

## Project layout

- `index.html` — browser entry point.
- `src/game.js` — progress model, world generation, and Phaser scenes.
- `src/game-core.js` — testable gait, facing, collider, and save-merging rules.
- `tests/game-core.test.js` — dependency-free browser tests for core rules.
- `src/styles.css` — full-window game presentation.
- `server.ps1` — restricted loopback development server.
- `public/assets/horse/animation/` — 40 canonical frames plus the generated
  Chestnut, Palomino, and Midnight runtime sheets.
- `public/assets/horse/source/` — checked-in directional animation source
  sheets plus the Palomino design reference and semantic flaxen atlas.
- `public/assets/horse/animation-preview.png` — complete animation preview.
- `scripts/build-animation-assets.ps1` — directional source-sheet converter.
- `scripts/build-horse-skins.ps1` — runtime horse-skin sheet builder.
- `scripts/build-palomino-mask.ps1` — deterministic Palomino semantic-atlas
  builder.
- `scripts/test-project.ps1` — server and runtime-asset validation.
- `scripts/test-game-core.ps1` — browser logic tests and startup smoke test.
- `scripts/build-release.ps1` — static deployment packager.
- `vendor/phaser.min.js` — pinned local Phaser runtime.
