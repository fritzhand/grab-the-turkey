// The MCP server's tests (npm test): the Vercel function behind a local HTTP server with the same routes as
// vercel.json, talked to by the official MCP client over Streamable HTTP; and the plan checker on its own.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import handler from '../api/mcp.mjs';
import { checkPlan } from '../mcp/check-plan.mjs';

const ROUTES = { '/mcp': '/api/mcp', '/llms.txt': '/api/mcp?llms=short', '/llms-full.txt': '/api/mcp?llms=full' };
const textOf = (r) => r.content.map((c) => c.text).join('\n');
const example = JSON.parse(readFileSync(new URL('../homes/example-home/plan.json', import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));

describe('the build-your-home guide over MCP', () => {
  let server;
  let base;
  let client;

  before(async () => {
    server = createServer((req, res) => {
      const path = req.url.split('?')[0];
      if (!ROUTES[path]) {
        res.statusCode = 404;
        return res.end();
      }
      req.url = ROUTES[path];
      handler(req, res);
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
    client = new Client({ name: 'test', version: '0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
  });
  after(async () => {
    await client.close();
    await new Promise((r) => server.close(r));
  });

  it('introduces itself with the rules', () => {
    assert.equal(client.getServerVersion().name, 'grab-the-turkey');
    assert.match(client.getInstructions(), /Start with get_started/);
    assert.match(client.getInstructions(), /Never invent a measurement/);
    assert.match(client.getInstructions(), /out of git/);
  });

  it('lists the read-only tools', async () => {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name), ['get_started', 'get_step', 'plan_format', 'example_plan', 'check_plan', 'place_file']);
    for (const t of tools) assert.equal(t.annotations.readOnlyHint, true, t.name);
    assert.deepEqual(tools.find((t) => t.name === 'get_step').inputSchema.properties.step.enum, ['fork', 'gather', 'plan', 'build', 'add', 'try', 'customize', 'deploy', 'play']);
  });

  it('starts someone off, with links on the site it is served from', async () => {
    const text = textOf(await client.callTool({ name: 'get_started', arguments: {} }));
    assert.match(text, /1\. Fork the repo and connect your AI/);
    assert.match(text, /9\. Play it on the TV/);
    assert.match(text, /leprechaun/);
    assert.ok(text.includes(`${base}/mcp`), 'links use the request host');
    assert.ok(text.includes('https://github.com/fritzhand/grab-the-turkey'));
  });

  it('gives each step, and says what comes next', async () => {
    const fork = textOf(await client.callTool({ name: 'get_step', arguments: { step: 'fork' } }));
    assert.match(fork, /^# Step 1: Fork the repo/);
    assert.ok(fork.includes(`claude mcp add --transport http grab-the-turkey ${base}/mcp`));
    assert.match(fork, /Next: step 2, Gather the floor plan and photos/);
    const gather = textOf(await client.callTool({ name: 'get_step', arguments: { step: 'gather' } }));
    assert.match(gather, /homes\/my-home\/photos\//);
    const deploy = textOf(await client.callTool({ name: 'get_step', arguments: { step: 'deploy' } }));
    assert.match(deploy, /vercel\.com\/new/);
    assert.match(deploy, /VITE_APP_ID/);
    const play = textOf(await client.callTool({ name: 'get_step', arguments: { step: 'play' } }));
    assert.match(play, /Put it on the TV/);
    assert.match(play, /Happy Thanksgiving/);
    assert.equal((await client.callTool({ name: 'get_step', arguments: { step: 'nonsense' } })).isError, true);
    assert.equal((await client.callTool({ name: 'get_step', arguments: {} })).isError, true);
  });

  it('hands over the format, the example, and the place file', async () => {
    const format = textOf(await client.callTool({ name: 'plan_format', arguments: {} }));
    assert.match(format, /\| `turkeyStart` \|/);
    assert.match(format, /rug_a/, 'the palette is read from blender/lib.py');
    assert.doesNotMatch(format, /jumper_hem/, 'the pups\' colors are left out');
    const ex = textOf(await client.callTool({ name: 'example_plan', arguments: {} }));
    assert.match(ex, /"id": "example-home"/);
    const place = textOf(await client.callTool({ name: 'place_file', arguments: { id: 'lake-house', name: 'The Lake House', blurb: 'Where we go every year.', screen: 'split' } }));
    assert.match(place, /export const lakeHouse: Environment/);
    assert.match(place, /url: '\/models\/lake-house\.glb'/);
    assert.match(place, /screen: 'split'/);
    assert.equal((await client.callTool({ name: 'place_file', arguments: { id: 'Lake House', name: 'x', blurb: 'y' } })).isError, true);
  });

  it('checks a plan, as an object or as text', async () => {
    const good = textOf(await client.callTool({ name: 'check_plan', arguments: { plan: example } }));
    assert.match(good, /The plan builds/);
    assert.match(good, /18 x 13 m/);
    const bad = clone(example);
    bad.walls[0].from = [-9, -6];
    const text = textOf(await client.callTool({ name: 'check_plan', arguments: { plan_text: JSON.stringify(bad) } }));
    assert.match(text, /problem/);
    assert.match(text, /diagonally/);
    assert.match(textOf(await client.callTool({ name: 'check_plan', arguments: {} })), /Send the plan/);
  });

  it('offers the workflows as prompts', async () => {
    const { prompts } = await client.listPrompts();
    assert.deepEqual(prompts.map((p) => p.name), ['build_my_home', 'deploy_my_fork']);
    const { messages } = await client.getPrompt({ name: 'build_my_home', arguments: { home: "Grandma's house" } });
    assert.match(messages[0].content.text, /"Grandma's house"/);
    await assert.rejects(client.getPrompt({ name: 'nope', arguments: {} }), /No prompt named/);
  });

  it('serves llms.txt, llms-full.txt, and a page for a person who opens /mcp', async () => {
    const short = await fetch(`${base}/llms.txt`);
    assert.equal(short.status, 200);
    assert.match(await short.text(), /MCP server: http:\/\/127\.0\.0\.1:\d+\/mcp/);
    const full = await (await fetch(`${base}/llms-full.txt`)).text();
    for (const h of ['# Step 1: Fork the repo', '# Step 8: Deploy it to Vercel', '# Step 9: Play it on the TV', '# The plan format', "# The Example Home's plan"]) assert.ok(full.includes(h), h);
    const page = await fetch(`${base}/mcp`, { headers: { accept: 'text/html' } });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /claude mcp add/);
    assert.equal((await fetch(`${base}/mcp`, { headers: { accept: 'text/event-stream' } })).status, 405);
  });
});

describe('checkPlan', () => {
  it('passes every plan in homes/', () => {
    for (const dir of readdirSync(new URL('../homes/', import.meta.url))) {
      const plan = readFileSync(new URL(`../homes/${dir}/plan.json`, import.meta.url), 'utf8');
      const r = checkPlan(plan);
      assert.deepEqual(r.errors, [], dir);
    }
  });

  it('catches what breaks a build or a game', () => {
    const errs = (mutate) => {
      const p = clone(example);
      mutate(p);
      return checkPlan(p).errors.join('\n');
    };
    assert.match(errs((p) => (p.id = 'My Home')), /^id:/);
    assert.match(errs((p) => delete p.house), /^house:/);
    assert.match(errs((p) => (p.walls[4].doors[0].at = 17.9)), /runs past the end/);
    assert.match(errs((p) => (p.furniture[0].kind = 'sofa')), /kind is one of/);
    assert.match(errs((p) => (p.spawns[0] = [4.4, 2.0])), /inside furniture\[0\] \(Dining table\)/);
    assert.match(errs((p) => (p.turkeyStart[1] = 0.3)), /Set y to 0.76/);
    assert.match(errs((p) => (p.furniture[0].color = '#zzz')), /hex color/);
    assert.match(checkPlan('{ not json').errors[0], /not JSON/);
  });

  it('warns about what makes a home hard to play', () => {
    const p = clone(example);
    p.walls[4].doors[0].width = 0.7;
    p.furniture[0].color = 'mauve';
    const w = checkPlan(p, { palette: ['wood', 'sofa'] }).warnings.join('\n');
    assert.match(w, /0\.7 m is tight/);
    assert.match(w, /"mauve" is not in the palette/);
  });
});
