'use client'

import { type ChangeEvent, useCallback, useRef, useState } from 'react'
import { type UploadSelection, createUploadSelection } from './file-browser-upload'
import { UploadDialog } from './upload-dialog'

interface FileBrowserUploadOptions {
  directory: string
  isOperationLocked: boolean
  onUploadError: (error: string) => void
  onUploadRequestStarted: (controller: AbortController) => void
  onUploadRequestFinished: (controller: AbortController, error?: string) => void
}

export function useFileBrowserUpload(options: FileBrowserUploadOptions) {
  const { onUploadRequestStarted } = options
  const [uploadSelection, setUploadSelection] = useState<UploadSelection>()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  function readUploadSelection(event: ChangeEvent<HTMLInputElement>, isFolder: boolean) {
    const files = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ''
    options.onUploadError('')
    try {
      setUploadSelection(createUploadSelection(files, isFolder))
    } catch (error) {
      options.onUploadError(error instanceof Error ? error.message : 'Unable to read selected items.')
    }
  }

  const closeUploadDialog = useCallback(() => setUploadSelection(undefined), [])
  const beginUploadRequest = useCallback(
    (controller: AbortController) => {
      setUploadSelection(undefined)
      onUploadRequestStarted(controller)
    },
    [onUploadRequestStarted]
  )

  return {
    openFiles: () => fileInputRef.current?.click(),
    openFolder: () => folderInputRef.current?.click(),
    inputs: (
      <>
        <input
          aria-label="Choose files to upload"
          className="file-browser__upload-input"
          multiple
          onChange={(event) => readUploadSelection(event, false)}
          ref={fileInputRef}
          type="file"
        />
        <input
          {...{ webkitdirectory: '' }}
          aria-label="Choose a folder to upload"
          className="file-browser__upload-input"
          onChange={(event) => readUploadSelection(event, true)}
          ref={folderInputRef}
          type="file"
        />
      </>
    ),
    dialog: uploadSelection ? (
      <UploadDialog
        directory={options.directory}
        isOperationLocked={options.isOperationLocked}
        onClose={closeUploadDialog}
        onRequestFinished={options.onUploadRequestFinished}
        onRequestStarted={beginUploadRequest}
        selection={uploadSelection}
      />
    ) : null
  }
}
