import React from 'react'

interface Props {
  src: string
  onClose: () => void
}

export default function Lightbox({ src, onClose }: Props) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [scale, setScale] = React.useState(1)
  const [tx, setTx] = React.useState(0)
  const [ty, setTy] = React.useState(0)
  const [start, setStart] = React.useState<{x:number;y:number}|null>(null)
  const [pinch, setPinch] = React.useState<{d:number; s:number} | null>(null)
  const [swipeDY, setSwipeDY] = React.useState(0)
  const lastTapRef = React.useRef(0)

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const clamp = (val:number, min:number, max:number) => Math.max(min, Math.min(max, val))

  const onTouchStart: React.TouchEventHandler = (e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const d = Math.hypot(dx, dy)
      setPinch({ d, s: scale })
      setStart(null)
    } else if (e.touches.length === 1) {
      setStart({ x: e.touches[0].clientX - tx, y: e.touches[0].clientY - ty })
      setPinch(null)
      setSwipeDY(0)
    }
  }

  const onTouchMove: React.TouchEventHandler = (e) => {
    if (pinch && e.touches.length === 2) {
      e.preventDefault()
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const d = Math.hypot(dx, dy)
      const newScale = clamp(pinch.s * (d / pinch.d), 1, 4)
      setScale(newScale)
      return
    }
    if (start && e.touches.length === 1) {
      e.preventDefault()
      const x = e.touches[0].clientX - start.x
      const y = e.touches[0].clientY - start.y
      setTx(x)
      setTy(y)
      setSwipeDY(prev => prev + (e.changedTouches[0]?.clientY ? 0 : 0))
    }
  }

  const onTouchEnd: React.TouchEventHandler = (e) => {
    if (!start && !pinch && e.changedTouches.length === 1) {
      // Tap / double tap
      const now = Date.now()
      if (now - lastTapRef.current < 300) {
        setScale(prev => prev > 1 ? 1 : 2)
        setTx(0); setTy(0)
      }
      lastTapRef.current = now
    }
    if (start && scale === 1) {
      // Swipe-to-dismiss when not zoomed
      const dy = e.changedTouches[0].clientY - (start.y + 0)
      if (dy > 80) { onClose(); return }
    }
    setStart(null)
    setPinch(null)
  }

  const onWheel: React.WheelEventHandler = (e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    setScale(s => clamp(s + delta, 1, 4))
  }

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={(e) => { if (e.target === containerRef.current) onClose() }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onWheel={onWheel}
    >
      <button className="absolute top-3 right-3 px-3 py-1.5 rounded bg-white text-gray-800" onClick={onClose}>Close</button>
      <img
        src={src}
        alt="Receipt"
        style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})`, transition: pinch ? 'none' : 'transform 0.1s ease-out' }}
        className="max-h-[90vh] max-w-[95vw] object-contain select-none touch-none"
        draggable={false}
      />
    </div>
  )
}
