'use client'

import { useState } from 'react'

export function FileBrowser() {
  const [virtualPath, setVirtualPath] = useState('/')

  return (
    <main className="file-browser">
      <header className="file-browser__header">
        <h1 className="file-browser__title">File Browser</h1>
        <button className="file-browser__pane-toggle" disabled type="button">
          Dual Pane
        </button>
      </header>

      <section aria-label="File pane" className="file-browser__pane">
        <nav aria-label="Current location" className="file-browser__breadcrumbs">
          <button onClick={() => setVirtualPath('/')} type="button">
            My Files
          </button>
          <span aria-current="page">{virtualPath === '/' ? '' : virtualPath}</span>
        </nav>

        <div aria-label="File actions" className="file-browser__toolbar">
          {['Upload', 'Download', 'Copy', 'Move', 'Rename', 'New Folder', 'Delete'].map((action) => (
            <button disabled key={action} type="button">
              {action}
            </button>
          ))}
        </div>

        <section className="file-browser__list" aria-label="Files">
          <p className="file-browser__empty">Files will appear here.</p>
        </section>
      </section>

      <section aria-label="Operation status" className="file-browser__operation-area" hidden>
        No active operation.
      </section>
    </main>
  )
}
