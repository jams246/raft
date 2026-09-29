'use client'

import type { DirectoryListing } from '@raft/shared'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export function useDirectoryListing(path: string) {
  const [listing, setListing] = useState<DirectoryListing>()
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [missingPath, setMissingPath] = useState<string>()
  const [retryCount, setRetryCount] = useState(0)
  const currentPath = useRef(path)

  useLayoutEffect(() => {
    currentPath.current = path
  }, [path])

  const refresh = useCallback(() => setRetryCount((count) => count + 1), [])

  useEffect(() => {
    const abortController = new AbortController()

    async function loadDirectoryListing() {
      setIsLoading(true)
      setHasError(false)
      setMissingPath(undefined)
      try {
        const query = new URLSearchParams({ path })
        const response = await fetch(`/api/files?${query}`, { signal: abortController.signal })
        if (!response.ok) {
          const error: unknown = await response.json().catch(() => undefined)
          if (typeof error === 'object' && error !== null && 'error' in error && error.error === 'not_found') {
            if (!abortController.signal.aborted && currentPath.current === path) {
              setListing(undefined)
              setMissingPath(path)
              setHasError(true)
            }
            return
          }
          throw new Error('Listing request failed.')
        }
        const nextListing = (await response.json()) as DirectoryListing
        if (!abortController.signal.aborted && currentPath.current === path) setListing(nextListing)
      } catch {
        if (!abortController.signal.aborted && currentPath.current === path) setHasError(true)
      } finally {
        if (!abortController.signal.aborted && currentPath.current === path) setIsLoading(false)
      }
    }

    void loadDirectoryListing()
    return () => abortController.abort()
  }, [path, retryCount])

  return { listing, isLoading, hasError, missingPath, refresh }
}
