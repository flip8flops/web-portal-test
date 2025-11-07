import './globals.css';
import type { Metadata } from 'next';
import { Navbar } from '@/components/navbar';
import { Sidebar } from '@/components/sidebar';

const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Metagapura Portal';

export const metadata: Metadata = {
  title: appName,
  description: 'Minimal Metagapura Portal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 dark:from-gray-900 dark:via-blue-950/30 dark:to-purple-950/30 text-gray-900 dark:text-gray-100">
        <div className="flex h-screen flex-col">
          <Navbar />
          <div className="flex flex-1 overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto p-8">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}


