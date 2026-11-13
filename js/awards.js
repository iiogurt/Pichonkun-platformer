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

// Splash power: Pichonkun's shot grows with the water drops collected over the whole adventure
// (best count per level, so replaying a level can only help). need[i] = drops for level i+1.
const SPLASH = {
  need: [0, 15, 45, 85, 130],
  name: ['SINGLE SPLASH', 'RAPID SPLASH', 'TWIN SPLASH', 'TRIPLE SPLASH', 'MEGA SPLASH'],
  cooldown: [13, 10, 10, 10, 9], maxShots: [4, 5, 8, 12, 12], life: [40, 50, 50, 50, 54],
};

// Angel is a perk, not a companion: clean play fills the PURE AIR meter, a full meter calls
// Angel for a short while. Angel gains experience from what it cleans and levels up.
const AIR = { full: 100, killBase: 2, killPerCombo: 2, crystal: 15, secret: 8, riddle: 8, bossHit: 2, hurt: -15 };
const ANGEL = {
  need: [0, 6, 16, 30, 50],            // experience for level i+1 (1 per enemy cleaned, 0.5 per boss hit)
  seconds: [15, 17, 19, 22, 25], cooldown: [50, 44, 38, 32, 26], range: [110, 120, 130, 140, 150], shots: [1, 1, 2, 2, 3],
  speed: 4.6,
};
const levelFor = (need, v) => { let l = 1; for (let i = 1; i < need.length; i++) if (v >= need[i]) l = i + 1; return l; };

// Health: every heart has 4 quarters. What hurts takes a different share, so a pollen puff is
// a nuisance and a virus or a boss is a real threat. A heart is gone once its quarters are used up.
// Small things give quarters back; only a heart pickup or a crystal restores a whole heart.
const HEALTH = {
  perHeart: 4,
  enemy: { p: 1, g: 1, d: 1, b: 2, f: 2, s: 2, m: 2, v: 3 },   // touching an enemy
  bullet: { pollenBall: 1, spore: 2, soot: 2 },               // being hit by what they throw
  boss: 4, spikes: 2, liquid: 3, pit: 4,
  hardExtra: 1,                                               // hard mode: everything hurts one quarter more
  heal: { heart: 4, crystal: 4, stomp: 1, combo: 1, comboFrom: 3, perDrops: 4, friend: 2, checkpointFrames: 45 },
};
