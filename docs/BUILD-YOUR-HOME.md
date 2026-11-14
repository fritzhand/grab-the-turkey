# Build your own home

The idea: before Thanksgiving, build the house you're eating in, then play Grab the Turkey in it with your family after dinner. A place in this game is one file of plain data, so you don't need any 3D skills to get a good one. A 3D scan is a bonus on top.

You'll make `src/env/<your-home>.ts`, add it to the list, and deploy.

## 1. Measure the house

You need the outline of the house and where the walls and big furniture are, in meters. Good sources, roughly from easiest to best:

- **The listing's floor plan.** Real-estate listings (Zillow, Redfin, the agent's PDF) often have a floor plan with room dimensions. Screenshot it.
- **County property records.** Most county appraiser or GIS sites show the building footprint, its outside dimensions and its square footage. That gives you the outline.
- **Map data.** OpenStreetMap often has the building's footprint (open the map and click the building), and satellite view in any map app lets you measure the outside walls. That gives you the outline and which way it faces.
- **A tape measure, or your phone.** Apple's Measure app, or any LiDAR scanning app (Polycam, Scaniverse, RoomPlan-based apps), can measure each room. Some export a floor plan directly.
- **Photos.** You don't need them for the walls, but they tell you where the couch, the island and the dining table go.

Don't fuss over accuracy. Half a meter off doesn't matter for a chase.

## 2. Pick the axes

Lay the floor plan out with **north up**. In the game:

- **x** runs east (right on the plan); **z** runs south (down on the plan); 1 unit is 1 meter.
- Put **(0, 0)** at the middle of the house, so the bounds are easy: a house 18 m wide and 13 m deep has `bounds: { kind: 'rect', hx: 9, hz: 6.5 }`.

Measure everything from that middle point. A wall 3 m west of the middle is at `x = -3`.

## 3. Write it down

Copy `src/env/example-home.ts` to `src/env/my-home.ts` and change it. Each piece is a box:

```ts
{ kind: 'table', name: 'Dining table', x: 4.4, z: 2.0, w: 2.4, d: 1.1, h: 0.76, color: '#8a6e55' }
```

- `x`, `z`: its center. `w`: its width along x; `d`: its depth along z; `h`: its height. `rot` turns it, in degrees.
- `kind` is only how it's drawn: `wall`, `table` (a top and four legs), `counter`, `couch` (with a back), `bed`, `chair`, `plant`, or a plain `box`. Everything collides as its box.
- For walls, use the `wall(x1, z1, x2, z2)` helper in the example: give the two ends. **Leave gaps for doors.** Players need about a meter.
- Keep walls **low** (the example uses 1.1 m) so the camera can see over them. The game plays like a dollhouse with the roof off.

Then set:

- `spawns`: a handful of open spots where players appear.
- `dogStart`: where the dog waits at the start of a round.
- `turkeyStart`: where the turkey sits, `[x, y, z]`. Put it on the dining table: the table's `x` and `z`, and `y` as the table's height.
- `colors`: the floor, the sky (the fog fades into it), the furniture and the walls.

Add it to the list in `src/env/index.ts`:

```ts
import { myHome } from './my-home';
export const ENVIRONMENTS: Environment[] = [myHome, whiteRoom, exampleHome]; // first is the default
```

## 4. Add the floor plan as the floor (optional)

Put the floor-plan image (or a cropped satellite tile, or a photo of the rug) in `public/homes/` and lay it on the floor:

```ts
floorImage: { url: '/homes/my-floor-plan.png', width: 18, depth: 13, opacity: 0.9 },
```

`width` and `depth` are the meters the image covers. Crop the image to the house's outside walls and use the house's dimensions. The plan is then a guide to check your walls against: open the game and see whether the boxes sit on the lines.

## 5. Add a 3D scan (optional)

A phone scan makes the place look like home. Scan the rooms with a LiDAR or photogrammetry app (Polycam, Scaniverse, Luma, RealityScan), export **GLB**, and keep it small: under about 15 MB, decimated to a few hundred thousand triangles. Blender's Decimate modifier or `npx @gltf-transform/cli optimize in.glb out.glb` will do it. Then:

```ts
model: { url: '/homes/my-home.glb', position: [0, 0, 0], rotationY: 0, scale: 1 },
```

The model is **scenery only**. It doesn't collide, so keep your boxes where its walls and furniture are. Turn and move it until it lines up with the boxes. Lower the walls' `h`, or scan with the ceiling cut off, so the camera can see in.

You can also model the house in Blender from the floor plan (extrude the walls to 1.1 m) and export GLB.

## 6. Try it

```bash
npm run dev
```

Open the site, pick your home in **Where you are playing**, and walk the rooms. To try it with two players on one computer, open two tabs with `?transport=local` on the address. Check that:

- you can get through every door (if not, widen the gap);
- the turkey sits on the table, not inside it;
- nothing traps the dog (it slides along walls, but a dead-end corner of furniture can hold it).

Then push, deploy, and send the link to the family group chat.
