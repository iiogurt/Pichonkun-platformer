// Achievements, rewards (skins) and the long-term progress that survives "New Game".
'use strict';
const META_KEY = 'pichonkun_meta_v1';

function defaultMeta() {
  return { ach: {}, cry: {}, kills: 0, finished: false, hardDone: false, skin: 'blue', skins: ['blue'] };
}
function loadMeta() {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY));
    if (m && typeof m === 'object' && m.ach) return Object.assign(defaultMeta(), m);
  } catch { /* corrupt or unavailable storage: start fresh */ }
  return defaultMeta();
}
function writeMeta(m) { try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch { /* storage full or blocked */ } }
const crystalsEver = (m) => Object.values(m.cry).reduce((n, a) => n + a.length, 0);
const achCount = (m) => Object.keys(m.ach).length;

// id, name, how to earn it. Shown in this order on the Achievements screen.
const ACHIEVEMENTS = [
  ['level1', 'FIRST SPLASH', 'CLEAR THE MORNING MEADOW'],
  ['crystal1', 'SHINY!', 'FIND AN AIR CRYSTAL'],
  ['secret1', 'WALLS HAVE SECRETS', 'FIND A SECRET ROOM'],
  ['combo3', 'CLEANING SPREE', 'REACH A X3 COMBO'],
  ['combo5', 'SPOTLESS', 'REACH A X5 COMBO'],
  ['clean100', 'DEEP CLEAN', 'CLEAN UP 100 ENEMIES'],
  ['allDrops', 'EVERY DROP COUNTS', 'ALL WATER DROPS IN A LEVEL'],
  ['noHit', 'UNTOUCHABLE', 'CLEAR A LEVEL WITHOUT DAMAGE'],
  ['quiz', 'QUIZ WHIZ', 'NO WRONG ANSWERS IN A LEVEL'],
  ['speed', 'LIKE THE WIND', 'BEAT HALF THE PAR TIME'],
  ['rankS', 'S FOR SPARKLING', 'EARN AN S RANK'],
  ['bossFlawless', 'FLAWLESS FILTER', 'BEAT A BOSS WITHOUT DAMAGE'],
  ['hero', 'CLEAN AIR HERO', 'FINISH THE GAME'],
  ['allA', 'HONOR STUDENT', 'RANK A OR S ON EVERY LEVEL'],
  ['crystalAll', 'CRYSTAL COLLECTOR', 'FIND ALL 30 AIR CRYSTALS'],
  ['top', 'TOP OF THE TOWN', 'BE NO. 1 ON THE LEADERBOARD'],
  ['hard1', 'TOUGH DROPLET', 'CLEAR A LEVEL IN HARD MODE'],
  ['hardHero', 'STEEL DROPLET', 'FINISH THE GAME IN HARD MODE'],
];

// Rewards: new colours for Pichonkun. [id, name, how to unlock, test(meta), 7-tone ramp dark -> light]
const SKINS = [
  ['blue', 'BLUE', '', () => true, null],
  ['mint', 'MINT', 'FIND 10 AIR CRYSTALS', m => crystalsEver(m) >= 10, ['#0a4a2a', '#12803c', '#1eb050', '#3cd870', '#7cf09c', '#c4ffd0', '#ffffff']],
  ['rose', 'ROSE', 'EARN 8 ACHIEVEMENTS', m => achCount(m) >= 8, ['#6a0a3c', '#a81a64', '#e03c8c', '#ff6ab0', '#ff9ccc', '#ffd0e6', '#ffffff']],
  ['violet', 'VIOLET', 'FINISH THE GAME', m => m.finished, ['#2a0c5c', '#4a1a9a', '#7436d0', '#9a5cf0', '#bc8cff', '#e0c8ff', '#ffffff']],
  ['gold', 'GOLD', 'FIND ALL 30 AIR CRYSTALS', m => crystalsEver(m) >= 30, ['#7a3a00', '#b86a04', '#e89a10', '#ffc428', '#ffe060', '#fff4b0', '#ffffff']],
  ['ember', 'EMBER', 'FINISH THE GAME IN HARD MODE', m => m.hardDone, ['#6a0a0a', '#a81a10', '#e03c18', '#ff6a28', '#ff9a50', '#ffd0a0', '#ffffff']],
];

// Hard mode: unlocked by finishing the game once.
const HARD = { hearts: 2, enemyHp: 1, bossHp: 1.5, enemyTick: 4, bossTick: 5, score: 1.5 };
