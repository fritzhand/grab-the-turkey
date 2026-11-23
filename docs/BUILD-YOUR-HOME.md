# Build your own home

The idea: before the holiday, build the house you're gathering in. After dinner, put it on the TV and play Grab the Turkey in it, everyone on their phone, the family running around its own living room.

You don't need 3D skills. A place in this game is plain data, and the model is built by a script in headless Blender from one plan file. A coding agent can write the plan for you from a floor plan and photos.

There are two routes:

| | Boxes (the White Room way) | A painted home (the Example Home way) |
|---|---|---|
| What you write | `src/env/my-home.ts`: walls and furniture as boxes | `homes/my-home/plan.json`: walls, doors, windows, rooms, furniture |
| What you get | Plain white boxes on a floor | A painted model: floors, walls, furniture, a yard, a roof that lifts off |
| Tools | A text editor | A text editor and [Blender](https://www.blender.org) (free; it runs headless) |
| Time | Half an hour | An afternoon |

Both start with the same measuring.

## 0. Your own copy, and your AI

Fork the repo on GitHub, clone your fork, and run `npm install`. Then connect your coding agent to the game's MCP server, which holds this whole guide as tools, plus a plan checker:

```bash
claude mcp add --transport http grab-the-turkey https://grab-the-turkey.vercel.app/mcp   # Claude Code
```

Codex, Cursor, Claude and ChatGPT take the same address as a remote MCP server (the README has each one). Without MCP, point your AI at `https://grab-the-turkey.vercel.app/llms-full.txt`. Then give it your pictures (step 1) and ask it to build your home with the grab-the-turkey tools. It follows the steps below, and you check its work.

## 1. Measure the house

You need the outline of the house and where the walls, doors, windows and big furniture are, in meters. Good sources, from easiest to best:

- **The listing's floor plan.** Real-estate listings (Zillow, Redfin, the agent's PDF) often have a floor plan with room dimensions. Screenshot it.
- **County property records.** Most county appraiser or GIS sites show the building footprint, its outside dimensions and its square footage. That gives you the outline.
- **Map data.** OpenStreetMap often has the building's footprint, and satellite view in any map app lets you measure the outside walls. That gives you the outline and which way it faces.
- **A tape measure, or your phone.** Apple's Measure app, or any LiDAR scanning app (Polycam, Scaniverse, RoomPlan-based apps), can measure each room. Some export a floor plan directly.
- **Photos.** A few of each room. They tell you where the couch, the island and the dining table go, and what color things are.

Keep all of it in `homes/my-home/photos/`. That folder is in `.gitignore`, so pictures of your home never go to GitHub, even when the plan does.

Don't fuss over accuracy. Half a meter off doesn't matter for a chase. A door does matter: players need about a meter to get through one.

## 2. Pick the axes

Lay the floor plan out with **north up**. In the game:

- **x** runs east (right on the plan); **z** runs south (down on the plan); 1 unit is 1 meter.
- Put **(0, 0)** at the middle of the house, so the bounds are easy: a house 18 m wide and 13 m deep runs from x = -9 to 9 and z = -6.5 to 6.5.

Measure everything from that middle point. A wall 3 m west of the middle is at `x = -3`.

## 3a. A painted home: write the plan

Copy [`homes/example-home/plan.json`](../homes/example-home/plan.json) to `homes/my-home/plan.json` and change it. The format is documented at the top of [`blender/home.py`](../blender/home.py). In short:

```json
{
  "id": "my-home",
  "house": { "x0": -9, "x1": 9, "z0": -6.5, "z1": 6.5 },
  "wall": { "height": 2.6, "thickness": 0.2, "cut": 1.1 },
  "walls": [
    { "name": "South wall", "from": [-9, 6.5], "to": [9, 6.5],
      "doors": [{ "at": 7.4, "width": 1.2 }], "windows": [{ "at": 3.2, "width": 2.2 }] },
    { "name": "Half wall", "from": [0, 3.6], "to": [0, 6.5], "height": 1.1 }
  ],
  "rooms": [{ "name": "Kitchen", "x0": 5.2, "x1": 9, "z0": -1, "z1": 6.5, "floor": "tile" }],
  "furniture": [
    { "kind": "table", "name": "Dining table", "x": 4.4, "z": 2.0, "w": 2.4, "d": 1.1, "h": 0.76 },
    { "kind": "couch", "x": -5, "z": 5.6, "w": 2.6, "d": 0.9, "h": 0.8, "rot": 180, "color": "#5b6b73" }
  ],
  "roof": { "pitch": 0.42, "overhang": 0.5 },
  "yard": { "margin": 8, "trees": 12, "path": { "from": [-1.6, 6.6] } },
  "spawns": [[-3, 1.5], [1.5, 1]],
  "dogStart": [-6.5, -2.4],
  "turkeyStart": [4.4, 0.76, 2.0]
}
```

- **Walls** run along x or along z, from one end to the other. A door or window's `at` is meters from the wall's `from` end to its middle. Below the `cut` (1.1 m) is the dollhouse you play among. Above it, the walls and roof lift off when the game starts.
- **Furniture** kinds: `table`, `counter`, `couch` (its back faces -z before `rot` turns it), `chair`, `bed` (headboard at -z), `plant`, `rug` (drawn but never collides) and `box`. `w` is along x, `d` along z, `h` up. `rot` is in degrees.
- **Colors** are a palette name from `blender/lib.py` (`wood`, `sofa`, `teal`, `rug_a`…) or any hex color. Room floors are `wood`, `tile`, `carpet` or a hex color.
- **`turkeyStart`** is `[x, y, z]`: put it on the dining table, at the table's height.

**Let a coding agent do it.** Give it the floor plan and the photos:

> Here is a floor plan of my home and photos of each room. Write `homes/my-home/plan.json` in the format of `homes/example-home/plan.json` (the format is documented at the top of `blender/home.py`). Measure the walls from the plan, put the doors and windows where they are, place the big furniture from the photos, and pick colors that match. Then build it with headless Blender, look at the preview renders, fix anything that's off, and add it to the game as an environment like `src/env/example-home.ts`.

### Check it

Before building, have your AI run the MCP server's `check_plan` tool on the plan (or run it yourself: `npm run check-plan -- homes/my-home/plan.json`). It catches walls that go diagonally, doors past the end of their wall, spawns inside the couch and a turkey inside the table, and warns about doors too narrow for a chase.

### Build it

```bash
blender -b --factory-startup --python-exit-code 1 --python blender/home.py -- homes/my-home/plan.json --preview build/previews
```

It writes:

- `public/models/my-home.glb`: the model, ready for the storybook style;
- `src/env/my-home.layout.json`: the collision boxes, spawns, dog and turkey starts and bounds, from the same plan;
- with `--preview`, two quick stills in `build/previews/` (the outside, and the dollhouse with the roof off) to check against your photos.

Then copy [`src/env/example-home.ts`](../src/env/example-home.ts) to `src/env/my-home.ts`, change `example-home` to `my-home` throughout, and add it to the list in [`src/env/index.ts`](../src/env/index.ts):

```ts
import { myHome } from './my-home';
export const ENVIRONMENTS: Environment[] = [myHome, whiteRoom, exampleHome]; // the first is the default
```

### Further than home.py

`home.py` makes a good house out of boxes. For more (a deck, stairs, a wood stove, a pond, stone walls, the real roof line), write your own Blender script on the same helpers. The Carriage House in the README was built that way, by a coding agent working from photos. [`blender/lib.py`](../blender/lib.py) has the pieces: `MB` builds one object from boxes, prisms, cylinders, blobs and beams, `piece()` records a collision box, and `write_layout()` saves them. The game reads three groups by name:

- `GRP_Lower`: floor, low walls, furniture, deck. Always there.
- `GRP_Upper`: upper walls, roof, beams. Lifted off when the game starts.
- `GRP_Site`: ground, trees, water, stone. Scenery, kept out of the contact shadows.

Anything whose name starts with `o_` is outlined in ink. Have your script write the collision boxes as it builds, so they always match the model.

## 3b. Boxes: write it down directly

For a quick plain version, skip Blender. Write the boxes in `src/env/my-home.ts`, using [`src/env/white-room.ts`](../src/env/white-room.ts) as the pattern. Each piece is a box:

```ts
{ kind: 'table', name: 'Dining table', x: 4.4, z: 2.0, w: 2.4, d: 1.1, h: 0.76, color: '#8a6e55' }
```

- `x`, `z`: its center. `w`: its width along x; `d`: its depth along z; `h`: its height. `rot` turns it, in degrees.
- `kind` only changes how it's drawn: `wall`, `table`, `counter`, `couch`, `bed`, `chair`, `plant` or `box`. Everything collides as its box.
- Keep walls **low** (1.1 m) so the camera can see over them, and leave gaps of about a meter for doors.

Then set `spawns`, `dogStart`, `turkeyStart` and `colors`, and add it to the list as above.

You can lay the floor plan on the floor as a guide (`floorImage: { url: '/homes/my-floor-plan.png', width: 18, depth: 13, opacity: 0.9 }`, cropped to the outside walls). You can also add a phone scan as scenery: export GLB from Polycam, Scaniverse or similar, keep it under about 15 MB (`npx @gltf-transform/cli optimize in.glb out.glb`), and set `model: { url: '/homes/my-home.glb' }`. A scan doesn't collide, so keep your boxes where its walls are.

## 4. Choose the cast and the TV view

- **Who plays.** `cast: 'pups'` gives child-size pups. They suit a real house, with room to run between the furniture. `cast: 'walkers'` gives full-size figures, which suit an open space. Every size scales with the cast, and `?cast=pups` tries pups anywhere.
- **What the TV shows.** One floor of a home reads well as **one overhead shot**, the default. For a big world, or one with more than one level, set **`screen: 'split'`** so each player gets a pane that follows them.

**Be careful with big and multi-level worlds.** Picture the Carriage House with its stairs down to the yard. Some players are upstairs, some are down by the pond, and one overhead shot can't show both: everyone is tiny, or someone is off screen. Split screen fixes that. Also know that the game plays on **one level** today: players run on one floor, and stairs between floors aren't built in yet. Build a multi-level house as one place per floor, or add heights to the game (contributions welcome).

## 5. Try it

```bash
npm run dev
```

Open the site, choose your home in **Where you are playing**, and walk the rooms. To try the TV, open `/?tv=TEST&transport=local` in one window and `/?room=TEST&transport=local` in another. To watch a whole game without anyone else, open `/?demo&env=my-home`. Check that:

- you can get through every door (if not, widen it in the plan and rebuild);
- the turkey sits on the table, not inside it;
- the coins and the leprechaun turn up in every room (a room that never gets any can't be walked into: a door is missing);
- nothing traps the dog (it slides along walls, but a dead-end corner of furniture can hold it);
- on the TV, everyone is readable (if not, consider `screen: 'split'`).

## 6. Deploy it and play

Push to your repo, import it at [vercel.com/new](https://vercel.com/new), and press **Deploy** (`vercel.json` has the settings). Set `VITE_APP_ID` to something of your own in the project's environment variables and redeploy, so your rooms are kept apart. Then open your site on the TV, press **📺 Put it on the TV**, and have everyone scan the QR code: their phones are the controllers.

Send the link to the family group chat.
