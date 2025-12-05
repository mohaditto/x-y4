(() => {
  // Elementos del DOM 
  const form = document.querySelector('#loginForm');
  const emailEl = document.querySelector('#email');
  const passEl  = document.querySelector('#password');
  const msgEl   = document.querySelector('#loginMsg');
// Mostrar mensajes
  function setMsg(t, ok=false){
    if(msgEl){
      msgEl.textContent=t;
      msgEl.style.color = ok ? '#2e7d32' : '#c62828';
    }
  }
// Manejar el evento submit del formulario
  async function login(e){
    e.preventDefault();
    try{
      const email = (emailEl?.value||'').trim().toLowerCase();
      const password = (passEl?.value||'').trim();
      if(!email || !password) return setMsg('Completa email y contraseña');
      // Enviar solicitud de login al backend
      const res = await fetch('/api/auth/login', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ email, password })
      });
    // Procesar respuesta
      const data = await res.json();
      if(!res.ok) throw new Error(data.error || 'Error de login');

      localStorage.setItem('jwt', data.token);
      localStorage.setItem('user', JSON.stringify({ nombre:data.nombre, email:data.email, rol:data.rol }));
      setMsg('Ingreso correcto', true);

      // redireccion segun rol
      const r = (data.rol||'').toLowerCase();
      if(r==='admin')        location.href = '/administrador.html';
      else if(r==='capataz') location.href = '/capataz.html';
      else if(r==='trabajador') location.href = '/trabajador.html';
      else                   location.href = '/index.html';
    }catch(err){
      console.error(err);
      setMsg(err.message||'Error de servidor');
    }
  }
  // Enlazar el evento submit del formulario
  form?.addEventListener('submit', login);
})();
