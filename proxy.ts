import { NextResponse, type NextRequest } from 'next/server';

/*
 * Verificação rápida: sem o cookie de sessão, vai para a tela de entrada.
 * A sessão de verdade é conferida no banco em cada tela e ação (lib/auth.ts).
 */
export function proxy(req: NextRequest) {
    if (req.cookies.has('caderneta_sessao')) return NextResponse.next();
    const url = new URL('/entrar', req.url);
    const caminho = req.nextUrl.pathname + req.nextUrl.search;
    if (caminho !== '/') url.searchParams.set('de', caminho);
    return NextResponse.redirect(url);
}

export const config = {
    // tudo menos a própria entrada e os arquivos do Next
    matcher: ['/((?!entrar|_next/static|_next/image|favicon.ico).*)'],
};
