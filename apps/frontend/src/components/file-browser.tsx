'use client'

import type { DirectoryListing, FileEntry } from '@raft/shared'
import { useEffect, useState } from 'react'

const actions = ['Upload', 'Download', 'Copy', 'Move', 'Rename', 'New Folder', 'Delete']

export function FileBrowser() {
  const [listing, setListing] = useState<DirectoryListing>()
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    const abortController = new AbortController()

    async function loadRootListing() {
      setIsLoading(true)
      setHasError(false)

      try {
        const response = await fetch('/api/files?path=/', { signal: abortController.signal })
        if (!response.ok) throw new Error('Listing request failed.')

        setListing((await response.json()) as DirectoryListing)
      } catch {
        if (!abortController.signal.aborted) setHasError(true)
      } finally {
        if (!abortController.signal.aborted) setIsLoading(false)
      }
    }

    void loadRootListing()
    return () => abortController.abort()
  }, [retryCount])

  function renderEntry(entry: FileEntry) {
    let icon = '⚠'
    if (entry.type === 'directory') icon = '📁'
    if (entry.type === 'file') icon = '📄'

    return (
      <tr className={entry.type === 'unsupported' ? 'file-browser__entry file-browser__entry--unsupported' : 'file-browser__entry'} key={entry.path}>
        <td>
          <span aria-hidden="true">{icon}</span> {entry.name}
          {entry.type === 'unsupported' ? <span className="file-browser__status"> Unsupported</span> : null}
        </td>
      </tr>
    )
  }

  const rootEntries = listing?.entries ?? []
  const hasRootDirectories = rootEntries.some((entry) => entry.type === 'directory')

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
          <span aria-current="page">My Files</span>
        </nav>

        <div aria-label="File actions" className="file-browser__toolbar">
          {actions.map((action) => (
            <button disabled key={action} type="button">
              {action}
            </button>
          ))}
        </div>

        <section className="file-browser__list" aria-label="Files">
          {isLoading ? (
            <p aria-live="polite" className="file-browser__empty">
              Loading folders…
            </p>
          ) : null}
          {hasError ? (
            <div className="file-browser__empty" role="alert">
              <p>Unable to load folders. Check the server connection and try again.</p>
              <button onClick={() => setRetryCount((count) => count + 1)} type="button">
                Try again
              </button>
            </div>
          ) : null}
          {listing && !isLoading && !hasError ? (
            <>
              <table aria-label="Files in My Files" className="file-browser__table">
                <thead>
                  <tr>
                    <th className="file-browser__heading" scope="col">
                      Name
                    </th>
                  </tr>
                </thead>
                <tbody>{rootEntries.map(renderEntry)}</tbody>
              </table>
              {!hasRootDirectories ? (
                <div className="file-browser__empty">
                  <p>No folders available.</p>
                  <p>Mount one or more directories under /data to make them available here.</p>
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      </section>

      <section aria-label="Operation status" className="file-browser__operation-area" hidden>
        No active operation.
      </section>
    </main>
  )
}
