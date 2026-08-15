/**
 * Đăng nhập nội bộ đơn giản: một mật khẩu chung cho cả team + cookie đã ký HMAC.
 * Đủ an toàn cho dashboard nội bộ và không tốn phí.
 * Muốn nâng cấp sau: thay bằng Supabase Auth (magic link) — chỉ cần đổi file này.
 */

const COOKIE_NAME = 'phomi_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14; // 14 ngày

const encoder = new TextEncoder();

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return Buffer.from(new Uint8Array(sig)).toString('base64url');
}

export async function createSessionToken(secret: string, user: string): Promise<string> {
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${encodeURIComponent(user)}.${expires}`;
  const sig = await hmac(secret, payload);
  return `${payload}.${sig}`;
}

export async function verifySessionToken(
  secret: string,
  token: string | undefined,
): Promise<{ user: string } | null> {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [user, expiresRaw, sig] = parts;
  const payload = `${user}.${expiresRaw}`;

  const expected = await hmac(secret, payload);
  if (!timingSafeEqual(sig, expected)) return null;

  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || expires < Date.now()) return null;

  return { user: decodeURIComponent(user) };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const sessionCookie = {
  name: COOKIE_NAME,
  maxAge: MAX_AGE_SECONDS,
  options: {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  },
};

/** Bảo vệ các endpoint chạy nền (cron) bằng một secret riêng. */
export function checkCronSecret(request: Request, secret: string): boolean {
  const header = request.headers.get('authorization') ?? '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  const url = new URL(request.url);
  const query = url.searchParams.get('key') ?? '';
  return timingSafeEqual(bearer || query, secret);
}
