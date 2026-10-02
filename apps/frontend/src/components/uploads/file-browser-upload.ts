import type { UploadManifest, UploadManifestItem } from '@raft/shared'

export interface UploadSelection {
  files: File[]
  manifest: UploadManifest
}

export function createUploadSelection(files: File[], isFolder: boolean): UploadSelection {
  if (files.length === 0) throw new Error('The selected folder contains no files.')
  if (!isFolder) {
    const items = files.map((file, part): UploadManifestItem => ({ name: file.name, type: 'file', files: [{ part, path: '' }] }))
    return { files, manifest: { items } }
  }

  const item: UploadManifestItem = { name: files[0].webkitRelativePath.split('/')[0], type: 'directory', files: [] }
  files.forEach((file, part) => {
    const components = file.webkitRelativePath.split('/')
    if (components.length < 2 || components.some((component) => !component || component === '.' || component === '..')) {
      throw new Error('The selected folder contains an invalid relative path.')
    }
    const [folderName, ...relativeComponents] = components
    if (item.name !== folderName) throw new Error('Select one folder at a time.')
    item.files.push({ part, path: relativeComponents.join('/') })
  })

  return { files, manifest: { items: [item] } }
}

export function createUploadFormData(selection: UploadSelection): FormData {
  const formData = new FormData()
  formData.append('manifest', JSON.stringify(selection.manifest))
  selection.files.forEach((file, index) => formData.append(`file${index}`, file, file.name))
  return formData
}
