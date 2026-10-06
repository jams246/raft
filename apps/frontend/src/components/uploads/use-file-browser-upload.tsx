'use client'

import { type ChangeEvent, useCallback, useRef, useState } from 'react'
import { type UploadSelection, createUploadSelection } from './file-browser-upload'
import { FileBrowserUploadInputs } from './file-browser-upload-inputs'
import { UploadDialog } from './upload-dialog'

interface FileBrowserUploadOptions {
  directory: string
  isOperationLocked: boolean
  onCloseAutoFocus: () => void
  onUploadError: (error: string) => void
  onUploadRequestStarted: (controller: AbortController) => void
  onUploadRequestFinished: (controller: AbortController, error?: string) => void
}

const EMPTY_SELECTION: UploadSelection = { files: [], manifest: { items: [] } }

export function useFileBrowserUpload(options: FileBrowserUploadOptions) {
  const { onUploadRequestStarted } = options
  const [uploadSelection, setUploadSelection] = useState<UploadSelection>()
  const [canRetryCheck, setCanRetryCheck] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  function readUploadSelection(event: ChangeEvent<HTMLInputElement>, isFolder: boolean) {
    const files = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ''
    setCanRetryCheck(true)
    options.onUploadError('')
    try {
      setUploadSelection(createUploadSelection(files, isFolder))
    } catch (error) {
      options.onUploadError(error instanceof Error ? error.message : 'Unable to read selected items.')
    }
  }

  const closeUploadDialog = useCallback(() => setUploadSelection(undefined), [])
  const changeUploadDialogOpen = useCallback(
    (open: boolean) => {
      if (!open) closeUploadDialog()
    },
    [closeUploadDialog]
  )
  const disableRetryCheck = useCallback(() => setCanRetryCheck(false), [])
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
    inputs: <FileBrowserUploadInputs fileInputRef={fileInputRef} folderInputRef={folderInputRef} onSelection={readUploadSelection} />,
    dialog: (
      <UploadDialog
        directory={options.directory}
        isOperationLocked={options.isOperationLocked}
        onCloseAutoFocus={options.onCloseAutoFocus}
        canRetryCheck={canRetryCheck}
        onDisableRetry={disableRetryCheck}
        onOpenChange={changeUploadDialogOpen}
        open={Boolean(uploadSelection)}
        onRequestFinished={options.onUploadRequestFinished}
        onRequestStarted={beginUploadRequest}
        selection={uploadSelection ?? EMPTY_SELECTION}
      />
    )
  }
}
