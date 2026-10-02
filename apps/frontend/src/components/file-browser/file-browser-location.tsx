import { getBreadcrumbs } from './file-browser-breadcrumbs'

interface FileBrowserLocationProps {
  path: string
  isFrozen: boolean
  onNavigate: (path: string) => void
}

export function FileBrowserLocation({ path, isFrozen, onNavigate }: FileBrowserLocationProps) {
  const breadcrumbs = getBreadcrumbs(path)
  return (
    <nav aria-label="Current location" className="file-browser__breadcrumbs">
      {breadcrumbs.map((breadcrumb, index) => (
        <span className="file-browser__breadcrumb" key={breadcrumb.path}>
          {index > 0 ? <span aria-hidden="true">/</span> : null}
          {index === breadcrumbs.length - 1 ? (
            <span aria-current="page">{breadcrumb.name}</span>
          ) : (
            <button className="file-browser__breadcrumb-link" disabled={isFrozen} onClick={() => onNavigate(breadcrumb.path)} type="button">
              {breadcrumb.name}
            </button>
          )}
        </span>
      ))}
    </nav>
  )
}
