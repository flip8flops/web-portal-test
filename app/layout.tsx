import './globals.css';
import type { Metadata } from 'next';

const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Metagapura Portal';

export const metadata: Metadata = {
  title: appName,
  description: 'Minimal Metagapura Portal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <header className="w-full border-b bg-white">
          <div className="mx-auto max-w-5xl px-4 py-4 text-lg font-semibold">
            {appName}
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-10">{children}</main>
      </body>
    </html>
  );
}


