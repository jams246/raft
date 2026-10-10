'use client'

import type { DirectoryListing } from '@raft/shared'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ApiRequestError } from '@/lib/api/api-error'
import { API_REQUEST_TIMEOUT_MS, apiJson } from '@/lib/api/api-request'
import { decodeDirectoryListing } from '@/lib/api/decoders'

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
        const nextListing = await apiJson(
          `/api/files?${query}`,
          { failureMessage: 'Listing request failed.', signal: abortController.signal, timeoutMs: API_REQUEST_TIMEOUT_MS },
          decodeDirectoryListing
        )
        if (!abortController.signal.aborted && currentPath.current === path) setListing(nextListing)
      } catch (error: unknown) {
        if (abortController.signal.aborted || currentPath.current !== path) return
        if (error instanceof ApiRequestError && error.code === 'not_found') {
          setListing(undefined)
          setMissingPath(path)
        }
        setHasError(true)
      } finally {
        if (!abortController.signal.aborted && currentPath.current === path) setIsLoading(false)
      }
    }

    void loadDirectoryListing()
    return () => abortController.abort()
    // retryCount triggers explicit refreshes of the same path.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [path, retryCount])

  return { listing, isLoading, hasError, missingPath, refresh }
}
