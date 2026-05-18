import { useState, useEffect } from 'react'

const LS_KEY = 'nodi:active-domains'

function readFromStorage(): string[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function writeToStorage(domains: string[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(domains))
}

export function useActiveDomains(): [string[], (domains: string[]) => void] {
  const [domains, setDomainsState] = useState<string[]>(readFromStorage)

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === LS_KEY) setDomainsState(readFromStorage())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  function setDomains(next: string[]) {
    writeToStorage(next)
    setDomainsState(next)
  }

  return [domains, setDomains]
}
