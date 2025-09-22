import React from 'react'

export default function InstallPrompt() {
  const [supportsInstall, setSupportsInstall] = React.useState(false)
  const deferredRef = React.useRef<any>(null)
  const [installed, setInstalled] = React.useState(false)
  const [isIOS, setIsIOS] = React.useState(false)
  const [isStandalone, setIsStandalone] = React.useState(false)

  React.useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault()
      deferredRef.current = e
      setSupportsInstall(true)
    }
    const installedHandler = () => setInstalled(true)
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', installedHandler)
    // Detect iOS and standalone mode
    const ua = window.navigator.userAgent || ''
    setIsIOS(/iphone|ipad|ipod/i.test(ua))
    const mq = window.matchMedia && window.matchMedia('(display-mode: standalone)')
    setIsStandalone(!!(mq && mq.matches) || (window.navigator as any).standalone === true)
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

  // If already installed or running standalone, hide prompt
  if (installed || isStandalone) return null

  // On iOS there is no programmatic install; show instructions
  if (isIOS && !supportsInstall) {
    return (
      <div className="text-xs md:text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-700 bg-white">
        On iPhone: open in Safari, tap the Share icon, then "Add to Home Screen".
      </div>
    )
  }

  return (
    <button onClick={onInstall} className="text-xs md:text-sm px-3 py-1.5 rounded border border-blue-600 text-blue-700 hover:bg-blue-50">
      Install App
    </button>
  )
}
