# Metro Dash

A Subway Surfers–style 3D endless runner that runs entirely in the browser.
Built with [three.js](https://threejs.org) and Vite. No login, no download, no
server — open the page and play.

Everything you see is generated in code: the character, trains, barriers,
coins and city are built from primitives at runtime, and all the audio is
synthesized in WebAudio. There are no image, model or sound files to load, so
the whole game is one ~160 kB gzipped bundle.

## Play locally

```bash
npm install
npm run dev            # http://localhost:5173
npm run dev -- --host  # also serve on your LAN, to test on a phone
```

## Build

```bash
npm run build     # static site in dist/
npm run preview   # serve the built site locally
```

`dist/` is plain static files and works on any host. `base` is set to `'./'`
in `vite.config.js`, so it runs from a domain root or any subpath without
reconfiguration.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Switch lane | `←` `→` or `A` `D` | swipe left / right |
| Jump | `↑`, `W` or `Space` | swipe up, or tap |
| Roll | `↓` or `S` | swipe down |
| Fast-fall | roll while airborne | swipe down while airborne |
| Hoverboard | double-tap `Space` | double-tap |
| Pause | `Esc` or `P` | pause button |

## How it plays

- **Three lanes.** Trains, barriers and beams stream toward you; the world
  moves and the player stays put, which avoids float drift on long runs.
- **Train roofs are surfaces.** Jump onto a low train and run along the top.
  Hitting one from the side is a crash; landing on it is not.
- **Ramps** launch you onto roofs you couldn't otherwise reach.
- **Power-ups:** Magnet (pulls coins in), 2× Score, Jetpack (flies you over
  everything along a coin trail) and Super Sneakers (higher jumps).
- **Hoverboard:** you start each run with one charge and earn another every
  1,000 points. It absorbs a single crash, then breaks.
- Speed ramps up continuously toward a cap, and harder obstacle layouts unlock
  as you go.

Best score and lifetime coins are kept in `localStorage`. Nothing is uploaded.

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` builds and publishes on every push to `main`.

```bash
git remote add origin git@github.com:<you>/<repo>.git
git push -u origin main
```

Then in the repository: **Settings → Pages → Source → GitHub Actions**. The
next push publishes to `https://<you>.github.io/<repo>/`.

Any other static host works too — drop `dist/` on Netlify, Vercel, itch.io or
an S3 bucket.

## Code layout

```
src/
├── config.js              every tunable: speeds, physics, spawn rates, palette
├── main.js                bootstrap + WebGL capability check
└── game/
    ├── Game.js            state machine and the fixed-timestep loop
    ├── World.js           renderer, camera rig, lights, adaptive quality
    ├── Track.js           segment streaming, parallax city, tunnels
    ├── Patterns.js        obstacle layouts + the solvability validator
    ├── Player.js          lane/jump/roll physics and the run cycle
    ├── Spawner.js         obstacle, coin and pickup placement (all pooled)
    ├── Collision.js       AABB tests and ground-height queries
    ├── PowerUps.js        power-up timers
    ├── Effects.js         pooled particles and camera shake
    ├── Input.js           keyboard + touch, with input buffering
    ├── Hud.js             DOM overlay and menus
    ├── Audio.js           synthesized SFX and music
    ├── Storage.js         localStorage persistence
    └── models/            procedural geometry builders
```

### Two design details worth knowing

**Jumps are speed-scaled.** Jump velocity scales with `s` and gravity with
`s²`, where `s` tracks the current speed. That keeps the apex and the ground
distance of a jump *constant* at every speed — airtime shrinks instead.
Without it, a top-speed jump would sail clean over an 18-unit train rather
than landing on its roof, and every obstacle layout would need re-tuning per
speed band. Rolls are distance-based for the same reason.

**Obstacle layouts are proven clearable.** `Patterns.js` runs a breadth-first
search over (position, lane, vertical state) for every layout at load time,
modelling jump arcs, roll windows, lane-change cooldowns and roof landings. A
layout with no survivable line is dropped rather than shipped. Because jump
and roll distances are speed-invariant, that one static check holds for the
entire run. Add a pattern and it is validated automatically — check the
console for a warning if one gets rejected.

## Tuning

Almost everything lives in `src/config.js`: lane spacing, the speed curve,
jump physics, obstacle dimensions, spawn gaps, difficulty ramp, power-up
durations and the colour palette. Adjust and the change flows through the
game *and* the pattern validator.

## Browser support

Any browser with WebGL — Chrome, Edge, Firefox, Safari, desktop and mobile.
Quality steps down automatically (pixel ratio → shadow resolution → shadows
off) if the frame rate can't hold, and can be pinned in Settings.

## Credits

Original game design by SYBO Games. This is an independently written homage —
no code, art or assets from the original, and not affiliated with it.
