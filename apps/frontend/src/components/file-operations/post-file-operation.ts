export async function postFileOperation(url: string, body: object, fallbackMessage: string) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (response.ok) return

  const result: { message?: string } | undefined = await response.json().catch(() => undefined)
  throw new Error(result?.message ?? fallbackMessage)
}
