import { NextResponse, type NextRequest } from 'next/server'
import { ACCESS_COOKIE, accessDigest, isPublicPath, sameDigest } from '@/core/access'

/** Gate the internal pages and APIs behind `APP_ACCESS_CODE`; without the variable everything stays open. */
export async function proxy(request: NextRequest) {
  const code = process.env.APP_ACCESS_CODE?.trim()
  const { pathname } = request.nextUrl
  if (code === undefined || code === '' || isPublicPath(pathname)) return NextResponse.next()
  const expected = await accessDigest(code)
  if (sameDigest(request.cookies.get(ACCESS_COOKIE)?.value ?? '', expected)) return NextResponse.next()
  if (pathname.startsWith('/api/')) {
    // Ingestion tools authenticate with the code as a bearer token.
    const bearer = request.headers.get('authorization') ?? ''
    if (bearer.startsWith('Bearer ') && sameDigest(await accessDigest(bearer.slice(7)), expected)) return NextResponse.next()
    return NextResponse.json({ error: 'Accès réservé : code requis.' }, { status: 401 })
  }
  const login = new URL('/connexion', request.url)
  if (pathname !== '/') login.searchParams.set('suite', pathname)
  return NextResponse.redirect(login)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
}
