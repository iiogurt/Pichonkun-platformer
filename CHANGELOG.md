# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.5.0] - 2026-11-13

### Added

- **Splash power**: Pichonkun's shot grows in five steps (single, rapid, twin, triple, mega) with
  the water drops collected over the adventure. Shown as PWR pips in the HUD.
- **Pure Air meter**: fills by cleaning enemies (faster with combos), finding crystals and secrets,
  answering riddles first try and hitting bosses. Getting hurt drains it.
- **Angel levels up** from 1 to 5 with what it cleans: longer visits, faster and further shots,
  then two and three splashes at once.
- **Backup and restore** under Options: save all progress to a file, load it back on any device,
  and undo a New Game. The browser is also asked to keep the game's data permanently.

### Changed

- **Angel is now an earned, temporary perk** instead of a permanent companion. A full Pure Air
  meter calls it with C (or the ANGEL touch button) for 15 to 25 seconds.
- Angel is golden and no longer has a halo.
- The wingman on/off option is gone, since calling Angel is now the player's choice.

## [1.4.0] - 2026-11-13

### Added

- **Angel, the guardian wingman**: a winged droplet with a halo that flies beside Pichonkun and
  splashes the nearest enemy or boss in range by itself. It flies through walls, so it never gets
  stuck on obstacles. On by default; switch it off under Options or in the pause menu.
- Angel is introduced in the opening story.

### Changed

- Hints for the selected option on the Options screen moved to the bottom left.

## [1.3.2] - 2026-11-13

### Fixed

- **Run speed**: holding a direction kept accelerating Pichonkun to about three times the intended
  speed (present since 1.0.0). Running is now capped at the designed speed, which makes jumps more
  predictable. All 30 crystals were re-checked and are still reachable.

### Changed

- **Leaderboard names** are now up to 8 characters and typed on the keyboard (Enter to finish,
  Backspace to delete). On touch screens the on-screen buttons pick the letters. The residents on
  the board got their full names. An existing name can be changed under Options.
- The README animation is now one continuous 8-second run of level 1 at 30 frames per second in
  real time. The old clip advanced the game between captured frames, so it looked fast and choppy.

## [1.3.1] - 2026-11-13

### Changed

- During play, the dialogue box appears at the top of the screen when it would otherwise cover
  Pichonkun and the character who is talking.

### Documentation

- README: an animated gameplay clip at the top, a retaken dialogue screenshot, title and story
  screenshots added to the gallery, and the graphics setting described where it now lives (Options).
- `npm run gif` re-records the clip with a scripted bot.

## [1.3.0] - 2026-11-13

### Added

- **18 achievements** with a pop-up when one is earned and an Achievements screen on the title menu.
- **Reward skins**: five new colours for Pichonkun (mint, rose, violet, gold, ember), unlocked by
  finding crystals, earning achievements and finishing the game. Choose one under Options.
- **Hard mode**, unlocked by finishing the game and chosen when starting a New Game: 2 hearts,
  enemies take one more hit, bosses have 50% more health, enemies and bosses act faster, and all
  points are multiplied by 1.5. Hard runs are marked on the leaderboard.
- Achievements, crystals found and unlocked skins are kept across New Game.

### Changed

- The title menu is shorter: music, sound, graphics and skin moved into an **Options** submenu.
- Earlier progress counts: a finished game unlocks hard mode and the violet skin, and crystals
  already found count toward the crystal rewards.

## [1.2.0] - 2026-11-13

Reasons to play again: a score, ranks, hidden treasure and a leaderboard.

### Added

- **Score** shown in the HUD. Points for water drops, cleaning enemies, riddles, puzzles and bosses.
- **Combos**: cleaning enemies in quick succession multiplies the points, up to ×5.
- **End-of-level tally** with bonuses for speed, taking no damage, collecting every drop and
  finding every crystal, and a **rank from D to S**.
- **30 air crystals**, three hidden in every level: above springs and updrafts, past the exit,
  over pits, and inside secret rooms.
- **Secret walls** that look solid but let Pichonkun through. They twinkle faintly now and then.
- **Leaderboard**: a local top-10 table with arcade-style three-letter initials, pre-filled with
  the residents of Breezeville. Open it from the title screen; it is also shown after the credits.
- Level Select shows each level's rank, best score and crystals, plus the total score.
- New sounds for crystals, secrets and combos; Leafa now hints at the crystals.

### Changed

- A heart picked up at full health is worth 200 points instead of being wasted.
- The level-clear screen was redesigned around the score tally.
- Level 10 has one extra cloud step before the boss arena.

### Notes

- Saves from earlier versions keep working. Scores start counting from this version.
- The leaderboard is stored in the browser, like the save. It is not shared between devices.

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

[Unreleased]: https://github.com/iiogurt/Pichonkun-platformer/compare/v1.5.0...HEAD
[1.5.0]: https://github.com/iiogurt/Pichonkun-platformer/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/iiogurt/Pichonkun-platformer/compare/v1.3.2...v1.4.0
[1.3.2]: https://github.com/iiogurt/Pichonkun-platformer/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/iiogurt/Pichonkun-platformer/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/iiogurt/Pichonkun-platformer/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/iiogurt/Pichonkun-platformer/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/iiogurt/Pichonkun-platformer/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/iiogurt/Pichonkun-platformer/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/iiogurt/Pichonkun-platformer/releases/tag/v1.0.0
