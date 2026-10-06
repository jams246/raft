import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'RAFT - Remote Access File Tool',
  description: 'Browse mounted files from one focused workspace.'
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className="dark" lang="en">
      <body className="font-sans">{children}</body>
    </html>
  )
}
