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

export const metadata: Metadata = {
  title: 'Sentinel — a treasury that cannot be overspent',
  description:
    'An agent-native, key-safe DeFi treasury on Sui. The agent proposes; a Move policy enforces your budget on every trade. The agent never holds a key.',
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
