import { type FSWatcher, watch } from 'node:fs'
import { toFilesystemFailure } from './filesystem-failures.js'

const WATCH_DEBOUNCE_MS = 75

interface DirectoryWatch {
  watcher: FSWatcher
  listeners: Set<{ onChange: () => void; onError: () => void }>
  debounce: ReturnType<typeof setTimeout> | undefined
}

export class DirectoryWatchAdapter {
  private readonly watches = new Map<string, DirectoryWatch>()

  subscribe(absolutePath: string, onChange: () => void, onError: () => void): () => void {
    let directoryWatch = this.watches.get(absolutePath)
    if (!directoryWatch) {
      let watcher: FSWatcher
      try {
        watcher = watch(absolutePath)
      } catch (error) {
        throw toFilesystemFailure(error)
      }
      const createdWatch: DirectoryWatch = { watcher, listeners: new Set(), debounce: undefined }
      directoryWatch = createdWatch
      this.watches.set(absolutePath, createdWatch)
      const notify = () => {
        if (createdWatch.debounce) clearTimeout(createdWatch.debounce)
        createdWatch.debounce = setTimeout(() => {
          createdWatch.debounce = undefined
          createdWatch.listeners.forEach((listener) => listener.onChange())
        }, WATCH_DEBOUNCE_MS)
      }
      createdWatch.watcher.on('change', notify)
      createdWatch.watcher.on('error', () => {
        if (createdWatch.debounce) clearTimeout(createdWatch.debounce)
        createdWatch.watcher.close()
        if (this.watches.get(absolutePath) === createdWatch) this.watches.delete(absolutePath)
        createdWatch.listeners.forEach((listener) => listener.onError())
      })
    }

    const listener = { onChange, onError }
    directoryWatch.listeners.add(listener)
    return () => {
      if (!directoryWatch) return
      directoryWatch.listeners.delete(listener)
      if (directoryWatch.listeners.size > 0) return
      if (directoryWatch.debounce) clearTimeout(directoryWatch.debounce)
      directoryWatch.watcher.close()
      if (this.watches.get(absolutePath) === directoryWatch) this.watches.delete(absolutePath)
    }
  }
}
