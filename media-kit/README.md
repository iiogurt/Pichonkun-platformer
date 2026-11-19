# Pichonkun media kit

Everything you need to make a short social-media video (Reels, Shorts, TikTok) or post about
*Pichonkun and the Clean Air Adventure*. Nothing in this folder is used by the game itself.

## What's inside

| Path | What it is |
|---|---|
| [`boards/character-board-1-heroes.png`](boards/character-board-1-heroes.png) | Heroes and friends, with one-line roles and the core palette (1920 × 1080) |
| [`boards/character-board-2-villains.png`](boards/character-board-2-villains.png) | Smogmaw, the two other bosses and all 8 enemy types (1920 × 1080) |
| [`boards/character-board-3-pichonkun.png`](boards/character-board-3-pichonkun.png) | Pichonkun model sheet: poses, 12-frame run cycle, reward skins (1920 × 1080) |
| [`boards/cast-poster-vertical.png`](boards/cast-poster-vertical.png) | Vertical 9:16 cast poster, ready as a cover or end card (1080 × 1920) |
| [`sprites/`](sprites/) | Every character as a transparent PNG, enlarged 8× with sharp pixels, plus 8 Pichonkun poses |
| [`animations/`](animations/) | Looping transparent GIFs, plus the separate PNG frames of each one for video editors |
| [`DESIGN.md`](DESIGN.md) | Graphics and design guide: art style, palette with hex codes, character design notes, the look of every level |
| [`WORLD-AND-STORY.md`](WORLD-AND-STORY.md) | The world, the full story, the characters with their lines, and the eco messages |
| [`make-media-kit.js`](make-media-kit.js) | The script that renders all the images from the game's code |

More material elsewhere in the repo: in-game screenshots of every level in
[`../docs/screenshots/`](../docs/screenshots/) and a real-time gameplay clip in
[`../docs/gameplay.gif`](../docs/gameplay.gif).

### Animation speeds

The GIFs already play at these speeds. If you import the PNG frames into a video editor,
use the same frame rate.

| Animation | Frames | fps |
|---|---|---|
| `pichonkun-run` | 12 | 15 |
| `pichonkun-idle` | 6 | 7 |
| `angel-fly` | 4 | 8 |
| `smogmaw`, `dust-baron`, `mold-queen` | 4 | 6 |
| enemies, `water-drop`, `air-crystal` | 4 (germ fly 2) | 8 (germ fly 10) |

## Tips for video

- **Scale pixel art with "nearest neighbour"** (no smoothing) and by whole numbers, or it will look blurry.
- **Use the game's own colours** for text and backgrounds: navy `#0D1B5E`, cyan `#1CB8F2`,
  cream `#FDF5E6`, gold `#FFC81E`. See [`DESIGN.md`](DESIGN.md).
- **Record real gameplay** at full screen in a browser from https://iiogurt.github.io/Pichonkun-platformer/.
  The game is 16:9; for a vertical video, place it in the middle and put text above and below,
  as in the vertical poster.
- **Sound:** the game's chiptune music and effects are made live in the browser, so screen-record
  with sound on to capture them.

## A 30-second video idea

| Time | Picture | Text / voice |
|---|---|---|
| 0–3 s | Black, then Smogmaw (`animations/smogmaw.gif`) grows on a grey background | "Breezeville's air is in trouble..." |
| 3–7 s | A little drop falls; Pichonkun (`pichonkun-idle.gif`) lands and looks around | "...but a tiny droplet just woke up." |
| 7–15 s | Fast cuts of real gameplay: Morning Meadow, Smog Street, Frosty Coils | "Run, jump, and splash the germs clean!" |
| 15–19 s | Angel flies in (`angel-fly.gif`) | "Play clean and your guardian Angel comes to help." |
| 19–24 s | Boss fight with Smogmaw (gameplay) | "Can one drop beat a giant smog cloud?" |
| 24–27 s | The sky turns from grey to blue | "Even a single drop can start a big change." |
| 27–30 s | `cast-poster-vertical.png` as an end card | "Free in your browser: link in bio" |

Hashtag ideas: `#pixelart` `#indiegame` `#platformer` `#retrogaming` `#cleanair` `#ecofriendly` `#gamedev`

## Regenerating

The images are drawn by the game's code, so if a character changes, run this from the
repository root to redraw everything:

```bash
node media-kit/make-media-kit.js
```

It needs `npm install` and Chrome, the same as `npm test`. The GIFs also need `ffmpeg`; without
it, only the PNG frames are written.
