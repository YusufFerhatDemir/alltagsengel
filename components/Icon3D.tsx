import Image from 'next/image'

export default function Icon3D({ size = 118, float = false, priority = false }: { size?: number; float?: boolean; priority?: boolean }) {
  return (
    <div className={`icon3d-wrap${float ? ' icon3d-float' : ''}`} style={{ ['--sz' as string]: `${size}px`, margin: '0 auto' }}>
      <div className="icon3d" style={{ ['--sz' as string]: `${size}px` }}>
        <Image src="/assets/icon.jpg" alt="Alltagsengel" fill sizes={`${size}px`} priority={priority} />
      </div>
    </div>
  )
}
