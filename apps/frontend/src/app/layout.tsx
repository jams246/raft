import type { Metadata } from 'next'
import './globals.css'
import './upload.css'

export const metadata: Metadata = {
  title: 'File Browser',
  description: 'Browse mounted files from one focused workspace.'
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
