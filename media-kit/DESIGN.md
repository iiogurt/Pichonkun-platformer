# Pichonkun: graphics and design guide

A short reference for anyone making a video, thumbnail or post about the game. Every image in this
folder is rendered from the game's own code, so it matches what players see.

## The look in one sentence

Cheerful 16-bit-style pixel art: round, cute characters with dark navy outlines, soft
dithered shading, and worlds that start fresh and green, turn grey and dirty in the middle,
and end up clean again.

## Technical facts

| | |
|---|---|
| Game screen | 384 × 216 game pixels (16:9), drawn at 2× internally (768 × 432) |
| Tile size | 16 × 16 game pixels |
| Pichonkun's size | about 25 × 28 game pixels, so roughly 1/8 of the screen height |
| Frame rate | 60 fps |
| Font | Custom 5 × 7 bitmap font, capital letters only |
| Art source | No image files: every sprite, tile and background is painted by code (shapes, colour ramps, dithering) |

**Scaling rule for video:** always scale pixel art by whole numbers (2×, 3×, 4×…) with
*nearest neighbour* / "no smoothing" so the pixels stay sharp. In most video editors this is
called "Nearest Neighbor", "Pixel art" or turning off "Smooth scaling". The PNGs in `sprites/`
and `animations/` are already enlarged: every painted pixel is an 8 × 8 block, so Pichonkun is
464 × 512 pixels with a transparent background.

## How the art is made

1. **Shapes:** characters are built from rounded shapes (circles, cones, blobs) instead of drawn by hand.
2. **Colour ramps:** each material has a hand-picked ramp of 4–7 colours from dark to light
   (water, leaf, metal, smog, mold…). Light comes from the top left.
3. **Ordered dithering:** the step between two ramp colours is broken up with a 4 × 4 checker
   pattern, the classic 16-bit "soft shading" look.
4. **Outlines:** heroes and friends get a **navy** outline (`#0D1B5E`); villains get an almost-black
   outline (`#100C1A`). This is a quick way to tell good from bad at a glance.
5. **Lighting and weather:** levels add coloured ambient light, glowing props, fog, floating
   motes (pollen, snow, sparks) and multi-layer parallax backgrounds that move.

## Colour palette

### Core brand colours

| Swatch | Hex | Use |
|---|---|---|
| Navy | `#0D1B5E` | Outlines, text, title background, the "night sky" |
| Blue | `#1565D8` | Pichonkun's shaded side, headings |
| Cyan | `#1CB8F2` | Pichonkun's main colour, highlights, "clean" |
| Light | `#B5ECFC` | Shine, ice, light text on dark |
| White | `#FFFFFF` | Faces, bodies, sparkle |
| Cream | `#FDF5E6` | Paper background for boards and cards |
| Gold | `#FFC81E` | Rewards: air crystals, Angel, achievements |
| Red / pink | `#F03A62` | Hearts and health |

### Character colour ramps (dark → light)

| Character | Ramp |
|---|---|
| Pichonkun (water) | `#0C2F96` `#1352C8` `#1A80E6` `#1CB0F2` `#4FCDF8` `#A8E8FC` `#FFFFFF` |
| Angel (gold) | `#8A5A10` `#C08A20` `#E8B840` `#FFD866` `#FFE894` `#FFF4C4` `#FFFBE8` |
| Leafa (leaf) | `#0E4A1C` `#1F7A2A` `#3CB042` `#74DC5C` `#C4F8A0` |
| Frosty (ice) | `#2A62B0` `#5AA2E0` `#96D2F6` `#D0F0FF` `#FFFFFF` |
| Granny Cloud | `#7888B4` `#A8B8D8` `#D4DEF0` `#F2F6FC` `#FFFFFF` |
| Buzzby (bee) | `#8A5200` `#E09A08` `#FFC81E` `#FFE870` |
| Smogmaw (smog) | `#101016` `#23232C` `#3A3A46` `#575764` `#7C7C8A` `#A2A2B0` |
| Dust Baron (dust) | `#3C3844` `#676270` `#948E9C` `#C2BCCA` `#ECE8F4` |
| Mold Queen (mold) | `#141E06` `#2C4416` `#4C6E1E` `#789A30` `#B0CC58` `#E0F090` |
| Virus | `#34085C` `#5C1A9A` `#8C36C8` `#B866EC` `#E2AAFF` |

**Colour story for videos:** clean = blues, cyans, greens and white; dirty = greys, olive
greens and purples; reward = gold. Showing a scene shift from grey to blue is the visual
"before and after" of the whole game.

## Character design notes

### Pichonkun (hero)
- **Shape:** a big water-drop head with the pointy tip up, on a small white body with stubby arms and legs.
  The head is about two thirds of his height, which makes him read as a "chibi" baby character.
- **Face:** a white patch on the lower front of the drop. Two round navy eyes and a small cat-like
  "w" mouth. The face sits a little to the side he is looking, so he always looks three-quarter.
- **Colour:** water ramp; dark blue on the shaded side, a bright white shine stripe on the top-left of the drop.
- **Animation:** 6-frame idle bob, 12-frame run cycle, squash on landing and stretch on jumping,
  a blink, a hurt face (× eyes) and a happy face (^ ^ eyes, open mouth).
- **Skins:** blue (default), mint, rose, violet, gold and ember. Only the head colour changes.

### Angel (guardian)
- Pichonkun's body in a warm gold ramp with small white wings that flap in a 4-frame loop.
- Appears only for a short time when the "Pure Air" meter is full, so in video it works well as a "power-up moment".

### Friends
- **Leafa:** a green leaf with a face, twig legs and pink cheeks. The friendly guide.
- **Prof. Mesh:** a square, beige, slightly dirty air-filter panel with round glasses and a grille for a mouth.
- **Frosty:** a glossy blue ice cube with a big smile and short legs.
- **Granny Cloud:** a soft, wide white cloud with round purple glasses and pink cheeks.
- **Buzzby:** a round yellow-and-black bee with see-through wings.

### Villains
- **Smogmaw:** the biggest sprite in the game. A dark lumpy storm cloud with glowing orange-red eyes
  and a jagged mouth. Menacing, but still round and cartoony (he becomes a nice rain cloud at the end).
- **Dust Baron:** a grey dust bunny wearing a top hat with a red band and a gold monocle. A "fancy villain".
- **Mold Queen:** a green, spotty slime mound with a gold crown and spore stalks.
- **Enemies:** pollen puffs (yellow spiky balls), puff flowers (pink, spit pollen), bacteria
  (green caterpillar blobs), dust bunnies, viruses (purple, spiky), smog clouds, mold turrets
  and germ flies. All have big simple eyes, so they look naughty rather than scary.

## The ten worlds at a glance

The game's visual journey goes from fresh nature, into the machine, and up into the sky.

| # | Level | Mood and colours | Signature visuals |
|---|---|---|---|
| 1 | Morning Meadow | Fresh, sunny, green and sky blue | Rolling hills, flowers, pollen motes |
| 2 | Pollen Peaks | Warm, peachy haze | Tall hills, puff flowers, spring pads |
| 3 | Smog Street | Grey-purple city | Brick rooftops, smog clouds, soot |
| 4 | The Intake Duct | Dark steel blue | Metal panels, spinning fans, updrafts |
| 5 | Filter Fortress | Dusty brown-beige | Pleated filter walls, dust; boss: Dust Baron |
| 6 | Frosty Coils | Icy blue, glittering | Slippery ice, snow sparkles, frozen pipes |
| 7 | Drip Drain | Murky teal and toxic green | Brick sewer, green sludge, lifts; boss: Mold Queen |
| 8 | Compressor Core | Hot orange and rust | Metal panels, molten liquid, conveyor belts |
| 9 | Smokestack Factory | Brown, smoky, sparks | Chimneys, orange embers, levers |
| 10 | Smogmaw's Sky | Lavender sky above the smog | Cloud platforms; final boss: Smogmaw |

Real in-game screenshots of every level are in [`../docs/screenshots/`](../docs/screenshots/),
and a real-time gameplay clip is [`../docs/gameplay.gif`](../docs/gameplay.gif).

## Text and UI style

- All text uses the game's own 5 × 7 pixel font in capital letters. For titles in a video, the
  boards in `boards/` show it at large sizes; for other text, a free pixel font such as
  "Press Start 2P" or "Silkscreen" is a close match.
- Dialogue boxes are navy with a light border; the speaker's name is in their own colour
  (Pichonkun cyan, Angel gold, Leafa green, Smogmaw red).
- Keep text short and in capitals, and give it a 1-pixel darker shadow, the way the game does.
