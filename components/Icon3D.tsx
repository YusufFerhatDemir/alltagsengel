export default function Icon3D({ size = 118, float = false }: { size?: number; float?: boolean }) {
  return (
    <div className={`icon3d-wrap${float ? ' icon3d-float' : ''}`} style={{ ['--sz' as string]: `${size}px`, margin: '0 auto' }}>
      <div className="icon3d" style={{ ['--sz' as string]: `${size}px` }}>
        <img src="/assets/icon.jpg" alt="Alltagsengel" />
      </div>
    </div>
  )
}
