# Pichonkun and the Clean Air Adventure

A 10-level pixel-art platformer that runs in the browser. Pichonkun is a little water droplet born in the cooling coil of Breezeville's Great Air Conditioner. He has to wash away pollen, dust, mold, germs and smog, and stop **Smogmaw**, a cloud of pollution.

The game uses no libraries and has no build step. It's plain HTML5 canvas and JavaScript.

## Play

Open `index.html` in a modern browser. To run it on a local server instead:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Controls

| Action | Keys |
|---|---|
| Move | Arrow keys / A, D |
| Jump (hold for higher, press again in mid-air for Vapor Jump) | Z / Space / K |
| Shoot water splash | X / J |
| Aim upward | Hold Up / W while shooting |
| Talk / answer riddle / pull lever | Up / W / E (when the arrow prompt shows) |
| Drop through thin platform | Down + Jump |
| Pause | Esc / P |
| Toggle music | M |

On touch devices, on-screen buttons appear automatically.

## Levels

1. **Morning Meadow**: tutorial, pollen, the first riddle gate
2. **Pollen Peaks**: spring pads and flowers that spit pollen
3. **Smog Street**: rooftops, smog clouds, a water-cycle lever puzzle
4. **The Intake Duct**: get the Vapor Jump; updrafts and crumbling blocks
5. **Filter Fortress**: mold turrets, boss fight against the **Dust Baron**
6. **Frosty Coils**: slippery ice and spiky flu viruses
7. **Drip Drain**: toxic sludge, lifts, boss fight against the **Mold Queen**
8. **Compressor Core**: conveyors, hot vents, the "eco AC setup" lever puzzle
9. **Smokestack Factory**: everything at once, plus the 3 R's lever puzzle
10. **Smogmaw's Sky**: cloud platforms and the final boss, **Smogmaw**

Each level ends with an eco tip about clean air, air conditioning and ecology.

## Saving

Progress is saved automatically to the browser's `localStorage` at these points:

- reaching a checkpoint flag
- solving a riddle or lever puzzle
- getting the Vapor Jump
- defeating a boss
- clearing a level

Use **Continue** on the title screen to pick up from the last save. Use **Level Select** to replay any level you've unlocked.

## Project layout

```
index.html        page shell and touch controls
style.css
js/font.js        5x7 bitmap font
js/sprites.js     pixel-art sprites, shaded tiles, parallax backgrounds
js/audio.js       WebAudio chiptune synth, music tracks, sound effects
js/levels.js      level maps (ASCII), story, dialogue, riddles
js/world.js       physics, player, enemies, bosses
js/game.js        game states, UI, rendering, saving, input
style_cards/      character style reference
```

Levels are written as ASCII maps. The legend is at the top of `js/levels.js`.
