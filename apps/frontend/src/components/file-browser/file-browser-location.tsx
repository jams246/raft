import { Fragment } from 'react'
import { getBreadcrumbs } from './file-browser-breadcrumbs'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'

interface FileBrowserLocationProps {
  path: string
  isFrozen: boolean
  onNavigate: (path: string) => void
}

export function FileBrowserLocation({ path, isFrozen, onNavigate }: FileBrowserLocationProps) {
  const breadcrumbs = getBreadcrumbs(path)
  return (
    <Breadcrumb
      aria-label="Current location"
      className="flex min-h-[3.75rem] flex-none items-center border-b border-divider bg-secondary px-5 py-3 font-mono text-sm"
    >
      <BreadcrumbList className="flex-wrap gap-2">
        {breadcrumbs.map((breadcrumb, index) => (
          <Fragment key={breadcrumb.path}>
            {index > 0 ? <BreadcrumbSeparator className="text-muted-foreground">/</BreadcrumbSeparator> : null}
            <BreadcrumbItem>
              {index === breadcrumbs.length - 1 ? (
                <BreadcrumbPage className="text-foreground">{breadcrumb.name}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Button
                    className="h-auto p-0 text-primary hover:bg-transparent"
                    disabled={isFrozen}
                    onClick={() => onNavigate(breadcrumb.path)}
                    variant="ghost"
                  >
                    {breadcrumb.name}
                  </Button>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
