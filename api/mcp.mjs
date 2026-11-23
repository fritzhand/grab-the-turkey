// The game's remote MCP server, a Vercel function at /mcp (vercel.json rewrites it here). Someone adds that one
// address to Claude Code, Codex, Cursor, Claude, ChatGPT or any MCP client, and their AI has the whole guide to
// building their own home for the game: forking the repo, the plan format, checking a plan, the Blender build, adding
// it to the game, deploying to Vercel, and playing on the TV. Read-only, with no sign-in. Each request gets its own
// server (Streamable HTTP, no sessions, JSON replies), which suits a function that may start cold every time.
//
// The same function serves /llms.txt and /llms-full.txt, plain text for an AI that reads pages but cannot add a
// connector, and a short page for a person who opens /mcp in a browser.
import { readFileSync } from 'node:fs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ErrorCode, GetPromptRequestSchema, ListPromptsRequestSchema, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import { homeTools, SERVER } from '../mcp/home-tools.mjs';

const VERSION = '1.0.0';
const examplePlan = JSON.parse(readFileSync(new URL('../homes/example-home/plan.json', import.meta.url), 'utf8'));
/** The palette's color names and their hex colors, read from blender/lib.py so the two never disagree. */
const palette = (() => {
  const lib = readFileSync(new URL('../blender/lib.py', import.meta.url), 'utf8');
  const block = lib.slice(lib.indexOf('PALETTE = {'), lib.indexOf('\n}', lib.indexOf('PALETTE = {')));
  const skip = new Set(['coat', 'point', 'muzzle', 'ear', 'ear_in', 'nose', 'eye', 'eye_hi', 'jumper', 'jumper_hem', 'foot', 'tail_tip', 'white']);
  return Object.fromEntries([...block.matchAll(/'([a-z_]+)':\s*'(#[0-9a-f]{6})'/gi)].map((m) => [m[1], m[2]]).filter(([k]) => !skip.has(k)));
})();

/**
 * The repo this site was built from: PUBLIC_REPO_URL if set, else the one Vercel deployed (so a fork's guide points
 * at the fork), else the original.
 */
function repo() {
  if (process.env.PUBLIC_REPO_URL) return process.env.PUBLIC_REPO_URL.replace(/\/$/, '');
  const { VERCEL_GIT_PROVIDER: host, VERCEL_GIT_REPO_OWNER: owner, VERCEL_GIT_REPO_SLUG: slug } = process.env;
  if (host === 'github' && owner && slug) return `https://github.com/${owner}/${slug}`;
  return 'https://github.com/fritzhand/grab-the-turkey';
}

/** The site's own address, from the request, so a preview deployment (or a fork) points at itself. */
function origin(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim();
  const proto = String(req.headers['x-forwarded-proto'] || (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https')).split(',')[0].trim();
  return `${proto}://${host}`;
}

const tools = (req) => homeTools({ site: origin(req), repo: repo(), examplePlan, palette: Object.keys(palette), paletteHex: palette });

function createServer(req) {
  const t = tools(req);
  const byName = new Map(t.tools.map((x) => [x.name, x]));
  const server = new Server({ ...SERVER, version: VERSION }, { capabilities: { tools: {}, prompts: {} }, instructions: t.instructions });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: t.tools.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = byName.get(request.params.name);
    if (!tool) return { isError: true, content: [{ type: 'text', text: `No tool named "${request.params.name}".` }] };
    const args = request.params.arguments ?? {};
    // the schema's enums and required fields, checked here (the SDK's low-level server does not)
    for (const key of tool.inputSchema.required ?? []) {
      if (args[key] === undefined || args[key] === '') return { isError: true, content: [{ type: 'text', text: `${key} is required.` }] };
    }
    for (const [key, spec] of Object.entries(tool.inputSchema.properties ?? {})) {
      const v = args[key];
      if (v === undefined) continue;
      if (spec.enum && !spec.enum.includes(v)) return { isError: true, content: [{ type: 'text', text: `${key} must be one of: ${spec.enum.join(', ')}.` }] };
      if (spec.pattern && (typeof v !== 'string' || !new RegExp(spec.pattern).test(v))) return { isError: true, content: [{ type: 'text', text: `${key} must look like "my-home": lowercase letters, numbers and dashes.` }] };
    }
    return { content: [{ type: 'text', text: tool.run(args) }] };
  });
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: t.prompts.map(({ name, title, description, arguments: a }) => ({ name, title, description, arguments: a })),
  }));
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const p = t.prompts.find((x) => x.name === request.params.name);
    if (!p) throw new McpError(ErrorCode.InvalidParams, `No prompt named "${request.params.name}".`);
    return { description: p.description, messages: [{ role: 'user', content: { type: 'text', text: p.text(request.params.arguments ?? {}) } }] };
  });
  return server;
}

const send = (res, status, type, body, headers = {}) => {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(body);
};

async function readBody(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body || 'null') : req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : undefined;
}

function llms(req, full) {
  if (full) return tools(req).fullText();
  const site = origin(req);
  return `# Grab the Turkey

> A party game for phones and a TV: grab the turkey and keep it from your family and the dog, collect the gold coins, and trap the leprechaun. Build your own home as the place it's played, from a floor plan and photos, with headless Blender.

## For AI assistants

- MCP server: ${site}/mcp (Streamable HTTP, read-only, no sign-in). Add it as a connector for the whole guide to building a home: get_started, get_step, plan_format, example_plan, check_plan, place_file.
- The whole guide as one text: ${site}/llms-full.txt
- The code, to fork: ${repo()}

## Pages

- [Play](${site}/): start a room on a phone
- [Put it on the TV](${site}/?tv): the TV shows the house from above; phones join with a QR code
- [Watch a demo](${site}/?demo): a whole game with made-up players
`;
}

function about(req) {
  const site = origin(req);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Grab the Turkey for your AI</title>
<style>body{font:17px/1.6 system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem;color:#2b2420;background:#f8f4e8}code{background:#efe7d4;padding:.1em .35em;border-radius:4px}a{color:inherit}</style></head><body>
<h1>Build your home for Grab the Turkey, with your AI</h1>
<p>This address is an MCP server. Add <code>${site}/mcp</code> to your AI, and it can take you from forking the game to playing in your own house on the TV: the floor plan, the Blender build, the deploy.</p>
<p>In Claude Code: <code>claude mcp add --transport http grab-the-turkey ${site}/mcp</code>. In Claude: Settings, then Connectors, then Add custom connector, and paste the address. In Codex, Cursor, ChatGPT and others, add it wherever they take a remote MCP server.</p>
<p>No connectors? Ask your AI to read <a href="${site}/llms-full.txt">${site}/llms-full.txt</a>. Or just <a href="${site}/">play the game</a>.</p>
</body></html>`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID');
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id, MCP-Protocol-Version');
  if (req.method === 'OPTIONS') return send(res, 204, 'text/plain', '');

  const url = new URL(req.url || '/', 'http://localhost');
  if (req.method === 'GET' && url.searchParams.has('llms')) {
    return send(res, 200, 'text/plain; charset=utf-8', llms(req, url.searchParams.get('llms') === 'full'), { 'Cache-Control': 'public, max-age=300' });
  }
  if (req.method === 'GET') {
    // A client opening a stream of server messages: this server has none to send, so the specification's answer is 405.
    if (String(req.headers.accept || '').includes('text/event-stream')) return send(res, 405, 'application/json', JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'This server sends no stream. Send requests with POST.' }, id: null }), { Allow: 'POST, OPTIONS' });
    return send(res, 200, 'text/html; charset=utf-8', about(req));
  }
  if (req.method !== 'POST') return send(res, 405, 'application/json', JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null }), { Allow: 'GET, POST, OPTIONS' });

  let body;
  try {
    body = await readBody(req);
  } catch {
    return send(res, 400, 'application/json', JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null }));
  }
  const server = createServer(req);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch {
    if (!res.headersSent) send(res, 500, 'application/json', JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null }));
  }
}
