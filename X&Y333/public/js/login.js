(() => {
  const form   = document.getElementById('loginForm');
  const email  = document.getElementById('email');
  const pass   = document.getElementById('password');
// Manejar el evento submit del formulario 
  async function onSubmit(e) {
    e.preventDefault();

    try {
      const payload = {
        email: (email.value || '').trim().toLowerCase(),
        password: (pass.value || '').trim()
      };
      //valida campos incompletos
      if (!payload.email || !payload.password) {
        Swal.fire({
          icon: 'warning',
          title: 'Campos incompletos',
          text: 'Ingresa tu email y contraseña.',
          confirmButtonColor: '#d33'
        });
        return;
      }
      // Enviar solicitud de login al backend
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Credenciales incorrectas');

      //Guardar token y datos del usuario logueado
      localStorage.setItem('jwt', data.token);
      localStorage.setItem('user', JSON.stringify({
        id: data.id || data.usuario_id || data.usuario?.id, 
        nombre: data.nombre || data.usuario?.nombre,
        email: data.email || data.usuario?.email,
        rol: data.rol || data.usuario?.rol
      }));

      // Mensaje ingreso correcto
      await Swal.fire({
        icon: 'success',
        title: 'Bienvenido',
        text: 'Ingreso correcto.',
        timer: 1200,
        showConfirmButton: false
      });

      // redirigir segun rol
      const rol = (data.rol || data.usuario?.rol || '').toLowerCase();
      if (rol === 'admin') location.href = '/administrador.html';
      else if (rol === 'capataz') location.href = '/trabajador.html';
      else if (rol === 'trabajador') location.href = '/trabajador2.html';
      else location.href = '/index.html';

    } catch (err) {
      console.error('Error en login:', err);

      // ALERTA LOGIN FALLIDO
      Swal.fire({
        icon: 'error',
        title: 'Acceso denegado',
        text: err.message || 'Credenciales incorrectas.',
        confirmButtonText: 'Reintentar',
        confirmButtonColor: '#d33',
        backdrop: 'rgba(0,0,0,0.4)',
        showClass: {
          popup: 'animate__animated animate__shakeX'
        }
      });
    }
  }

  form?.addEventListener('submit', onSubmit);
})();
