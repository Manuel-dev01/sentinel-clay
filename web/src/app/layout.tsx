import type { Metadata } from 'next';
import { Archivo, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-archivo',
});
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jetbrains',
});

const DESCRIPTION =
  'An agent-native, key-safe DeFi treasury on Sui. The agent proposes; a Move policy enforces your budget on every trade. The agent never holds a key.';

export const metadata: Metadata = {
  metadataBase: new URL('https://sentinel-clay-web.vercel.app'),
  title: 'Sentinel · a treasury that cannot be overspent',
  description: DESCRIPTION,
  applicationName: 'Sentinel',
  openGraph: {
    title: 'Sentinel · a treasury that cannot be overspent',
    description: DESCRIPTION,
    url: 'https://sentinel-clay-web.vercel.app',
    siteName: 'Sentinel',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sentinel · a treasury that cannot be overspent',
    description: 'The agent proposes. Only your Move policy can approve. It can never rug you.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${jetbrains.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
