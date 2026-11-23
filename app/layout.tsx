import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { AvisoProvider } from '@/components/interativos';
import { nomeBar } from '@/lib/bar';
import './globals.css';

const inter = localFont({
    src: './fonts/inter-latin-wght.woff2',
    weight: '100 900',
    variable: '--font-inter',
    display: 'swap',
});

const barlow = localFont({
    src: [
        { path: './fonts/barlow-condensed-latin-600.woff2', weight: '600' },
        { path: './fonts/barlow-condensed-latin-700.woff2', weight: '700' },
    ],
    variable: '--font-barlow',
    display: 'swap',
});

export const metadata: Metadata = {
    title: { default: nomeBar, template: `%s · ${nomeBar}` },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
    return (
        <html lang="pt-BR" className={`${inter.variable} ${barlow.variable}`}>
            <body>
                <AvisoProvider>{children}</AvisoProvider>
            </body>
        </html>
    );
}
