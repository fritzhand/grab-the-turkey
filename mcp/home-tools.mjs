// Build-your-home, as tools for a person's AI: the same set behind the remote MCP server (api/mcp.mjs, at /mcp) and
// llms-full.txt. Read-only, plain JavaScript. The steps take someone from forking the repo to playing their own home
// on the TV, with their AI doing the measuring, the plan, the Blender build and the deploy in their own copy.
import { checkPlan } from './check-plan.mjs';
import { planToBoxes } from './plan-to-boxes.mjs';

export const SERVER = { name: 'grab-the-turkey', title: 'Grab the Turkey: build your home' };

const list = (items) => items.map((x) => `- ${x}`).join('\n');
const object = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export const RULES = [
  'This server is read-only. It explains and checks; the work happens in the person\'s own copy of the repo, on their computer, with your file and shell tools.',
  'Never invent a measurement. Read it off the floor plan, or ask. A guessed wall is a wall in the wrong place.',
  'Keep the person\'s photos and floor plan out of git: put them in homes/<id>/photos/, which .gitignore leaves out. A fork of a public repo is public.',
  'Run check_plan on every plan before building it, and fix every error it reports.',
  'After each Blender build, look at the preview renders and compare them with the photos. Fix the plan and rebuild until they match.',
  'Doors in the game can be wider than the real ones: a pup needs about 0.9 m, and a chase is better with 1.2.',
  'Ask before you push, deploy, or create anything in the person\'s GitHub or Vercel account.',
];

/** The steps, in order. Each `guide` gets { site, repo, mcp }. */
export const STEPS = [
  {
    id: 'fork',
    title: 'Fork the repo and connect your AI',
    summary: 'your own copy of the game, on GitHub and on your computer, with your AI connected to this guide',
    guide: (c) => `You need your own copy of the game to put your home in it.

1. **Fork it.** Open ${c.repo}/fork and press **Create fork**. That gives you ${c.repo.replace(/^https:\/\/github\.com\/[^/]+/, 'https://github.com/<you>')}.
   A fork of a public repo is public. Your plan file (the layout of your rooms) will be in it. If you would rather keep it private, make a new private repo instead and push a clone of this one to it:
   \`\`\`bash
   git clone ${c.repo}.git my-turkey && cd my-turkey
   git remote set-url origin https://github.com/<you>/<private-repo>.git && git push -u origin main
   \`\`\`
2. **Clone it and run it.** You need [Node.js](https://nodejs.org) 20 or newer.
   \`\`\`bash
   git clone https://github.com/<you>/grab-the-turkey.git && cd grab-the-turkey
   npm install
   npm run dev        # http://localhost:5173
   \`\`\`
3. **Install Blender** (free, ${'https://www.blender.org/download/'}). It runs headless: nothing opens on screen. Check it with \`blender --version\`. On a Mac with Homebrew: \`brew install --cask blender\`.
4. **Connect your AI to this guide.** Open your coding agent (Claude Code, Codex, Cursor) in the clone, and add ${c.mcp} as an MCP server:
   - Claude Code: \`claude mcp add --transport http grab-the-turkey ${c.mcp}\`
   - Codex: in \`~/.codex/config.toml\`, \`[mcp_servers.grab-the-turkey]\` with \`url = "${c.mcp}"\`
   - Cursor: in \`.cursor/mcp.json\`, \`{ "mcpServers": { "grab-the-turkey": { "url": "${c.mcp}" } } }\`
   - Claude, ChatGPT and others: add it as a custom connector (remote MCP server).
   No connectors? Point your AI at ${c.site}/llms-full.txt.

Your AI now has this guide, and the code is on your computer for it to change.`,
  },
  {
    id: 'gather',
    title: 'Gather the floor plan and photos',
    summary: 'a floor plan with dimensions and a few photos of each room, kept out of git',
    guide: () => `The floor plan gives the walls. The photos give the furniture and the colors.

**Make a folder for them**, named for your home (lowercase and dashes): \`homes/my-home/photos/\`. That folder is in .gitignore, so your pictures never go to GitHub. Drop the files in, or paste them into your AI's chat.

**The floor plan, from easiest to best:**
- **The listing's floor plan.** Real-estate listings often have one with room sizes. Screenshot it.
- **County property records.** Most county appraiser or GIS sites show the building's footprint and outside dimensions.
- **Map data.** Satellite view in any map app measures the outside walls and shows which way the house faces.
- **A tape measure, or your phone.** A measuring app, or a LiDAR scanning app (Polycam, Scaniverse, RoomPlan-based apps). Some export a floor plan.
- **A sketch.** Paper, a pencil, and a tape measure. Write the lengths on it and take a photo.

**Photos:** a few of each room, from the doorways, so the big furniture shows (couch, table, island, beds) and its color.

Half a meter off doesn't matter for a chase. Doors do: a pup needs about a meter to get through.

**The game plays on one floor.** Pick the floor where the family gathers. A multi-level house can be one place per floor.`,
  },
  {
    id: 'look',
    title: 'Choose the look',
    summary: 'the White Room look (white boxes on an endless white floor, no Blender) or the painted storybook home (built in Blender)',
    guide: () => `There are two looks. Both start from the same plan file (the next step), so you can try one and switch to the other without measuring again.

| | The White Room look | The painted home look |
|---|---|---|
| What it looks like | Your walls and furniture as plain white boxes on an endless white floor that fades into a white sky. Clean and quiet, like the game's White Room. | Your home drawn in the storybook style: painted floors and walls, ink outlines, the furniture, a yard with trees, and a roof that lifts off when the game starts. Like the game's Example Home. |
| What it takes | The plan, and nothing else. place_file turns the plan into the boxes. | The plan, and Blender (free; it runs headless). |
| Time | Minutes | An afternoon, with your AI doing most of it |
| Best for | A game tonight, an office or a classroom, or a first try before the painted one | The holiday: the family sees its own living room on the TV |
| Steps | plan, then add (place_file with \`style: "white"\`), skipping build | plan, build, then add (place_file with \`style: "painted"\`) |

The game itself is the same in both: the turkey, the dog, the coins and the leprechaun, the TV and the phones. Either look can have pups or full-size walkers (customize).

Not sure? Start with the White Room look. It plays in minutes, and the painted look is one Blender build away.`,
  },
  {
    id: 'plan',
    title: 'Write the plan',
    summary: 'homes/<id>/plan.json: the walls, doors, windows, rooms, furniture and where everyone starts, in meters',
    guide: () => `A home is one JSON file: \`homes/<id>/plan.json\`. plan_format has every field; example_plan is a whole one.

**The axes.** Lay the floor plan out with north up. **x** runs east (right), **z** runs south (down), in meters, with **(0, 0)** at the middle of the house. A house 18 m wide and 13 m deep runs from x = -9 to 9 and z = -6.5 to 6.5.

**In this order:**
1. \`id\` and \`house\`: the outline.
2. \`walls\`: the outside walls, then the inside ones. Each runs along x or along z, \`from\` one end \`to\` the other. A door's or window's \`at\` is meters from the \`from\` end to its middle.
3. \`rooms\`: floors that are not wood (\`tile\`, \`carpet\`, or a hex color).
4. \`furniture\`: the big pieces from the photos. Skip the small things: they only get in the way.
5. \`spawns\` (ten spots in the open), \`dogStart\`, and \`turkeyStart\` on the dining table at the table's height.

**Then run check_plan** on it (or, in the repo, \`npm run check-plan -- homes/<id>/plan.json\`), and fix everything it reports.

**For your AI:** read every dimension off the floor plan (ask when one is missing or unreadable), place furniture from the photos, and pick colors that match them: a hex color, or a palette name (plan_format lists them).`,
  },
  {
    id: 'build',
    title: 'Build it in Blender (the painted look)',
    summary: 'headless Blender turns the plan into the painted model and the collision boxes that match it (skip this for the White Room look)',
    guide: () => `**For the painted look.** Choosing the White Room look? Skip this step: place_file makes the boxes straight from the plan.

From the root of the repo:

\`\`\`bash
blender -b --factory-startup --python-exit-code 1 --python blender/home.py -- homes/my-home/plan.json --preview build/previews
\`\`\`

It takes a few seconds and writes:
- \`public/models/my-home.glb\`: the model, drawn in the game's storybook style;
- \`src/env/my-home.layout.json\`: the collision boxes, spawns, dog and turkey starts, and the edge of play, from the same plan, so what you see is what you bump into;
- \`build/previews/my-home-outside.png\` and \`my-home-dollhouse.png\`: quick stills from above, with the roof on and off.

**Look at the previews** and compare them with the photos: the rooms in the right places, doors where the doors are, the couch facing the right way (a couch's back faces -z before \`rot\` turns it; a bed's headboard is at -z). Fix the plan and run it again. It's quick, so go round as often as it takes.

The build exits with an error if the plan breaks it; the message names the field. A plan that passes check_plan builds.`,
  },
  {
    id: 'add',
    title: 'Add it to the game',
    summary: 'one short file that puts your home in the list of places, in either look',
    guide: () => `A place is one TypeScript file in \`src/env/\`. place_file writes it for you: give it the id, a name, one line for the lobby, and the look:
- \`style: "painted"\` points at the model and the layout Blender wrote.
- \`style: "white"\` (send the plan too) writes the walls and the furniture as white boxes, right in the file. The walls stay low (1.1 m) with gaps for the doors, so the TV sees over them. Change the plan? Run place_file again.

1. Save it as \`src/env/my-home.ts\`.
2. Add it to the list in \`src/env/index.ts\`. The first place in the list is the one the game starts in:
   \`\`\`ts
   import { myHome } from './my-home';
   export const ENVIRONMENTS: Environment[] = [myHome, whiteRoom, exampleHome];
   \`\`\`
3. Check it still builds: \`npm run build\`.`,
  },
  {
    id: 'try',
    title: 'Try it',
    summary: 'walk the rooms, watch a demo game, and try the TV, all on your computer',
    guide: () => `\`\`\`bash
npm run dev
\`\`\`

- **Walk it:** open http://localhost:5173, choose your home under **Place**, start a round, and run through every room.
- **Watch a whole game:** http://localhost:5173/?demo&env=my-home plays one with made-up players. It shows quickly whether the rooms work for a chase.
- **Try the TV:** open http://localhost:5173/?tv=TEST&transport=local in one window and http://localhost:5173/?room=TEST&transport=local in another.
- **Phones on your Wi-Fi:** \`npm run dev\` prints a Network address; open it on a phone.

Check that:
- you can get through every door (if not, widen it in the plan and rebuild);
- the turkey sits on the table, not inside it;
- the dog doesn't get stuck in a corner of furniture;
- the coins and the leprechaun turn up in every room you can reach (a room nobody can walk into never gets any: that means a door is missing);
- on the TV, everyone is readable (if not, see customize: split screen).`,
  },
  {
    id: 'customize',
    title: 'Make it yours',
    summary: 'who plays, what the TV shows, the dog\'s name, the coins and the leprechaun, and every number in the game',
    guide: () => `In your place's file (\`src/env/my-home.ts\`):
- **\`cast\`**: \`'pups'\` (child-size pups in jumpers; they suit a house, with room to run between the furniture) or \`'walkers'\` (full-size figures, for an open space). Every size scales with the cast.
- **\`screen\`**: \`'overview'\` (the default: the whole place from above, roof off) or \`'split'\` (a pane per player, for a big place).
- **\`extras: false\`** switches off the turkey tokens and the leprechaun, for plain keep-away.
- **\`colors\`**: the paper color the yard fades into.

In \`src/game/tuning.ts\`, every number that decides how the game feels: the round's length (\`roundSeconds\`), speeds, the turkey's weight, the throw, the dog's name (\`dogName\`) and speed, how many coins lie about (\`tokenCount\`), how often the leprechaun shows up (\`lepEverySeconds\`) and what it's worth (\`lepPoints\`, \`lepHandsPoints\`), and the double points for holding the turkey (\`holdMultiplier\`).

Going further than \`home.py\`: a deck, stairs, a wood stove, a pond. Write your own Blender script on the helpers in \`blender/lib.py\` (\`MB\` builds an object from boxes, prisms, cylinders and blobs; \`piece()\` records a collision box; \`write_layout()\` saves them). Name the parts to outline in ink \`o_…\`, and group them \`GRP_Lower\` (floor, furniture), \`GRP_Upper\` (upper walls and roof, lifted off in play) and \`GRP_Site\` (yard and trees). The full guide is docs/BUILD-YOUR-HOME.md.`,
  },
  {
    id: 'deploy',
    title: 'Deploy it to Vercel',
    summary: 'your copy on the web, free, so the TV and every phone can open it',
    guide: (c) => `The game is a static site, with no game server: phones talk to each other directly. Vercel's free plan is plenty.

1. **Push** your changes to your GitHub repo: \`git add -A && git commit -m "Our house" && git push\`. (Your photos stay behind: homes/*/photos/ is in .gitignore.)
2. **Import it.** At https://vercel.com/new, sign in with GitHub, pick your repo, and press **Deploy**. vercel.json has the settings (Vite, \`npm run build\`, \`dist\`). No setting needs changing.
3. **Keep your rooms to yourself.** In the project's **Settings → Environment Variables**, set \`VITE_APP_ID\` to something of your own (say \`my-family-turkey\`), then redeploy. Rooms are found under this id, so your rooms never meet anyone else's.
4. **Optional, for guest or office Wi-Fi.** Those networks keep devices from reaching each other. Make a free Supabase project and set \`VITE_SUPABASE_URL\` and \`VITE_SUPABASE_ANON_KEY\`: every room then goes through its relay. For phones on cellular that can't connect, set \`CLOUDFLARE_TURN_KEY_ID\` and \`CLOUDFLARE_TURN_API_TOKEN\` (a free Cloudflare Realtime TURN key).

Every push to main redeploys. Your site gets an address like \`https://<project>.vercel.app\`; add your own domain under **Settings → Domains** if you like.

Your deployment serves this guide too, at \`https://<project>.vercel.app/mcp\`, so you can share your copy with its own MCP address.

With the Vercel CLI instead: \`npx vercel\` in the repo, then \`npx vercel --prod\`.`,
  },
  {
    id: 'play',
    title: 'Play it on the TV',
    summary: 'the TV shows the house from above; everyone plays on their phone',
    guide: (c) => `1. **On the TV** (a smart TV's browser, or a laptop plugged into it), open your site and press **📺 Put it on the TV**, or go straight to \`<your site>/?tv\`. It shows a room code and a QR code. Press F for full screen, and P to change the place.
2. **On each phone**, scan the QR code, type a name and join. The phone becomes a controller: the stick, the buttons, and big words about what's happening to you. Up on the stick is up on the TV.
3. **Press Start the round** on the TV (or Enter), or on any phone. Rounds run back to back.

**How to play:** every second you hold the turkey is a point. Run into whoever has it to take it, or press **Grab** to lunge. Hold **Throw** to wind up. **Dodge** is a sideways burst; **Dip** ducks under a grab. The dog wants the turkey too.

**The coins and the leprechaun:** five gold turkey tokens lie about the house at all times, a point each. Once a minute a leprechaun shows up and runs from anyone who comes near. Catch it by hand for 25 points, or pick up the trap (it lies somewhere else; touch it and it rides on your back) and put it on the leprechaun for 50. Holding the turkey doubles coins and leprechauns.

The TV runs the game, so phones can lock and come back without anyone losing their score. On this site: ${c.site}/?tv`,
  },
];

/** The plan's format, field by field (from blender/home.py, which builds it). */
const planFormat = (palette) => `# The plan format: homes/<id>/plan.json

Meters, in game coordinates: x runs east, z runs south (north is -z), with (0, 0) at the middle of the house. Fields marked (optional) can be left out.

| Field | What it is |
|---|---|
| \`id\` | Lowercase and dashes, like \`my-home\`. It names public/models/<id>.glb, src/env/<id>.layout.json and the ?env= link. |
| \`about\` | (optional) A sentence for whoever reads the file. |
| \`house\` | \`{ "x0", "x1", "z0", "z1" }\`: the outside of the house. Inside it is where the game is played. |
| \`wall\` | (optional) \`{ "height": 2.6, "thickness": 0.2, "cut": 1.1 }\`. Below \`cut\`, the dollhouse walls you play among; above it, lifted off in play so the TV can see in. |
| \`walls\` | A list of \`{ "name", "from": [x, z], "to": [x, z], "doors", "windows", "height" }\`. Each runs along x or along z. |
| \`walls[].doors\` | (optional) \`[{ "at", "width" }]\`: \`at\` is meters from \`from\` to the door's middle. Width defaults to 0.95; 1.2 makes a better chase. |
| \`walls[].windows\` | (optional) The same, for windows (width defaults to 1.2). |
| \`walls[].height\` | (optional) A half wall: \`1.1\` stops at the cut. |
| \`rooms\` | (optional) \`[{ "name", "x0", "x1", "z0", "z1", "floor" }]\`: floor is \`wood\` (the default), \`tile\`, \`carpet\`, or a hex color. |
| \`furniture\` | (optional) \`[{ "kind", "name", "x", "z", "w", "d", "h", "rot", "color" }]\`: x, z its middle; w along x; d along z; h its height (0.8 by default); rot a turn in degrees, counterclockwise from above. |
| \`roof\` | (optional) \`{ "pitch": 0.45, "overhang": 0.5, "color": "roof" }\` |
| \`yard\` | (optional) \`{ "margin": 7, "trees": 10, "seed": 3, "path": { "from": [x, z], "width": 1.3 } }\`: scenery around the house, outside the play area. |
| \`spawns\` | \`[[x, z], …]\`: where players appear, in turn. Ten, in the open. |
| \`dogStart\` | \`[x, z]\` |
| \`turkeyStart\` | \`[x, y, z]\`: on the dining table, with y the table's height. |

**Furniture kinds:** \`table\`, \`counter\`, \`couch\` (its back faces -z before \`rot\`), \`chair\`, \`bed\` (headboard at -z), \`plant\`, \`rug\` (drawn, never collides), \`box\`. Everything else collides as its box.

**Colors:** a hex color like \`"#8a6e55"\`, or a palette name: ${palette.length ? palette.join(', ') : '(see blender/lib.py)'}.

Typical sizes: a dining table 1.8–2.4 x 0.9–1.1 x 0.76; a couch 2.2–2.6 x 0.9 x 0.8; a kitchen counter 0.6 deep x 0.92; an island 2 x 0.9 x 0.92; a queen bed 1.6 x 2.1 x 0.6; a chair 0.45 x 0.45 x 0.9.`;

const indexLine = (id, ident) => `Then in \`src/env/index.ts\` (the first place in the list is the default):

\`\`\`ts
import { ${ident} } from './${id}';
export const ENVIRONMENTS: Environment[] = [${ident}, whiteRoom, exampleHome];
\`\`\`

Run \`npm run build\` to check it.`;

/** The White Room look: the plan's walls and furniture as white boxes, in the file itself. */
const whiteFile = ({ id, name, blurb, cast = 'pups', screen = 'overview' }, plan, palette) => {
  const ident = id.replace(/-([a-z0-9])/g, (_, ch) => ch.toUpperCase());
  const b = planToBoxes(plan, palette);
  const piece = (p) => `    { ${JSON.stringify(p).slice(1, -1).replace(/"([a-z]+)":/g, '$1: ').replace(/,(?=[a-z]+: )/g, ', ')} },`;
  return `\`src/env/${id}.ts\`, in the White Room look (no Blender, no model):

\`\`\`ts
/**
 * ${name}, in the White Room look: the walls and furniture of homes/${id}/plan.json as white boxes on
 * the endless white floor. The walls stay low, with gaps for the doors, so the TV sees over them.
 * Written by place_file from the plan; change the plan and write it again. For the painted look, build
 * the plan with blender/home.py and use place_file with style "painted".
 */
import type { Environment } from './types';

export const ${ident}: Environment = {
  id: '${id}',
  name: ${JSON.stringify(name)},
  blurb: ${JSON.stringify(blurb)},
  bounds: { kind: 'rect', hx: ${b.bounds.hx}, hz: ${b.bounds.hz} },
  colors: { floor: '#f3f3f0', sky: '#f3f3f0', fog: [24, 70], pieces: '#fbfbf9', walls: '#e9e9e4' },
  pieces: [
${b.pieces.map(piece).join('\n')}
  ],
  cast: '${cast}',${screen === 'split' ? "\n  screen: 'split'," : ''}
  spawns: ${JSON.stringify(b.spawns)},
  dogStart: ${JSON.stringify(b.dogStart)},
  turkeyStart: ${JSON.stringify(b.turkeyStart)},
};
\`\`\`

${indexLine(id, ident)}`;
};

const placeFile = ({ id, name, blurb, cast = 'pups', screen = 'overview' }) => {
  const ident = id.replace(/-([a-z0-9])/g, (_, ch) => ch.toUpperCase());
  return `\`src/env/${id}.ts\`, in the painted look:

\`\`\`ts
/**
 * ${name}, built from homes/${id}/plan.json by headless Blender (blender/home.py): the model
 * (public/models/${id}.glb) and the collision boxes that match it (${id}.layout.json).
 *
 * To rebuild after changing the plan:
 *   blender -b --factory-startup --python-exit-code 1 --python blender/home.py -- homes/${id}/plan.json --preview build/previews
 */
import type { Environment, Piece } from './types';
import layout from './${id}.layout.json';

export const ${ident}: Environment = {
  id: '${id}',
  name: ${JSON.stringify(name)},
  blurb: ${JSON.stringify(blurb)},
  bounds: layout.bounds as Environment['bounds'],
  colors: { floor: '#f8f4e8', sky: '#f8f4e8', fog: [40, 110], pieces: '#f3eee0', walls: '#f3eee0' },
  // every box is in the model already; these only collide
  pieces: (layout.pieces as unknown as Piece[]).map((p) => ({ ...p, hidden: true })),
  model: { url: '/models/${id}.glb', painterly: true },
  cast: '${cast}',${screen === 'split' ? "\n  screen: 'split'," : ''}
  spawns: layout.spawns as [number, number][],
  dogStart: layout.dogStart as [number, number],
  turkeyStart: layout.turkeyStart as [number, number, number],
};
\`\`\`

${indexLine(id, ident)}`;
};

/**
 * The tools, prompts and full text for the site at `site` (its origin, no trailing slash).
 * @param {{ site: string, repo: string, examplePlan: any, palette: string[], paletteHex?: Record<string, string> }} c
 */
export function homeTools(c) {
  const ctx = { site: c.site, repo: c.repo, mcp: `${c.site}/mcp` };
  const stepIds = STEPS.map((s) => s.id);

  const instructions = `These tools hold the guide to Grab the Turkey, a party game for phones and a TV, and to building your own home as the place it's played: fork the repo, measure the house from a floor plan and photos, write a plan, build it in headless Blender, add it to the game, deploy it to Vercel, and play it on the TV with phones as controllers. Start with get_started, then take the person through the steps in order (get_step), one at a time. Use check_plan on every plan before building it.

Keep these rules:
${list(RULES)}`;

  const started = () => `# Grab the Turkey: build your home and play in it

Grab the Turkey is a party game for one room full of people. The TV shows the house from above with the roof off; everyone plays on their phone. Every second you hold the turkey is a point. Five gold coins lie about at all times, and once a minute a leprechaun shows up, worth 25 caught by hand and 50 with the trap. The dog wants the turkey too.

The fun is that it can happen in your house. A floor plan and a few photos become a plan file, and the plan becomes a place in one of two looks: **the White Room look** (your walls and furniture as white boxes on an endless white floor, in minutes, no Blender) or **the painted home look** (drawn in the storybook style by headless Blender, with a yard and a roof that lifts off). Step 3 compares them.

**How this works.** This guide (${ctx.mcp}) is read-only: it explains each step and checks your plan. You and your AI do the work in your own copy of the repo (${c.repo}), on your computer.

**The steps, in order**
${STEPS.map((s, i) => `${i + 1}. ${s.title}: ${s.summary} (get_step "${s.id}")`).join('\n')}

**Tools along the way:** plan_format (every field of a plan), example_plan (a whole one), check_plan (checks yours), place_file (writes the file that adds your home to the game, in either look).

Start where the person is. With nothing yet: step 1. With a fork: step 2. With a plan: check_plan, then step 5 for the painted look or step 6 for the White Room look. With a home that plays: step 9. On the night: step 10.

**Rules for the AI helping**
${list(RULES)}

Play the game: ${c.site}`;

  const step = (id) => {
    const i = stepIds.indexOf(id);
    const s = STEPS[i];
    const next = STEPS[i + 1];
    return `# Step ${i + 1}: ${s.title}\n\n${s.guide(ctx)}\n\n${next ? `Next: step ${i + 2}, ${next.title} (get_step "${next.id}").` : 'That\'s it. Happy Thanksgiving.'}`;
  };

  const example = () => `# The Example Home's plan

homes/example-home/plan.json in the repo: an 18 x 13 m one-story house with an open living room, kitchen and dining along the front and three bedrooms along the back. It is what the Example Home in the game is built from. Copy it to homes/<id>/plan.json and change it.

\`\`\`json
${JSON.stringify(c.examplePlan, null, 2)}
\`\`\``;

  const check = (plan) => {
    const r = checkPlan(plan, { palette: c.palette });
    const head = r.ok ? (r.warnings.length ? 'The plan builds. A few things to look at:' : 'The plan builds, and nothing looks off.') : `The plan has ${r.errors.length} problem${r.errors.length === 1 ? '' : 's'} to fix before Blender can build it.`;
    return `# check_plan\n\n${r.summary ? `${r.summary}\n\n` : ''}${head}${r.errors.length ? `\n\n**Errors**\n${list(r.errors)}` : ''}${r.warnings.length ? `\n\n**Warnings**\n${list(r.warnings)}` : ''}${r.ok ? '\n\nNext: build it (get_step "build").' : ''}`;
  };

  const tools = [
    { name: 'get_started', title: 'Start here', description: 'What Grab the Turkey is, how building your own home works, and the steps from forking the repo to playing on the TV. Call this first.', inputSchema: object(), run: () => started() },
    {
      name: 'get_step',
      title: 'One step of the guide',
      description: `One step, in full: ${STEPS.map((s, i) => `${i + 1} "${s.id}" (${s.title})`).join('; ')}.`,
      inputSchema: object({ step: { type: 'string', enum: stepIds, description: 'Which step.' } }, ['step']),
      run: ({ step: id }) => step(id),
    },
    { name: 'plan_format', title: 'The plan format', description: 'Every field of homes/<id>/plan.json, the furniture kinds, the palette of color names, and typical furniture sizes.', inputSchema: object(), run: () => planFormat(c.palette) },
    { name: 'example_plan', title: 'An example plan', description: 'The Example Home\'s whole plan.json, to copy and change.', inputSchema: object(), run: () => example() },
    {
      name: 'check_plan',
      title: 'Check a plan',
      description: 'Checks a plan.json before you build it: the format, and what makes a home hard to play (narrow doors, walls past their ends, the turkey inside the table, spawns in the furniture). Returns errors to fix and warnings to consider.',
      inputSchema: object({
        plan: { type: 'object', description: 'The plan, as a JSON object.' },
        plan_text: { type: 'string', description: 'Or the plan as JSON text (the contents of plan.json).' },
      }),
      run: ({ plan, plan_text }) => (plan === undefined && plan_text === undefined ? 'Send the plan: as an object in "plan", or as JSON text in "plan_text".' : check(plan ?? plan_text)),
    },
    {
      name: 'place_file',
      title: 'The file that adds your home',
      description: 'Writes src/env/<id>.ts, the file that adds a home to the game, and the line for src/env/index.ts. style "painted" (the default) points at the model Blender built; style "white" turns the plan into white boxes in the White Room look, with no Blender (send the plan).',
      inputSchema: object(
        {
          id: { type: 'string', pattern: '^[a-z0-9]+(-[a-z0-9]+)*$', description: 'The plan\'s id, like "my-home".' },
          name: { type: 'string', description: 'What the lobby calls it, like "The Lake House".' },
          blurb: { type: 'string', description: 'One line for the lobby.' },
          cast: { type: 'string', enum: ['pups', 'walkers'], description: 'Pups (child-size, the default for a house) or walkers (full-size).' },
          screen: { type: 'string', enum: ['overview', 'split'], description: 'One overhead shot on the TV (the default), or a pane per player.' },
          style: { type: 'string', enum: ['painted', 'white'], description: 'The painted home look (built in Blender; the default), or the White Room look (white boxes from the plan, no Blender).' },
          plan: { type: 'object', description: 'For style "white": the plan, as a JSON object.' },
          plan_text: { type: 'string', description: 'For style "white": or the plan as JSON text.' },
        },
        ['id', 'name', 'blurb'],
      ),
      run: (a) => {
        if (a.style !== 'white') return placeFile(a);
        const given = a.plan ?? a.plan_text;
        if (given === undefined) return 'The White Room look is made from the plan: send it in "plan" (an object) or "plan_text" (JSON text).';
        const checked = checkPlan(given, { palette: c.palette });
        if (!checked.ok) return `Fix the plan first (check_plan has the details):\n${list(checked.errors)}`;
        return whiteFile(a, typeof given === 'string' ? JSON.parse(given) : given, c.paletteHex ?? {});
      },
    },
  ].map((t) => ({ ...t, annotations: { title: t.title, ...READ_ONLY } }));

  const prompts = [
    {
      name: 'build_my_home',
      title: 'Build my home',
      description: 'From a floor plan and photos to a home you can play in, step by step.',
      arguments: [{ name: 'home', description: 'What to call it, like "Grandma\'s house"', required: false }],
      text: ({ home }) => `I want to play Grab the Turkey in ${home ? `"${home}"` : 'my home'}. Use the grab-the-turkey tools: start with get_started, then take me through the steps one at a time. I'll give you a floor plan and photos of each room. Keep them in homes/<id>/photos/ so they never go to git. Ask me which look I want (the White Room look or the painted home look; get_step "look" compares them). Write the plan from my pictures (ask me for any measurement you can't read) and run check_plan. For the painted look, build it with headless Blender, look at the previews against my photos and fix what's off; for the White Room look, use place_file with style "white". Then add it to the game and let me try it. Ask before you push or deploy anything.`,
    },
    {
      name: 'deploy_my_fork',
      title: 'Deploy my copy',
      description: 'Put your copy of the game on Vercel, and get it on the TV.',
      arguments: [],
      text: () => `Help me put my copy of Grab the Turkey on Vercel and play it on the TV. Use get_step "deploy" and then get_step "play". Check that npm run build passes first, and ask before you push, deploy, or change anything in my GitHub or Vercel account.`,
    },
  ];

  const fullText = () =>
    [started(), ...STEPS.map((s) => step(s.id)), planFormat(c.palette), example()].join('\n\n---\n\n');

  return { instructions, tools, prompts, fullText };
}
