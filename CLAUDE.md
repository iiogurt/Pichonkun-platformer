# Pichonkun and the Clean Air Adventure

A browser platformer in plain JavaScript drawn on a canvas. There is no bundler and no build step, and the
game has no runtime dependencies. `npm` installs dev tools only. Setup, scripts, level editing and the
release steps are in [CONTRIBUTING.md](CONTRIBUTING.md); read it before changing levels or releasing.

## Checks

- `npm run check` runs lint, level validation and the headless-Chrome smoke test. CI runs the same thing,
  so run it before every PR.
- The smoke test needs Chrome or Chromium. If the browser isn't found, set `CHROME_PATH`.
- `npm run validate` currently reports 7 warnings and 0 errors. The warnings are expected.

## Things that are easy to get wrong

- **Shared globals:** `js/*.js` are classic `<script>` files loaded in the order listed in `index.html`
  and sharing globals. A new top-level name used across files must be added to `gameGlobals` in
  `eslint.config.js`, or lint fails with `no-undef`.
- **Save data:** saves, achievements and the leaderboard are untrusted (they come from `localStorage`
  and imported backup files). `cleanSave` and `cleanBoard` in `js/game.js` and `cleanMeta` in
  `js/awards.js` rebuild them field by field and **drop unknown fields**. A new save, meta or board
  field must be added there too, or it silently disappears on reload. The smoke test
  `backup: a crafted file or corrupt storage cannot break the game` covers this.
- **CSP:** `index.html` has a strict Content-Security-Policy. Don't add inline scripts, inline
  `style=` attributes in HTML, external URLs or network requests. Setting `element.style` from JS
  is fine.
- **Version numbers:** the version lives in `package.json` and in `GAME_VERSION` in `js/game.js`. A
  release tag must match both, and the Release workflow checks this.
- **Visual changes:** regenerate screenshots with `npm run screenshots`.

## Git and PRs

- Branch from `main` (`feat/...`, `fix/...`, `docs/...`, `chore/...`) and use Conventional Commit
  messages.
- Add a CHANGELOG entry under **[Unreleased]**.
- Open a PR using the template. PRs are squash-merged, so the title becomes the commit
  (`fix: ... (#N)`).
- Workflows pin actions to commit SHAs (`uses: owner/action@<sha> # vN`). Keep that format; Dependabot
  updates the pins.

## Claude Code cloud sessions

- `.claude/settings.json` runs `tools/cloud-setup.sh` at session start. In the cloud
  (`CLAUDE_CODE_REMOTE=true`) it runs `npm ci` and skips the install when `package-lock.json` is
  unchanged. Locally it does nothing.
- Chrome is preinstalled in the cloud image (`CHROME_PATH=/usr/bin/google-chrome`), so
  `npm run check` works there as it does locally.
- Cloud sessions can't push git tags, so tag releases (`git push origin vX.Y.Z`) from a local machine.
