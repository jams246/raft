export type FileEntryType = 'file' | 'directory' | 'unsupported'

export interface FileEntry {
  name: string
  path: string
  type: FileEntryType
  protectedRoot?: boolean
}

export interface DirectoryListing {
  path: string
  entries: FileEntry[]
}
