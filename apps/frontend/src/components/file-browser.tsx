'use client'

import type { DirectoryListing, FileEntry } from '@raft/shared'
import { useEffect, useState } from 'react'

const actions = ['Upload', 'Download', 'Copy', 'Move', 'Rename', 'New Folder', 'Delete']
const sizeUnits = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
const sizeFormatter = new Intl.NumberFormat('en', { maximumFractionDigits: 1 })

export function FileBrowser() {
  const [listing, setListing] = useState<DirectoryListing>()
  const [path, setPath] = useState('/')
  const [selectedPath, setSelectedPath] = useState<string>()
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    const abortController = new AbortController()

    async function loadDirectoryListing() {
      setIsLoading(true)
      setHasError(false)

      try {
        const query = new URLSearchParams({ path })
        const response = await fetch(`/api/files?${query}`, { signal: abortController.signal })
        if (!response.ok) throw new Error('Listing request failed.')

        setListing((await response.json()) as DirectoryListing)
      } catch {
        if (!abortController.signal.aborted) setHasError(true)
      } finally {
        if (!abortController.signal.aborted) setIsLoading(false)
      }
    }

    void loadDirectoryListing()
    return () => abortController.abort()
  }, [path, retryCount])

  function navigateTo(nextPath: string) {
    setSelectedPath(undefined)
    setPath(nextPath)
  }

  function renderEntry(entry: FileEntry) {
    let icon = '⚠'
    if (entry.type === 'directory') icon = '📁'
    if (entry.type === 'file') icon = '📄'
    const isSelected = selectedPath === entry.path
    const rowClasses = ['file-browser__entry']
    if (entry.type === 'unsupported') rowClasses.push('file-browser__entry--unsupported')
    if (isSelected) rowClasses.push('file-browser__entry--selected')

    return (
      <tr
        className={rowClasses.join(' ')}
        key={entry.path}
        onClick={() => {
          if (entry.type !== 'unsupported') setSelectedPath(entry.path)
        }}
        onDoubleClick={() => {
          if (entry.type === 'directory') navigateTo(entry.path)
        }}
      >
        <td>
          {entry.type === 'unsupported' ? (
            <>
              <span aria-hidden="true">{icon}</span> {entry.name}
              <span className="file-browser__status"> Unsupported</span>
            </>
          ) : (
            <button aria-pressed={isSelected} className="file-browser__entry-button" type="button">
              <span aria-hidden="true">{icon}</span> {entry.name}
            </button>
          )}
        </td>
        <td className="file-browser__size">{entry.type === 'file' && entry.size !== undefined ? formatFileSize(entry.size) : '—'}</td>
      </tr>
    )
  }

  const entries = listing?.entries ?? []
  const breadcrumbs = [{ name: 'My Files', path: '/' }]
  let breadcrumbPath = ''
  for (const name of path.split('/').filter(Boolean)) {
    breadcrumbPath += `/${name}`
    breadcrumbs.push({ name, path: breadcrumbPath })
  }
  const isEmpty = path === '/' ? !entries.some((entry) => entry.type === 'directory') : entries.length === 0

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
          {breadcrumbs.map((breadcrumb, index) => {
            const isCurrent = index === breadcrumbs.length - 1

            return (
              <span className="file-browser__breadcrumb" key={breadcrumb.path}>
                {index > 0 ? <span aria-hidden="true">/</span> : null}
                {isCurrent ? (
                  <span aria-current="page">{breadcrumb.name}</span>
                ) : (
                  <button className="file-browser__breadcrumb-link" onClick={() => navigateTo(breadcrumb.path)} type="button">
                    {breadcrumb.name}
                  </button>
                )}
              </span>
            )
          })}
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
              Loading directory…
            </p>
          ) : null}
          {hasError ? (
            <div className="file-browser__empty" role="alert">
              <p>Unable to load this directory. Check the server connection and try again.</p>
              <button onClick={() => setRetryCount((count) => count + 1)} type="button">
                Try again
              </button>
            </div>
          ) : null}
          {listing && !isLoading && !hasError && (
            <>
              <table aria-label={`Files in ${path}`} className="file-browser__table">
                <thead>
                  <tr>
                    <th className="file-browser__heading" scope="col">
                      Name
                    </th>
                    <th className="file-browser__heading file-browser__size-heading" scope="col">
                      Size
                    </th>
                  </tr>
                </thead>
                <tbody>{entries.map(renderEntry)}</tbody>
              </table>
              {isEmpty && (
                <div className="file-browser__empty">
                  {path === '/' ? (
                    <>
                      <p>No folders available.</p>
                      <p>Mount one or more directories under /data to make them available here.</p>
                    </>
                  ) : (
                    <p>This directory is empty.</p>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </section>

      <section aria-label="Operation status" className="file-browser__operation-area" hidden>
        No active operation.
      </section>
    </main>
  )
}

function formatFileSize(size: number): string {
  let value = size
  let unitIndex = 0

  while (value >= 1024 && unitIndex < sizeUnits.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${sizeFormatter.format(value)} ${sizeUnits[unitIndex]}`
}
