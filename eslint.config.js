'use strict';
const js = require('@eslint/js');
const globals = require('globals');

// The game is plain <script> files sharing globals (no bundler), so list them here.
const gameGlobals = Object.fromEntries([
  'FONT', 'GFX', 'PAL', 'SPR', 'RAMPS', 'OUTL', 'THEMES', 'TILE', 'TERRAIN', 'BACKDROP', 'mkSpr', 'whiteVersion', 'drawSpr', 'buildSprites', 'hexRgb', 'AUDIO',
  'LEVELS', 'STORY_INTRO', 'STORY_ENDING', 'PORTRAITS', 'buildLevelGrid',
  'World', 'Player', 'ENEMY_DEFS', 'BOSS_INFO', 'makeEnemy', 'updateEnemy', 'makeBoss', 'updateBoss', 'overlap', 'walkBody',
  'GRAV', 'MAX_FALL', 'RUN_SPEED', 'JUMP_V', 'DJUMP_V', 'SPRING_V',
  'VIEW_W', 'VIEW_H', 'RES', 'SAVE_KEY', 'GAME_VERSION', 'CONFIRM', 'Input', 'Game', 'whiteOf', 'defaultSave', 'loadSave', 'writeSave',
  'META_KEY', 'defaultMeta', 'loadMeta', 'writeMeta', 'crystalsEver', 'achCount', 'ACHIEVEMENTS', 'SKINS', 'HARD', 'setSkin',
  'SCORE', 'rankFor', 'WINGMAN', 'BOARD_KEY', 'BOARD_SIZE', 'BOARD_SEED', 'NAME_CHARS', 'NAME_MAX', 'loadBoard', 'writeBoard', 'boardSubmit', 'totalScore', 'newRun', 'newRunId',
].map(n => [n, 'writable']));

module.exports = [
  { ignores: ['node_modules/', '_site/', 'dist/'] },
  js.configs.recommended,
  {
    files: ['js/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: { ...globals.browser, ...gameGlobals } },
    rules: {
      'no-unused-vars': ['error', { vars: 'local', args: 'none' }],
      'no-redeclare': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['tools/**/*.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { ...globals.node, ...globals.browser, ...gameGlobals, T: 'writable', GAME: 'writable' } },
  },
];
