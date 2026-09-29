import { Injectable } from '@nestjs/common'
import { watch, type FSWatcher } from 'node:fs'

interface DirectoryWatch {
  watcher: FSWatcher
  listeners: Set<{ onChange: () => void; onError: () => void }>
  debounce?: ReturnType<typeof setTimeout>
}

@Injectable()
export class DirectoryWatchService {
  private readonly watches = new Map<string, DirectoryWatch>()

  subscribe(absolutePath: string, onChange: () => void, onError: () => void): () => void {
    let directoryWatch = this.watches.get(absolutePath)
    if (!directoryWatch) {
      const createdWatch: DirectoryWatch = { watcher: watch(absolutePath), listeners: new Set() }
      directoryWatch = createdWatch
      this.watches.set(absolutePath, createdWatch)
      const notify = () => {
        if (createdWatch.debounce) clearTimeout(createdWatch.debounce)
        createdWatch.debounce = setTimeout(() => {
          createdWatch.debounce = undefined
          createdWatch.listeners.forEach((listener) => listener.onChange())
        }, 75)
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
