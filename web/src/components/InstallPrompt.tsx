import React from 'react'

export default function InstallPrompt() {
  const [supportsInstall, setSupportsInstall] = React.useState(false)
  const deferredRef = React.useRef<any>(null)
  const [installed, setInstalled] = React.useState(false)

  React.useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault()
      deferredRef.current = e
      setSupportsInstall(true)
    }
    const installedHandler = () => setInstalled(true)
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', installedHandler)
    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installedHandler)
    }
  }, [])

  const onInstall = async () => {
    const promptEvent = deferredRef.current
    if (!promptEvent) return
    await promptEvent.prompt()
    const choice = await promptEvent.userChoice
    if (choice.outcome === 'accepted') {
      setSupportsInstall(false)
      deferredRef.current = null
    }
  }

  if (installed || !supportsInstall) return null

  return (
    <button onClick={onInstall} className="text-xs md:text-sm px-3 py-1.5 rounded border border-blue-600 text-blue-700 hover:bg-blue-50">
      Install App
    </button>
  )
}
