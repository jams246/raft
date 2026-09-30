import type { Metadata } from 'next'
import './themes.css'
import './globals.css'
import './dialogs.css'
import './workspace.css'
import './upload.css'
import './copy.css'

export const metadata: Metadata = {
  title: 'RAFT - Remote Access File Tool',
  description: 'Browse mounted files from one focused workspace.'
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
