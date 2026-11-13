# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.1] - 2026-11-13

### Fixed

- Pichonkun's face looked distorted: the eyes and mouth were warped by the
  squash-and-stretch animation and clipped by the edge of the head. They are
  now hand-placed pixel shapes (round ring eyes, cat mouth) that move as one
  piece, on a slightly wider, rounder head closer to the original design.
- Raised arms no longer cover the face in the jump, fall, hurt and happy poses.

## [1.1.0] - 2026-11-12

A complete graphics overhaul. Gameplay, levels and saves are unchanged.

### Added
- **Procedural pixel-art engine** (`js/gfx.js`): sprites and terrain are painted per pixel from
  shape maths with colour ramps, ordered dithering and outlines, at twice the old pixel density.
- **New Pichonkun**: redrawn to match the style card, with an 8-frame run, breathing idle, blink,
  jump, fall, land, hurt, shoot and happy poses, plus squash and stretch.
- **All enemies, bosses and NPCs redrawn** with shading and animation. Bosses have their own
  full-size art (the Dust Baron's top hat and monocle, the Mold Queen's crown, Smogmaw's teeth).
- **Painted terrain** per theme instead of repeating tiles: grass overhangs, soil layers and buried
  stones, brickwork with moss or soot, riveted panels with glowing seams, filter pleats, cracked
  ice with snow caps and icicles, and puffy clouds.
- **Decorative props**: flowers, bushes, mushrooms, street lamps, hydrants, AC units, crates,
  barrels, valves, chains, cobwebs, ice crystals and glowing mushrooms.
- **Parallax backdrops** with animation: drifting clouds, windmills, blinking city windows,
  spinning duct fans, an aurora, sludge waterfalls, pistons, factory smoke, twinkling stars and
  lightning.
- **Dynamic lighting**: dark levels are lit by Pichonkun, lamps, pickups, sludge, shots and bosses.
  Glowing things get a bloom halo.
- **Weather and particles**: petals, snow, embers, ash, dust motes, wind streaks, dripping pipes,
  landing dust, impact rings and sparkles.
- **Polish**: iris-in transition, hit-stop on impacts, animated water and sludge surfaces, a new
  title screen with an animated logo, redesigned HUD, panels, boss bar and level-select.
- **Graphics option** (FANCY or FAST) in the title and pause menus. The game switches to FAST by
  itself if a device can't keep up.

### Changed
- Rendering moved out of `game.js` into `render.js`. Terrain, backdrops and sprites each have
  their own module.

## [1.0.0] - 2026-11-12

First public release. Play it at https://iiogurt.github.io/Pichonkun-platformer/

### Added
- **10 levels** with rising difficulty and their own look and music:
  Morning Meadow, Pollen Peaks, Smog Street, The Intake Duct, Filter Fortress,
  Frosty Coils, Drip Drain, Compressor Core, Smokestack Factory and Smogmaw's Sky.
- **Pichonkun**, a water-droplet hero who runs, jumps with variable height, shoots water splashes
  (also diagonally upward) and squishes enemies. The **Vapor Jump** (double jump) is unlocked in level 4.
- **8 enemy types**: pollen, pollen-spitting flowers, bacteria, dust bunnies, spiky viruses,
  smog clouds, mold turrets and germ flies.
- **3 boss fights**: Dust Baron, Mold Queen and the final boss Smogmaw.
- **Riddles and puzzles**: 14 easy eco and air-conditioning riddles that open gates, with hints for
  wrong answers, plus 3 lever-order puzzles (water cycle, eco AC setup, the 3 R's).
- **Story**: intro and ending, NPCs with dialogue (Leafa, Prof. Mesh, Frosty, Buzzby, Granny Cloud),
  boss speeches, tutorial signs and an eco tip after every level.
- **Level mechanics**: one-way platforms, springs, updrafts, crumbling blocks, conveyor belts, ice,
  moving lifts, spikes and toxic sludge.
- **Audio**: chiptune music (12 tracks) and sound effects, generated with WebAudio.
- **Auto-save** to `localStorage` at checkpoints, solved riddles and puzzles, the power-up, boss
  defeats and level clears. The title screen has Continue and Level Select.
- **Graphics**: full-colour pixel art with shaded sprites, textured tiles, parallax backgrounds,
  glow and lighting effects.
- Touch controls on mobile devices.
- Tooling: ESLint, a level-data validator, a headless Chrome smoke test and a screenshot generator.
- GitHub Actions for CI, GitHub Pages deployment and tagged releases.

[Unreleased]: https://github.com/iiogurt/Pichonkun-platformer/compare/v1.1.1...HEAD
[1.1.1]: https://github.com/iiogurt/Pichonkun-platformer/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/iiogurt/Pichonkun-platformer/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/iiogurt/Pichonkun-platformer/releases/tag/v1.0.0
