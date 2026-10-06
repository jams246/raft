'use client'

import type { ChangeEvent, RefObject } from 'react'

interface FileBrowserUploadInputsProps {
  fileInputRef: RefObject<HTMLInputElement | null>
  folderInputRef: RefObject<HTMLInputElement | null>
  onSelection: (event: ChangeEvent<HTMLInputElement>, isFolder: boolean) => void
}

export function FileBrowserUploadInputs({ fileInputRef, folderInputRef, onSelection }: FileBrowserUploadInputsProps) {
  return (
    <>
      <input aria-label="Choose files to upload" className="hidden" multiple onChange={(event) => onSelection(event, false)} ref={fileInputRef} type="file" />
      <input
        {...{ webkitdirectory: '' }}
        aria-label="Choose a folder to upload"
        className="hidden"
        onChange={(event) => onSelection(event, true)}
        ref={folderInputRef}
        type="file"
      />
    </>
  )
}
