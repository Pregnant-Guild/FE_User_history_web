import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from 'sonner';
import StoreProvider from '@/store/StoreProvider';

export const metadata: Metadata = {
  title: 'Ultimate History Map',
  description: 'Bản đồ tương tác lịch sử thế giới qua các thời kỳ',
};
 
const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={`${inter.className} dark:bg-gray-900`}>
        <StoreProvider>
          {children}
          <Toaster closeButton richColors position="top-right" />
        </StoreProvider>
      </body>
    </html>
  );
}
