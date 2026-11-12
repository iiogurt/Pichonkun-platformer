<div align="center">

# 💧 Pichonkun and the Clean Air Adventure

**A 10-level pixel-art platformer about clean air, air conditioning and ecology. It runs in any web browser.**

[![Play now](https://img.shields.io/badge/%E2%96%B6%20PLAY%20NOW-in%20your%20browser-1cb8f2?style=for-the-badge)](https://iiogurt.github.io/Pichonkun-platformer/)

[![CI](https://github.com/iiogurt/Pichonkun-platformer/actions/workflows/ci.yml/badge.svg)](https://github.com/iiogurt/Pichonkun-platformer/actions/workflows/ci.yml)
[![Deploy to GitHub Pages](https://github.com/iiogurt/Pichonkun-platformer/actions/workflows/pages.yml/badge.svg)](https://github.com/iiogurt/Pichonkun-platformer/actions/workflows/pages.yml)
[![Latest release](https://img.shields.io/github/v/release/iiogurt/Pichonkun-platformer?sort=semver&color=1565d8)](https://github.com/iiogurt/Pichonkun-platformer/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
![HTML5 Canvas](https://img.shields.io/badge/HTML5-canvas-e34f26?logo=html5&logoColor=white)
![Vanilla JS](https://img.shields.io/badge/JavaScript-no%20dependencies-f7df1e?logo=javascript&logoColor=black)

<img src="docs/screenshots/title.png" alt="Title screen" width="720">

</div>

## The story

Breezeville's air was always fresh thanks to the **Great Air Conditioner** on the town hall.
Then **Smogmaw**, a greedy cloud of pollution, crawled out of the old factory and clogged every filter
with dust, pollen and germs.

**Pichonkun**, a tiny droplet of condensation born in the AC's cooling coil, sets out to wash the
air clean. His journey goes through meadows and smoggy streets, into the air conditioner itself
(intake ducts, filters, frozen coils, the drain and the compressor) and finally up to Smogmaw's sky.

## Features

- 🎮 **10 levels** with rising difficulty, each with its own look, music and mechanics
- 💦 **Action**: shoot water splashes (also diagonally up), squish enemies, and unlock the **Vapor Jump**
- 🦠 **8 enemy types**: pollen, pollen-spitting flowers, bacteria, dust bunnies, spiky viruses, smog clouds, mold turrets, germ flies
- 👑 **3 boss fights**: Dust Baron, Mold Queen and Smogmaw
- 🧩 **14 easy riddles** about water, filters, fans and energy saving, plus **3 lever puzzles**. Wrong answers get a hint.
- 💬 **Story and characters**: Leafa, Prof. Mesh, Frosty, Buzzby and Granny Cloud, with an 🌱 eco tip after every level
- 🎵 **Chiptune music and sound effects**, made live with WebAudio
- 💾 **Auto-save** at checkpoints and milestones, plus **Continue** and **Level Select**
- 📱 Works with keyboard or touch controls

## Screenshots

| | |
|---|---|
| ![Morning Meadow](docs/screenshots/level-01-meadow.png) | ![Smog Street](docs/screenshots/level-03-smog-street.png) |
| **1 · Morning Meadow** | **3 · Smog Street** |
| ![The Intake Duct](docs/screenshots/level-04-intake-duct.png) | ![Frosty Coils](docs/screenshots/level-06-frosty-coils.png) |
| **4 · The Intake Duct** | **6 · Frosty Coils** |
| ![Drip Drain](docs/screenshots/level-07-drip-drain.png) | ![Smokestack Factory](docs/screenshots/level-09-factory.png) |
| **7 · Drip Drain** | **9 · Smokestack Factory** |
| ![Riddle](docs/screenshots/riddle.png) | ![Boss: Smogmaw](docs/screenshots/boss-smogmaw.png) |
| **Air-Q riddle gates** | **Final boss: Smogmaw** |
| ![Dialogue](docs/screenshots/dialog.png) | ![Level select](docs/screenshots/level-select.png) |
| **Story and dialogue** | **Level select** |

## How to play

**Online:** https://iiogurt.github.io/Pichonkun-platformer/

**Offline:** download the zip from the [latest release](https://github.com/iiogurt/Pichonkun-platformer/releases/latest),
unzip it and open `index.html`.

### Controls

| Action | Keyboard |
|---|---|
| Move | ← → / A D |
| Jump (hold = higher, press again in air = Vapor Jump) | Z / Space / K |
| Shoot water splash | X / J |
| Aim upward | hold ↑ / W while shooting |
| Talk · answer riddle · pull lever | ↑ / W / E (when the arrow prompt shows) |
| Drop through a thin platform | ↓ + Jump |
| Pause | Esc / P |
| Music on/off | M |

On phones and tablets, on-screen buttons appear automatically.

### Levels

| # | Level | New in this level |
|---|---|---|
| 1 | Morning Meadow | Tutorial, pollen, the first riddle gate |
| 2 | Pollen Peaks | Spring pads, pollen-spitting flowers |
| 3 | Smog Street | Rooftop gaps, smog clouds, water-cycle lever puzzle |
| 4 | The Intake Duct | **Vapor Jump**, updrafts, crumbling blocks, moving lifts |
| 5 | Filter Fortress | Mold turrets · 👑 **Dust Baron** |
| 6 | Frosty Coils | Slippery ice, spiky flu viruses |
| 7 | Drip Drain | Toxic sludge, vertical lifts, germ flies · 👑 **Mold Queen** |
| 8 | Compressor Core | Conveyor belts, hot vents, "eco AC setup" puzzle |
| 9 | Smokestack Factory | Everything at once, the 3 R's puzzle |
| 10 | Smogmaw's Sky | Cloud platforms · 👑 **Smogmaw** |

### Saving

The game saves to your browser's `localStorage` at these points:

- reaching a ⛳ checkpoint
- solving a riddle or puzzle
- getting the Vapor Jump
- defeating a boss
- clearing a level

A **SAVED** badge appears in the corner each time.

## Development

The game is plain HTML5 canvas and JavaScript with **no runtime dependencies** and no build step.
Node is only needed for the dev tools.

```bash
npm install
npm run serve        # play at http://localhost:8000
npm run check        # lint + level validation + headless smoke test
npm run screenshots  # regenerate docs/screenshots
```

```
index.html          page shell and touch controls
style.css
js/font.js          5x7 bitmap font
js/sprites.js       pixel-art sprites, shaded tiles, parallax backgrounds
js/audio.js         WebAudio chiptune synth, music tracks, sound effects
js/levels.js        level maps (ASCII), story, dialogue, riddles
js/world.js         physics, player, enemies, bosses
js/game.js          game states, UI, rendering, saving, input
tools/              level validator, smoke test, screenshot generator
style_cards/        character style reference
```

Every push and pull request runs [CI](.github/workflows/ci.yml): ESLint, level-data validation,
and a headless Chrome test. That test plays all 10 levels and checks riddles, puzzles, bosses,
saving and the ending. Pushes to `main` deploy to GitHub Pages, and `v*` tags publish a
[release](https://github.com/iiogurt/Pichonkun-platformer/releases).

## Contributing

Ideas for levels, riddles and enemies are very welcome. See [CONTRIBUTING.md](CONTRIBUTING.md),
the [Roadmap](ROADMAP.md) and the [Changelog](CHANGELOG.md).

## License

[MIT](LICENSE) © iiogurt
