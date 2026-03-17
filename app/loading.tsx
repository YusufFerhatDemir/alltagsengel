export default function Loading() {
  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#1A1612',
      fontFamily: "'Jost', sans-serif",
    }}>
      <div style={{
        width: 44,
        height: 44,
        border: '3px solid rgba(201,150,60,.2)',
        borderTopColor: '#C9963C',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
