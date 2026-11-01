import { NextResponse, type NextRequest } from 'next/server';

// Нэвтрээгүй хэрэглэгчийг нэвтрэх хуудас руу шилжүүлнэ. Эрхийн нарийн шалгалтыг хуудас бүр хийнэ.
export function middleware(req: NextRequest) {
  if (!req.cookies.get('pl_session')) {
    const url = req.nextUrl.clone();
    const next = req.nextUrl.pathname;
    url.pathname = '/login';
    url.search = next.startsWith('/exam/') || next.startsWith('/eval/') ? `?next=${encodeURIComponent(next)}` : '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/admin/:path*', '/portal/:path*', '/org/:path*', '/exam/:path*', '/eval/:path*'] };
