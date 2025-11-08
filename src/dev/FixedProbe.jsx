export default function FixedProbe() {
  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        height: 20,
        background: 'rgba(0,128,255,0.35)',
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    />
  )
}
