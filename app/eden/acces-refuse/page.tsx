export default function AccesRefusePage() {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#0F1923', fontFamily:'system-ui,sans-serif' }}>
      <div style={{ textAlign:'center', maxWidth:'420px', padding:'40px 24px' }}>
        <div style={{ fontSize:'52px', marginBottom:'16px' }}>🔒</div>
        <div style={{ fontSize:'20px', fontWeight:700, color:'#C9A84C', marginBottom:'10px' }}>Accès EDEN restreint</div>
        <p style={{ fontSize:'13px', color:'#6B7A8D', lineHeight:'1.7', marginBottom:'28px' }}>
          Votre compte n'est pas autorisé à accéder au système EDEN.<br />
          Contactez l'administrateur du Cabinet DOUKE pour obtenir un accès.
        </p>
        <a href="/dashboard" style={{ display:'inline-block', padding:'10px 24px', background:'rgba(201,168,76,.12)', border:'1px solid rgba(201,168,76,.3)', borderRadius:'8px', color:'#C9A84C', textDecoration:'none', fontSize:'13px', fontWeight:500 }}>
          ← Retour au dashboard
        </a>
      </div>
    </div>
  )
}
