import '@fontsource-variable/outfit';
import '@fontsource-variable/fraunces';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'PNC Coffee — Touchless Ordering',
  description: 'Order coffee with hand gestures — no touching required.',
  robots: { index: false, follow: false },
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#140b07',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-input-mode="gesture" suppressHydrationWarning>
      <body>
        <Providers>
          <main className="relative z-10 flex h-dvh flex-col">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
