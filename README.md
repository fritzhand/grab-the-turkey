# Grab the Turkey

**Build your house. Play in it after dinner.**

![The Carriage House on the TV: nine players and a dog chasing the turkey through a home built in Blender from a floor plan and photos](docs/images/carriage-house-overhead.jpg)

*The Carriage House, a real home built with the workflow below: a floor plan and a few photos, turned into a painted model by headless Blender, and played on the TV from above while everyone runs their pup from their phone.*

Grab the Turkey is a party game for one room full of people. Everyone opens a link on their phone, types a name, and chases the turkey. **Every second you hold it is a point.** Gold turkey coins lie about the house, and once a minute a leprechaun shows up: catch it by hand for 25, or bring the trap for 50. Rounds last five minutes. Biscuit the dog wants the turkey too.

**Play it now: [grab-the-turkey.vercel.app](https://grab-the-turkey.vercel.app)**

The game is the easy part. The fun is that **it can happen in your house**. Give it a floor plan and some photos, and a script builds your rooms, furniture and yard in the game's storybook style. Then put it on the TV, and the family sees itself running around its own living room.

- **On phones:** open the link, play. No app, no account, no server.
- **On the TV:** the whole house from above with the roof off, a QR code to join, and a live leaderboard. Phones become controllers.
- **In your own world:** your home, your office, your cabin, from a floor plan, with headless Blender doing the modeling. [Start here](#build-your-own-world).
- **With your AI doing the work:** fork the repo, connect your coding agent to the game's MCP server, give it a floor plan and photos, and it builds your home and helps you deploy your own copy. [Make it yours](#make-it-yours-fork-build-deploy-play).

## Make it yours: fork, build, deploy, play

Your own copy of the game, with your house in it, on your own website, played on your TV. Your AI does most of it.

**1. Fork the repo.** Press **Fork** at the top of this page (or open [github.com/fritzhand/grab-the-turkey/fork](https://github.com/fritzhand/grab-the-turkey/fork)). Then clone your fork and run it. You need [Node.js](https://nodejs.org) 20+, and for the painted look, [Blender](https://www.blender.org/download/) (free; it runs headless, so nothing opens):

```bash
git clone https://github.com/<you>/grab-the-turkey.git && cd grab-the-turkey
npm install
npm run dev          # http://localhost:5173
```

A fork of a public repo is public, and your plan (the layout of your rooms) goes in it. To keep it private, make a new private repo and push your clone there instead.

**2. Connect your AI to the guide.** The game's site is also an MCP server, with the whole guide to building a home as tools: the steps, the plan format, a plan checker, and the file that adds your home to the game. Open your coding agent in your clone and add it:

| Agent | Add the MCP server |
|---|---|
| Claude Code | `claude mcp add --transport http grab-the-turkey https://grab-the-turkey.vercel.app/mcp` |
| Codex | in `~/.codex/config.toml`: `[mcp_servers.grab-the-turkey]` with `url = "https://grab-the-turkey.vercel.app/mcp"` |
| Cursor | in `.cursor/mcp.json`: `{ "mcpServers": { "grab-the-turkey": { "url": "https://grab-the-turkey.vercel.app/mcp" } } }` |
| Claude, ChatGPT, others | add `https://grab-the-turkey.vercel.app/mcp` as a custom connector |

No MCP? Point your AI at [grab-the-turkey.vercel.app/llms-full.txt](https://grab-the-turkey.vercel.app/llms-full.txt), the same guide as one page.

**3. Choose the look.** Your home can be played in either of two looks, and both are made from the same plan, so you can switch without measuring again:

| The White Room look | The painted home look |
|---|---|
| ![The Example Home in the White Room look: white walls and furniture as boxes on an endless white floor](docs/images/example-home-white.jpg) | ![The Example Home in the painted look: painted floors and walls, ink outlines, a yard](docs/images/example-home.jpg) |
| **Your rooms as plain white boxes** on an endless white floor, like the game's White Room. Low walls with gaps for the doors, the furniture as boxes. No Blender: your AI writes it straight from the plan. Ready in minutes. | **Your home drawn in the storybook style** by headless Blender: painted floors and walls, ink outlines, the furniture, a yard with trees, and a roof that lifts off when the game starts. An afternoon, mostly your AI's. |

The same house, the Example Home, in both looks. The game is the same either way. Not sure? Start white: it plays in minutes, and the painted look is one Blender build away.

**4. Give it your floor plan and photos.** Put them in `homes/my-home/photos/` (that folder is in `.gitignore`, so your pictures never go to GitHub), or paste them into the chat. A listing's floor plan, the county's footprint, or a sketch with a tape measure, plus a few photos of each room. Then ask:

> Use the grab-the-turkey tools to build my home in the painted look (or: the White Room look). The floor plan and photos are in homes/my-home/photos/.

Your agent writes `homes/my-home/plan.json` from the pictures (asking for any measurement it can't read) and checks it with `check_plan`. For the painted look, it builds the plan with headless Blender, compares the preview renders with your photos, and fixes what's off. For the White Room look, `place_file` turns the plan into white boxes, with no Blender. Either way, it then adds your home to the game. Clients that show MCP prompts also offer this as **build_my_home**.

**5. Make it yours.** In your place's file you choose pups or full-size walkers, one overhead shot or split screen, and whether the coins and the leprechaun are on. In [`src/game/tuning.ts`](src/game/tuning.ts) is every number: the round's length, the dog's name, how heavy the turkey is, how often the leprechaun shows up. Try it with `npm run dev`, or watch a whole game with `/?demo&env=my-home`.

**6. Deploy it to Vercel.** Push to your fork, then at [vercel.com/new](https://vercel.com/new) import the repo and press **Deploy**. [`vercel.json`](vercel.json) has every setting. In **Settings → Environment Variables**, set `VITE_APP_ID` to something of your own (say `my-family-turkey`) and redeploy, so your rooms are kept apart from everyone else's. Every push redeploys. Your copy serves the guide too, at `https://<your-project>.vercel.app/mcp`.

**7. Play it on the TV.** Open your site on the TV (or a laptop plugged into it) and press **📺 Put it on the TV**. Everyone scans the QR code with their phone, and the phones become the controllers: a stick and buttons, with the house on the big screen. [More below](#play-on-the-tv).

## Build your own world

The game comes with one place in each look:

| The White Room | A painted home |
|---|---|
| ![The White Room: an endless white floor, a long table and plinths](docs/images/white-room.jpg) | ![The Example Home, built from homes/example-home/plan.json](docs/images/example-home.jpg) |
| **The plain world.** An endless white floor, a table, a few plinths and full-size figures. There's nothing to build, and it plays anywhere. Start here if you just want a game tonight. Your own home in this look is your plan as white boxes in one TypeScript file, which the MCP's `place_file` writes for you (or write the boxes by hand). | **Your home, drawn.** The Example Home was built entirely by the workflow below from [one plan file](homes/example-home/plan.json). Painted walls and floors, ink outlines, furniture, a yard, and a roof that lifts off when the game starts. Child-size pups play here, so there's room to run between the couch and the table. |

### The workflow: floor plan and photos to a playable home

You don't need to know Blender. The model is built by a script, headless, from plain data, and a coding agent can write that data for you from your pictures.

**1. Gather pictures of the place.** A floor plan with dimensions (a listing's plan, the county's footprint, a phone LiDAR scan or a tape measure) and a handful of photos of each room. The plan gives the walls. The photos give the furniture and the colors.

**2. Write the plan.** Keep your photos in `homes/my-home/photos/`, which git leaves out. One JSON file, in meters, with (0, 0) at the middle of the house: the outside, the walls (with doors and windows), the rooms' floors, the furniture, and where the turkey starts. Copy [`homes/example-home/plan.json`](homes/example-home/plan.json). Or hand the pictures to a coding agent (Claude Code, Codex, Cursor) with a prompt like this:

> Here is a floor plan of my home and photos of each room. Write `homes/my-home/plan.json` in the format of `homes/example-home/plan.json` (the format is documented at the top of `blender/home.py`). Measure the walls from the plan, put the doors and windows where they are, place the big furniture from the photos, and pick colors that match. Then build it with headless Blender, look at the preview renders, fix anything that's off, and add it to the game as an environment like `src/env/example-home.ts`.

**3. Build it in headless Blender.** [Blender](https://www.blender.org) is free. Nothing opens on screen:

```bash
blender -b --factory-startup --python-exit-code 1 --python blender/home.py -- homes/my-home/plan.json --preview build/previews
```

The script writes the model (`public/models/my-home.glb`) and the collision boxes that match it (`src/env/my-home.layout.json`), so what you see is what you bump into. `--preview` also renders a quick still of the outside and of the open dollhouse to check against your photos:

![The preview render: the Example Home from above with the roof off](docs/images/blender-preview.jpg)

**4. Add it and play.** Copy [`src/env/example-home.ts`](src/env/example-home.ts) to `src/env/my-home.ts`, change the ids, and add it to the list in [`src/env/index.ts`](src/env/index.ts). Run `npm run dev`, choose your home under **Place**, and walk the rooms. Fix the plan and rebuild until the doors feel right.

**Going further.** `home.py` builds a good house from boxes. The Carriage House went further, with a deck, stairs, a stove, a pond and stone walls. That came from a hand-written Blender script built on the same helpers ([`blender/lib.py`](blender/lib.py)), written by a coding agent working from the photos. Anything you can describe, it can build. Name the parts the game should outline in ink `o_…`, and put them in three groups: `GRP_Lower` (floor, furniture), `GRP_Upper` (upper walls and roof, lifted off in play) and `GRP_Site` (yard and trees).

The full guide, from measuring a floor plan to testing the doors, is **[docs/BUILD-YOUR-HOME.md](docs/BUILD-YOUR-HOME.md)**.

### Big worlds and more than one floor: plan for the TV

The overhead TV view is built for **one floor of a house**, about the size of the Carriage House's upper floor. In a space that size, everyone is readable at once on one screen.

Be careful going bigger:

- **A big world.** A house plus a yard, or a whole office. Players spread out, and one shot that holds everyone makes everyone tiny. The TV camera follows the chase in a big place, but people at opposite ends of the world can't both be seen well.
- **More than one level.** An upstairs and a downstairs, or a deck with stairs down to the yard. Some players will be inside and some outside, and one overhead shot can't show both floors at once.

For worlds like these, **use split screen**. The TV gives each player their own pane, following them wherever they are, with their name, their time, and a highlight on whoever has the turkey. Set `screen: 'split'` in the place's file, or add `?split` to the TV's address.

![Split screen on the TV: four panes, one per player, each following its player](docs/images/split-screen.jpg)

One more thing to know: the game itself plays on **one level** today. Players run on one floor, and the turkey can land on tables. Stairs between floors are not built in yet. A multi-level house can be played one floor at a time as separate places, or someone can add heights to the game and send a pull request.

## Play on the TV

| The TV | Each phone |
|---|---|
| ![The TV's lobby: the room code, a QR code, and who has joined](docs/images/tv-lobby.jpg) | ![The phone as a controller: the stick, Grab, Dodge and Dip](docs/images/phone-controller.jpg) |

1. On the TV (or a laptop plugged into it), open the site and press **📺 Put it on the TV**, or go straight to `/?tv`. It makes a room and shows its code and a QR code.
2. Everyone scans the QR code, types a name and joins. Each phone turns into a **controller**: the stick, the buttons, and big words about what is happening to you (you have the turkey, your time, your place). Up on the stick is up on the TV. The phone buzzes when you get the turkey and when it's taken.
3. Press **Start the round** on the TV (or Enter) or on any phone. With a TV in the room, rounds run back to back: the results show for 15 seconds, then the next countdown starts.

The TV shows the whole place from above, with the roof off in a painted house, plus the leaderboard and the clock. Keys on the TV: Enter starts, P changes the place, F goes full screen.

The TV **hosts the game**: it runs the turkey, the dog and the clock. It never sleeps and never plays, so the game stays smooth while phones lock and come back. If the TV is turned on mid-round, it waits to hear the game before taking over, so nobody loses their score. If it goes off, a phone takes over.

A phone can still show the room: **Show the room here** on the controller (or **📺 Watch the TV** to go back). `?pad` forces the controller. To put an existing room on the TV, open `/?tv=ABCD` with its code. The lobby on every phone shows that address.

**The demo:** **▶ Watch a demo** on the start page, or `/?demo`, plays a whole game from above with made-up players, round after round. It's for a screen that runs by itself, or for screen-recording a video of your world (that's how the pictures here were made). `?demo&players=10&secs=60&env=example-home&split` sets how many players, how long a round lasts, where, and split screen.

## How to play

1. Open the site, type your name, pick a color, **Start a room**.
2. Tap **Invite** and send the link (or read out the four-letter room code), or put it on the TV.
3. Anyone presses **Start the round**. A three-second countdown, then five minutes.

| | Phone | Keyboard |
|---|---|---|
| Run | the stick, bottom left | W A S D or arrows |
| Look around | drag the room; pinch to zoom | drag; wheel; Q and E |
| Grab | run into whoever has it, or press **Grab** to lunge | Space |
| Throw | hold **Throw** to wind up, let go to throw | hold Space |
| Dodge | **Dodge**: a burst in the direction you are pushing | Shift |
| Dip | **Dip**: duck under a grab (you crawl while down) | C or Ctrl |

**The coins and the leprechaun.** Five gold turkey tokens lie about at all times, a point each; pick one up and another turns up somewhere else. Once a minute a leprechaun shows up and runs from anyone who comes near, hopping away when you get too close. Catch it by hand for **25 points**, or find the trap (a little wooden cage with a green arrow over it), touch it so it rides on your back, and put it on the leprechaun for **50**. A green chip says what to go for, with an arrow on your phone. **Holding the turkey doubles** coins and leprechauns. A place can switch them off with `extras: false`.

<details>
<summary><b>The physics, the dog, the sound and the achievements</b></summary>

### The physics

The turkey is heavy, so the holder has to work to keep it:

- **Slower.** With the turkey you top out at 6.0 m/s against everyone else's 6.6, and you **tire**: after 35 seconds of holding you are down to 4.7 m/s.
- **Sluggish.** The holder accelerates at 15 m/s² against 26, so turns are wide. Chasers can cut inside you.
- **Dodge** fires you sideways at 10–11.5 m/s for a fifth of a second. You can't steer it, and it has a cooldown.
- **Dip** makes you ungrabbable for 0.55 s by people and the dog, but you crawl at 40% speed.
- **Throw** winds up for up to 0.9 s, from 6.5 m/s to 14 m/s, with more loft the longer you wind. The turkey carries some of your own running speed, flies under gravity with a little drag, bounces off walls and the floor, and can land on the table. Anyone who catches it keeps it, except the thrower for the first half second.
- **No tag-backs.** Whoever just took the turkey can't lose it for 1.1 s.

Every number is in [`src/game/tuning.ts`](src/game/tuning.ts). Change them and the game changes. Sizes (bodies, reaches, the turkey, the dog, the camera) scale with the cast: the pups are 0.74 the size of the walkers. Speeds don't scale.

### The dog

Biscuit is not a player. The host runs Biscuit. Biscuit runs at whoever has the turkey (or at the turkey itself when nobody holds it) but only re-checks where it is every 0.3 s, so a well-timed dodge sends Biscuit past you. If Biscuit gets the turkey, Biscuit runs away from everyone, keeping off the walls, and drops it after seven seconds. Biscuit scores too, so don't let the dog win.

### Sound

Every sound is synthesized in the browser, so there are no audio files to license or download:

- footsteps, heavier while you carry the turkey;
- a whoosh for the dodge, a bloop for the dip, a swipe for the lunge, a rising whine while a throw winds up;
- a bright chord when you get the turkey, a sad one when it's taken, a thud when it lands, and barks from Biscuit;
- countdown beeps, a 30-second warning, ticks through the last ten seconds, and a horn (plus a flourish for the winner) at the end;
- a coin for a turkey token, a jig when a leprechaun shows up, and a clang and a shower of coins when the trap comes down;
- a harvest-folk music loop that picks up when the round starts and again in the last minute.

The button under the room code cycles between music and effects, effects only, and off.

### Achievements

Drumstick Defender (hold for 10 s), Gravy Guardian (30 s), Turkey Tycoon (60 s), First Grab, Interception! (catch someone else's throw), Dog Whisperer (take it back from the dog), Pot of Gold (trap the leprechaun), Quick Hands (catch it by hand), and Final Buzzer (holding it when time runs out). They're in [`src/audio/director.ts`](src/audio/director.ts).

</details>

## What a place can be

A place is one TypeScript file of plain data ([`src/env/types.ts`](src/env/types.ts) is the format):

- **Boxes on a floor**: the edge of play, the walls and furniture as boxes, where players start, and where the turkey sits. That's all the White Room is.
- **A model drawn in the storybook style** (`model: { url, painterly: true }`). Every surface is painted in flat washes with a wandering brush edge, and everything named `o_…` is outlined in brown ink ([`src/world/paint.ts`](src/world/paint.ts)). The model brings its own ground. Add `?roof` to keep the roof on.
- **Collision pieces that aren't drawn** (`hidden: true`), when the model already shows the walls and furniture. `blender/home.py` writes them for you.
- **Walkers or pups** (`cast: 'walkers' | 'pups'`). The pups are original child-size characters in jumpers in the player's color, made in Blender by [`blender/pup.py`](blender/pup.py). `?cast=pups` tries them anywhere.
- **Coins and a leprechaun, or not** (`extras: false`). They turn up anywhere on the floor that can be walked to from the first spawn, so a room with no door never gets any.
- **One shot or split screen on the TV** (`screen: 'overview' | 'split'`). See [big worlds](#big-worlds-and-more-than-one-floor-plan-for-the-tv).
- **A phone scan** (Polycam, Scaniverse, RoomPlan) as plain scenery, or **the floor plan laid on the floor** as a guide. See [docs/BUILD-YOUR-HOME.md](docs/BUILD-YOUR-HOME.md).

## How the multiplayer works

There is **no game server**. Phones find each other through public Nostr relays ([Trystero](https://github.com/dmotz/trystero)), then talk directly, peer to peer, over WebRTC. That's why the whole game deploys as static files.

- Each phone runs its own player and sends its position 20 times a second while moving, and once a second standing still.
- One device is the **host**: the TV when there is one, otherwise the lowest player id among active players. The host runs the turkey, the dog, the scores and the clock, and sends a snapshot 15 times a second. If the host leaves or locks their phone, the next one takes over from the last snapshot, and the game carries on.
- Grabs, throws and the start button are requests to the host, which decides.

### Guest Wi-Fi: the relay

Peer to peer fails on most **guest and office Wi-Fi**. Those networks wall each device off from the others, so the phones and the TV never reach each other. For a party at a venue, an office or a hotel, use the websocket relay instead. Everyone talks to one server over an ordinary web connection, which works on any network that loads web pages.

1. Make a free [Supabase](https://supabase.com) project. The game uses Realtime broadcast and presence only, with no tables.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Project Settings → API) in your Vercel project, and redeploy.

Every room then goes through the relay. Poses go out 10 times a second while moving, and snapshots 10 times a second. The relay counts every message, so a big party on the free tier may hit its limit. `?transport=p2p` goes back to peer to peer for one device.

Players on the same home Wi-Fi connect almost every time. Two phones on some cellular networks can't reach each other directly. For that case, add a **TURN relay**: make a free Cloudflare Realtime TURN key and set `CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_API_TOKEN` in your Vercel project. [`api/ice.ts`](api/ice.ts) then hands each player short-lived credentials. You can also set a static TURN server at build time with the `VITE_TURN_*` variables in [`.env.example`](.env.example).

## Run it

```bash
npm install
npm run dev          # http://localhost:5173 (and on your network, for phones)
npm run build        # type-check and build to dist/
npm run check-plan -- homes/my-home/plan.json   # check a home's plan before building it
npm test             # the MCP server's tests, with the official MCP client
npm run mcp:dev      # the MCP server at http://localhost:8787/mcp, to try in a client before you push
```

To play yourself in two tabs with no network, add `?transport=local` to the address. Tabs on one device then play each other over a BroadcastChannel. For the TV setup, open `/?tv=TEST&transport=local` in one window and `/?room=TEST&transport=local` in another.

In the browser console, `grabTheTurkey.game` is the live game state.

## Deploy

It's a static Vite site, plus two small Vercel functions. Import the repo into Vercel at [vercel.com/new](https://vercel.com/new) and press **Deploy**. [`vercel.json`](vercel.json) has the settings, and every push to main redeploys.

- **`/mcp`** ([`api/mcp.mjs`](api/mcp.mjs)): the build-your-home guide as a remote MCP server (Streamable HTTP, read-only, no sign-in), with `/llms.txt` and `/llms-full.txt` beside it. The tools are `get_started`, `get_step`, `plan_format`, `example_plan`, `check_plan` and `place_file`, and the content lives in [`mcp/`](mcp). A fork's deployment points its guide at the fork's own repo. Someone who opens `/mcp` in a browser gets a short page saying what it is.
- **`/api/ice`** ([`api/ice.ts`](api/ice.ts)): optional TURN credentials. The game works without it.

If you fork it, set `VITE_APP_ID` to something of your own so your rooms are kept apart from everyone else's. On another static host the game works the same, without `/mcp`.

## The code

```
src/
  env/        the places: types.ts (the format), white-room.ts, example-home.ts (+ its generated layout), index.ts,
              spots.ts (open floor that can be walked to, for the coins and the leprechaun)
  game/       tuning.ts (every number, and the cast's scale), types.ts (the wire), authority.ts (the host: turkey,
              dog, scores, clock, back-to-back rounds), items.ts (the coins, the leprechaun and its trap), net.ts (host election, the TV as host), transport.ts
              (peer to peer, the relay, local tabs), Controller.tsx (your player's physics and keys), demo.ts
              (made-up players), store.ts
  world/      the 3D scene: Figure (the walker), Pup (the pups), Dog, Turkey, Tokens, Leprechaun, Pieces (furniture), Room,
              PaintedModel + paint.ts (the storybook style), CameraRig (behind you), TvRig (the TV, from above),
              SplitRig (the TV, a pane per player)
  audio/      sound.ts (effects), music.ts (the loop), director.ts (what plays when; achievements)
  ui/         Hud (clock, scores, results), Controls (stick and buttons), TvHud (the TV), PadView (the controller)
blender/      home.py (a home from a plan), pup.py (the pups), lib.py (helpers for building headless)
homes/        plans: example-home/plan.json (your photos go in homes/<id>/photos/, which git leaves out)
mcp/          the build-your-home guide's content and tools, and check-plan.mjs (the plan checker)
api/mcp.mjs   the MCP server at /mcp, with /llms.txt and /llms-full.txt
api/ice.ts    optional TURN credentials
test/         the MCP server's tests
```

## Credits

The White Room's look and the walker come from the White Room on Jeremy Fritzhand's site. The walker and its animations are from [portfolio-map-3d](https://github.com/fritzhand/portfolio-map-3d) (MIT). The pups, the leprechaun and the storybook look were made for this game. The dog is by [Quaternius](https://quaternius.com) and the turkey by [Kenney](https://kenney.nl), both CC0. Details are in [CREDITS.md](CREDITS.md).

MIT License. See [LICENSE](LICENSE).
