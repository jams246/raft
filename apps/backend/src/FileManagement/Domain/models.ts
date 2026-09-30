export interface FileEntry {
  name: string
  path: string
  type: 'file' | 'directory' | 'unsupported'
  size?: number
  protectedRoot?: boolean
}

export interface DirectoryListing {
  path: string
  entries: FileEntry[]
}

export interface CopyConflict {
  source: string
  existingName: string
  suggestedName: string
}

export interface UploadConflict {
  name: string
  suggestedName: string
}

export interface ReplacementCandidate {
  name: string
  type: 'file' | 'directory'
}

export interface ResolvedPath {
  virtualPath: string
  absolutePath: string
  isDirectory: boolean
}
