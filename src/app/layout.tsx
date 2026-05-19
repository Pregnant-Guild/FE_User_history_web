import localFont from 'next/font/local';
import './globals.css';
import "flatpickr/dist/flatpickr.css";
import { SidebarProvider } from '@/context/SidebarContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { Toaster } from 'sonner';
import StoreProvider from '@/store/StoreProvider';
 
const sfPro = localFont({
  src: [
     {
       path: '../../public/font/SF-Pro-Display/SF-Pro-Display-Regular.otf',
       weight: '400',
       style: 'normal',
     },
     {
       path: '../../public/font/SF-Pro-Display/SF-Pro-Display-Medium.otf',
       weight: '500',
       style: 'normal',
     },
     {
       path: '../../public/font/SF-Pro-Display/SF-Pro-Display-Semibold.otf',
       weight: '600',
       style: 'normal',
     },
     {
       path: '../../public/font/SF-Pro-Display/SF-Pro-Display-Bold.otf',
       weight: '700',
       style: 'normal',
     },
   ],
 })
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${sfPro.className} dark:bg-gray-900`}>
        <StoreProvider>
          <ThemeProvider>
            <SidebarProvider>{children} <Toaster closeButton richColors position="top-right" /> </SidebarProvider>
          </ThemeProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
