export function firstConflictCounter(name: string, type: 'file' | 'directory'): bigint {
  const extensionStart = type === 'file' ? name.lastIndexOf('.') : -1
  const hasExtension = extensionStart > 0
  const fullBaseName = hasExtension ? name.slice(0, extensionStart) : name
  const counterMatch = /^(.*) \((\d+)\)$/.exec(fullBaseName)
  return counterMatch ? BigInt(counterMatch[2]) + 1n : 1n
}

export function conflictName(name: string, type: 'file' | 'directory', counter: bigint): string {
  const extensionStart = type === 'file' ? name.lastIndexOf('.') : -1
  const hasExtension = extensionStart > 0
  const fullBaseName = hasExtension ? name.slice(0, extensionStart) : name
  const counterMatch = /^(.*) \((\d+)\)$/.exec(fullBaseName)
  const baseName = counterMatch?.[1] ?? fullBaseName
  const extension = hasExtension ? name.slice(extensionStart) : ''
  return `${baseName} (${counter})${extension}`
}
