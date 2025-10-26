import React from 'react'

interface Props extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string
  alt: string
  className?: string
}

export default function Thumb({ src, alt, className = '', onClick, ...rest }: Props) {
  const [loaded, setLoaded] = React.useState(false)
  return (
    <img
      src={src}
      alt={alt}
      onClick={onClick}
      onLoad={() => setLoaded(true)}
      className={`${className} transition-all duration-300 ${loaded ? 'opacity-100 blur-0' : 'opacity-70 blur-sm'}`}
      {...rest}
    />
  )
}
