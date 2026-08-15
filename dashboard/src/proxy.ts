import { NextResponse, type NextRequest } from 'next/server';
import { sessionCookie, verifySessionToken } from '@/lib/auth';

// Các đường dẫn không cần đăng nhập:
//  - /login              : trang đăng nhập
//  - /api/webhooks/*     : Shopify gọi vào, xác thực bằng HMAC riêng
//  - /api/sync/*         : cron gọi vào, xác thực bằng CRON_SECRET
//  - /api/health         : kiểm tra sống
const PUBLIC_PREFIXES = ['/login', '/api/webhooks', '/api/sync', '/api/health'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'Chưa cấu hình SESSION_SECRET' },
      { status: 500 },
    );
  }

  const token = request.cookies.get(sessionCookie.name)?.value;
  const session = await verifySessionToken(secret, token);

  if (!session) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
