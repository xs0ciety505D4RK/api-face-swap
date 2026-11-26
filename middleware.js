import { next } from '@vercel/functions';

const ALLOWED_ORIGIN = 'https://xs0cietylabsz.biz.id';

export const config = {
  runtime: 'nodejs26.x',
  matcher: '/api/:path*',
};

export default function middleware(request) {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  // ── 1. Preflight OPTIONS ─────────────────────────────
  if (request.method === 'OPTIONS') {
    if (origin !== ALLOWED_ORIGIN) {
      return new Response(null, { status: 403 });
    }
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
      },
    });
  }

  // ── 2. Cek Origin kalau ada ──────────────────────────
  if (origin && origin !== ALLOWED_ORIGIN) {
    return new Response('Forbidden', { status: 403 });
  }

  // ── 3. Kalau Origin kosong, cek Referer ─────────────
  if (!origin) {
    if (!referer) {
      return new Response('Forbidden', { status: 403 });
    }
    try {
      if (new URL(referer).origin !== ALLOWED_ORIGIN) {
        return new Response('Forbidden', { status: 403 });
      }
    } catch {
      return new Response('Forbidden', { status: 403 });
    }
  }

  // ── 4. Lolos ─────────────────────────────────────────
  return next();
}
