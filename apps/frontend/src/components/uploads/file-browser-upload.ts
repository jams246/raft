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

  let folderName: string | undefined
  const folderFiles: UploadManifestItem['files'] = []
  for (const [part, file] of files.entries()) {
    const components = file.webkitRelativePath.split('/')
    const [componentFolder, ...relativeComponents] = components
    if (
      componentFolder === undefined ||
      relativeComponents.length === 0 ||
      components.some((component) => !component || component === '.' || component === '..')
    ) {
      throw new Error('The selected folder contains an invalid relative path.')
    }
    folderName ??= componentFolder
    if (folderName !== componentFolder) throw new Error('Select one folder at a time.')
    folderFiles.push({ part, path: relativeComponents.join('/') })
  }
  if (folderName === undefined) throw new Error('The selected folder contains no files.')

  return { files, manifest: { items: [{ name: folderName, type: 'directory', files: folderFiles }] } }
}

export function createUploadFormData(selection: UploadSelection): FormData {
  const formData = new FormData()
  formData.append('manifest', JSON.stringify(selection.manifest))
  for (const [index, file] of selection.files.entries()) formData.append(`file${index}`, file, file.name)
  return formData
}
