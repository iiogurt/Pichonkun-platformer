# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/iiogurt/Pichonkun-platformer/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/iiogurt/Pichonkun-platformer/releases/tag/v1.0.0
