import type { Metadata, Viewport } from 'next'
import RegisterSW from '@/components/RegisterSW'
import './globals.css'

export const metadata: Metadata = {
  title: 'Slideshow',
  description: 'Photo & video slideshow with wireless remote',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Slideshow',
  },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <RegisterSW />
        {children}
      </body>
    </html>
  )
}
