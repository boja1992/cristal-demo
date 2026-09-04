import { useMemo } from 'react'

export function useQueryParam(key: string): string | null {
  return useMemo(() => new URLSearchParams(window.location.search).get(key), [key])
}
