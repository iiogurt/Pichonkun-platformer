'use strict';
const js = require('@eslint/js');
const globals = require('globals');

// The game is plain <script> files sharing globals (no bundler), so list them here.
const gameGlobals = Object.fromEntries([
  'FONT', 'PAL', 'KEYS', 'SPR', 'THEMES', 'TILE', 'SPRITE_SCALE', 'makeSprite', 'whiteVersion', 'drawSpr', 'buildSprites',
  'buildTileset', 'buildBackground', 'hexRgb', 'rgbStr', 'shade', 'mix', 'AUDIO',
  'LEVELS', 'STORY_INTRO', 'STORY_ENDING', 'PORTRAITS', 'buildLevelGrid',
  'World', 'Player', 'ENEMY_DEFS', 'BOSS_INFO', 'makeEnemy', 'updateEnemy', 'makeBoss', 'updateBoss', 'overlap', 'walkBody',
  'GRAV', 'MAX_FALL', 'RUN_SPEED', 'JUMP_V', 'DJUMP_V', 'SPRING_V',
  'VIEW_W', 'VIEW_H', 'RES', 'SAVE_KEY', 'GAME_VERSION', 'Input', 'Game', 'glow', 'whiteOf', 'defaultSave', 'loadSave', 'writeSave',
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
