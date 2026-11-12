# Contributing to Pichonkun

Thanks for helping! Bug reports, level ideas, new riddles and code are all welcome.

## Getting started

```bash
git clone https://github.com/iiogurt/Pichonkun-platformer.git
cd Pichonkun-platformer
npm install          # dev tools only: the game itself has no dependencies
npm run serve        # http://localhost:8000
```

You need **Node.js 20+**. For the smoke test you also need **Chrome or Chromium**.
If the browser isn't found automatically, set `CHROME_PATH`.

## Useful scripts

| Command | What it does |
|---|---|
| `npm run lint` | ESLint over the game and tools |
| `npm run validate` | Checks `js/levels.js`: chunk widths, start/exit, signs, NPCs, riddles and levers match their text |
| `npm test` | Starts the real game in headless Chrome and plays every level, riddle, puzzle, boss and save |
| `npm run check` | All of the above (CI runs this) |
| `npm run screenshots` | Regenerates `docs/screenshots/*.png` from the game canvas |

## Editing levels

Levels are ASCII maps in `js/levels.js`. The legend is at the top of that file. Some tips:

- The single jump reaches about **4 tiles up** and **5 tiles across**.
  The double jump (level 4 onwards) reaches about **7 up** and **8 across**.
- Leave **2 empty rows** above any floor the player walks on.
- Signs (`S`), NPCs (`N`), riddle terminals (`?`) and levers (`L`) get their text from arrays
  **in left-to-right order**. `npm run validate` checks that the counts match.
- A gate (`G`) belongs to the closest riddle terminal on its left.

## Pull requests

1. Create a branch from `main` (`feat/...`, `fix/...`, `docs/...`).
2. Keep the change focused and make sure `npm run check` passes.
3. Add a line to `CHANGELOG.md` under **[Unreleased]**.
4. Open the PR and fill in the template.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
(`feat:`, `fix:`, `docs:`, `chore:`...).

## Releasing (maintainers)

1. Bump the version in `package.json` **and** `GAME_VERSION` in `js/game.js`.
2. Move the **[Unreleased]** notes in `CHANGELOG.md` to a new version section and update the links.
3. Merge to `main`, then tag: `git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z`.
4. The **Release** workflow checks the versions, runs the tests, and publishes a GitHub release
   with a playable zip.

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE)
and that you'll follow the [Code of Conduct](CODE_OF_CONDUCT.md).
