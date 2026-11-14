/**
 * GET /api/ice: TURN servers for phones that cannot reach each other directly (some cellular and
 * office networks). Optional: with no keys set it returns an empty list and the game plays
 * peer to peer as usual.
 *
 * Set CLOUDFLARE_TURN_KEY_ID and CLOUDFLARE_TURN_API_TOKEN in the Vercel project (Cloudflare
 * Realtime, TURN keys; the free tier is generous) and this mints short-lived credentials for each
 * player. The keys never reach the browser.
 */
export async function GET(): Promise<Response> {
  const id = process.env.CLOUDFLARE_TURN_KEY_ID;
  const token = process.env.CLOUDFLARE_TURN_API_TOKEN;
  const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
  if (!id || !token) return new Response(JSON.stringify({ iceServers: [] }), { headers });
  try {
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ttl: 6 * 60 * 60 }),
    });
    if (!res.ok) throw new Error(`Cloudflare answered ${res.status}`);
    const body = (await res.json()) as { iceServers: { urls: string | string[]; username?: string; credential?: string }[] | { urls: string | string[]; username?: string; credential?: string } };
    const list = Array.isArray(body.iceServers) ? body.iceServers : [body.iceServers];
    // browsers refuse port 53; drop those addresses
    const iceServers = list
      .map((s) => ({ ...s, urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => /^turns?:/.test(u) && !/:53(\?|$)/.test(u)) }))
      .filter((s) => s.urls.length);
    return new Response(JSON.stringify({ iceServers }), { headers });
  } catch (e) {
    console.error('TURN credentials failed', e);
    return new Response(JSON.stringify({ iceServers: [] }), { headers });
  }
}
