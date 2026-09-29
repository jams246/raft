export function getBreadcrumbs(path: string): { name: string; path: string }[] {
  const breadcrumbs = [{ name: 'My Files', path: '/' }]
  let breadcrumbPath = ''
  for (const name of path.split('/').filter(Boolean)) {
    breadcrumbPath += `/${name}`
    breadcrumbs.push({ name, path: breadcrumbPath })
  }
  return breadcrumbs
}
