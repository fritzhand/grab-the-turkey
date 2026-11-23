// The MCP server on your own computer, with the routes vercel.json gives it on Vercel: /mcp, /llms.txt and
// /llms-full.txt. To try it in an MCP client before you push: npm run mcp:dev, then http://localhost:8787/mcp.
import { createServer } from 'node:http';
import handler from '../api/mcp.mjs';

const ROUTES = { '/mcp': '/api/mcp', '/llms.txt': '/api/mcp?llms=short', '/llms-full.txt': '/api/mcp?llms=full' };
const port = Number(process.env.PORT || 8787);
createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (!ROUTES[path]) {
    res.statusCode = 404;
    return res.end('Try /mcp, /llms.txt, or /llms-full.txt');
  }
  req.url = ROUTES[path];
  handler(req, res);
}).listen(port, () => console.log(`Grab the Turkey MCP server: http://localhost:${port}/mcp`));
