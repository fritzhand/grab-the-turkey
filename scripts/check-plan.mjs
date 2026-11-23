// Checks a home plan before you build it: npm run check-plan -- homes/my-home/plan.json
// The same checks as the MCP server's check_plan tool (mcp/check-plan.mjs). Exits 1 when there are errors.
import { readFileSync } from 'node:fs';
import { checkPlan } from '../mcp/check-plan.mjs';

const path = process.argv[2];
if (!path) {
  console.error('usage: npm run check-plan -- homes/<id>/plan.json');
  process.exit(2);
}
const lib = readFileSync(new URL('../blender/lib.py', import.meta.url), 'utf8');
const block = lib.slice(lib.indexOf('PALETTE = {'), lib.indexOf('\n}', lib.indexOf('PALETTE = {')));
const palette = [...block.matchAll(/'([a-z_]+)':\s*'#[0-9a-f]{6}'/gi)].map((m) => m[1]);
const r = checkPlan(readFileSync(path, 'utf8'), { palette });
if (r.summary) console.log(r.summary);
for (const e of r.errors) console.log(`error    ${e}`);
for (const w of r.warnings) console.log(`warning  ${w}`);
console.log(r.ok ? (r.warnings.length ? 'It builds; have a look at the warnings.' : 'It builds.') : `${r.errors.length} error(s) to fix before building.`);
process.exit(r.ok ? 0 : 1);
