(() => {
  //traemos la url desde routes , y creamos api base , para hacer peticiones al backend
  const API = new URL('/api/admin', window.location.origin).toString();

  //local storage para el token JWT, y hacer peticiones las cuales , tenga que estar autenticadas , y validaciones en tiemopo real
  function authHeader() {
    const token = localStorage.getItem('jwt');
    if (!token) {
      alert('Sesión expirada. Inicia sesión.');
      location.href = '/index.html';
      return {};
    }
    return { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  }
  //funcion para hacer peticiones al backend (routes) para manejo de errores
  async function api(path, opts = {}) {
    // manda peticion al backend , y permite hacer metodos GET, POST, PATCH, DELETE , json y headers extras
    const res = await fetch(API + path, { ...opts, headers: { ...authHeader(), ...(opts.headers || {}) } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      throw new Error(data?.error || data?.message || ('HTTP ' + res.status));
    }
    return data;
  }
  //funcion para manejar respuestas que pueden venir en diferentes formatos
  const unwrap = (p) => Array.isArray(p) ? p : (Array.isArray(p?.data) ? p.data : []);
  // selector corto para el DOM
  const $ = (sel) => document.querySelector(sel);

  //  ROLES 
  async function loadRoles() {
    try {
      const r = await api('/roles');
      const roles = unwrap(r);
      const sel = $('#rol_id');
      if (!sel) return;
      sel.innerHTML = '';
      roles.forEach(x => {
        // crear opciones del select de roles 
        const o = document.createElement('option');
        o.value = x.id;
        o.textContent = x.nombre;
        sel.appendChild(o);
      });
      // habilita el boton de crear una vez cargados los roles
      $('#btn-crear-usuario')?.removeAttribute('disabled');
    } catch (e) {
      console.error('No se pudieron cargar roles:', e.message);
    }
  }

  //  LISTADO 
  async function loadUsuarios() {
    try {
      const r = await api('/usuarios');
      const rows = unwrap(r);
      //llenamos la tabla con los usuarios
      const tbody = $('#tbl-usuarios tbody');
      if (!tbody) return;
      //crea el html de la tabla
      tbody.innerHTML = '';

      //llena las filas recorriendo los usuarios
      rows.forEach(u => {
        const tr = document.createElement('tr');
        tr.dataset.id = u.id;
        tr.innerHTML = `
          <td class="col-nombre">${u.nombre}</td>
          <td class="col-email">${u.email}</td>
          <td class="col-rol">${u.rol}</td>
          <td class="col-activo">${u.activo ? 'Activo' : 'Inactivo'}</td>
          <td class="col-actions" style="white-space:nowrap">
            <button class="btn-xs u-edit">Editar</button>
            <button class="btn-xs u-pass">Editar Contraseña</button>
            <button class="btn-xs u-toggle">${u.activo ? 'Desactivar' : 'Activar'}</button>
            <button class="btn-xs u-del">Eliminar</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
      // si no hay usuarios , muestra mensaje
      if (rows.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="5" style="text-align:center;opacity:.7">Sin usuarios</td>`;
        tbody.appendChild(tr);
      }
    } catch (e) {
      alert('Error al cargar usuarios: ' + e.message);
    }
  }

  // CREAR 
  async function crearUsuario(e) {
    e.preventDefault();
    // obtener datos del formulario 
    const nombre = $('#nuevoUsuario')?.value?.trim();
    const email = $('#correo')?.value?.trim().toLowerCase();
    const password = $('#pass')?.value?.trim();
    const rol_id = Number($('#rol_id')?.value || 0);
    const activo = $('#u_activo')?.checked ? 1 : 0;

    if (!nombre || !email || !password || !rol_id) {
      alert('Faltan campos: nombre, correo, contraseña y rol.');
      return;
    }

    // comparar nombres
    const nombreNorm = nombre.toLowerCase();

    try {
      //traer usuarios existentes
      const resp = await api('/usuarios');
      const lista = Array.isArray(resp) ? resp : (resp.data || []);

      //validar correo duplicado
      const existeCorreo = lista.some(u =>
        (u.email || '').toLowerCase() === email
      );

      if (existeCorreo) {
        alert('Ese correo ya está registrado.');
        return;
      }

      //validar nombre duplicado 
      const existeNombre = lista.some(u =>
        (u.nombre || '').trim().toLowerCase() === nombreNorm
      );

      if (existeNombre) {
        alert('Ese nombre de usuario ya existe.');
        return;
      }

      // si todo ok, crear usuario
      await api('/usuarios', {
        method: 'POST',
        body: JSON.stringify({ nombre, email, password, rol_id, activo })
      });

      $('#frm-usuario')?.reset();
      await loadUsuarios();

    } catch (e) {
      //validaciones de correo duplicado y nombre duplicado desde el backend

      if (/correo.*registrado|email.*registrado|ya está registrado/i.test(e.message)) {
        alert('Ese correo ya está registrado.');
      } else if (/usuario.*registrado|usuario.*existe/i.test(e.message)) {
        alert('Nombre ya registrado.');
      } else {
        alert('No se pudo crear el usuario: ' + e.message);
      }
    }
  }


  //EDITAR (nombre/email/rol)
  async function editarUsuario(id) {
    // obtener datos actuales del usuario
    const tr = document.querySelector(`#tbl-usuarios tbody tr[data-id="${id}"]`);
    if (!tr) return;

    // obtener datos actuales
    const nombre = tr.querySelector('.col-nombre').textContent.trim();
    const email = tr.querySelector('.col-email').textContent.trim();
    const rolTxt = tr.querySelector('.col-rol').textContent.trim();
    const activo = tr.querySelector('.col-activo').textContent.includes('Activo') ? 1 : 0;

    // Obtener roles del backend
    const rolesResp = await api('/roles');
    const roles = unwrap(rolesResp);

    // Crear opciones del select de roles 
    const rolesOptions = roles.map(r => `
    <option value="${r.id}" ${r.nombre === rolTxt ? 'selected' : ''}>${r.nombre}</option>
  `).join('');

    // SweetAlert2 FORM , con los datos actuales rellenados , para editar , y obtener los nuevos valores
    const { value: formValues } = await Swal.fire({
      title: 'Editar usuario',
      width: 600,
      html: `
      <style>
        .swal-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
          margin-top: 10px;
          text-align: left;
        }
        .swal-grid-full {
          grid-column: span 2;
        }
        .swal-label {
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 5px;
          color: #444;
          display: block;
        }
        .swal2-input {
          width: 100% !important;
          box-sizing: border-box;
        }
      </style>

      <div class="swal-grid">

        <div class="swal-grid-full">
          <span class="swal-label">Nombre</span>
          <input id="swal-nombre" class="swal2-input" placeholder="Nombre" value="${nombre}">
        </div>

        <div class="swal-grid-full">
          <span class="swal-label">Email</span>
          <input id="swal-email" class="swal2-input" placeholder="Email" value="${email}">
        </div>

        <div>
          <span class="swal-label">Rol</span>
          <select id="swal-rol" class="swal2-input" style="height:45px;">
            ${rolesOptions}
          </select>
        </div>

        <div>
          <span class="swal-label">Estado</span>
          <select id="swal-activo" class="swal2-input" style="height:45px;">
            <option value="1" ${activo === 1 ? 'selected' : ''}>Activo</option>
            <option value="0" ${activo === 0 ? 'selected' : ''}>Inactivo</option>
          </select>
        </div>

      </div>
    `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Guardar cambios',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#d33',
       //confirmacion de los nuevos valores
      preConfirm: () => {
        const nuevoNombre = document.getElementById('swal-nombre').value.trim();
        const nuevoEmail = document.getElementById('swal-email').value.trim().toLowerCase();
        const nuevoRol = Number(document.getElementById('swal-rol').value);
        const nuevoActivo = Number(document.getElementById('swal-activo').value);

        if (!nuevoNombre || !nuevoEmail) {
          Swal.showValidationMessage('Nombre y email son obligatorios');
          return false;
        }

        return {
          nombre: nuevoNombre,
          email: nuevoEmail,
          rol_id: nuevoRol,
          activo: nuevoActivo
        };
      }
    });

    if (!formValues) return; // canceló

    // Guardar cambios en API
    await api(`/usuarios/${id}`, {
      method: "PATCH",
      body: JSON.stringify(formValues)
    });
    // mensaje de exito
    Swal.fire({
      icon: 'success',
      title: 'Usuario actualizado',
      timer: 1400,
      showConfirmButton: false
    });

    await loadUsuarios();
  }



  // RESET PASSWORD con SweetAlert2
  async function resetPassword(id) {
    if (!id) return;
    // SweetAlert2 FORM para cambiar contraseña
    const { value: pass } = await Swal.fire({
      title: 'Cambiar contraseña',
      html: `
      <input id="swal-pass" class="swal2-input" type="password" placeholder="Nueva contraseña">
      <input id="swal-pass2" class="swal2-input" type="password" placeholder="Repetir contraseña">
    `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Actualizar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#d33',
      preConfirm: () => {
        const p1 = document.getElementById('swal-pass').value.trim();
        const p2 = document.getElementById('swal-pass2').value.trim();

        if (!p1 || !p2) {
          Swal.showValidationMessage('Completa ambos campos');
          return false;
        }
        if (p1.length < 4) {
          Swal.showValidationMessage('Debe tener al menos 4 caracteres');
          return false;
        }
        if (p1 !== p2) {
          Swal.showValidationMessage('Las contraseñas no coinciden');
          return false;
        }

        return p1;
      }
    });

    if (!pass) return; // Si canceló, no hace nada

    try {
      await api(`/usuarios/${id}/password`, {
        method: 'PATCH',
        body: JSON.stringify({ password: pass })
      });

      Swal.fire({
        icon: 'success',
        title: 'Contraseña actualizada',
        text: 'El usuario ya puede iniciar sesión con su nueva clave.',
        timer: 1500,
        showConfirmButton: false
      });

    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error al actualizar',
        text: e.message || 'No se pudo actualizar la contraseña.',
        confirmButtonColor: '#d33'
      });
    }
  }


  //  ACTIVAR / DESACTIVAR , cambiar estado activo/inactivo
  async function toggleActivo(id, activar) {
    try {
      await api(`/usuarios/${id}/estado`, { method: 'PATCH', body: JSON.stringify({ activo: activar ? 1 : 0 }) });
      await loadUsuarios();
    } catch (e) {
      alert('No se pudo cambiar el estado: ' + e.message);
    }
  }

  //  ELIMINAR 
  async function eliminarUsuario(id) {
    if (!id) return;

    //confirmacion con sweetalert2
    const result = await Swal.fire({
      title: '¿Eliminar usuario?',
      text: 'Esta acción es permanente.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      backdrop: 'rgba(0,0,0,0.4)',
    });

    // Si cancela, no hace nada
    if (!result.isConfirmed) return;

    try {
      await api(`/usuarios/${id}`, { method: 'DELETE' });

      // mensaje de exito
      Swal.fire({
        icon: 'success',
        title: 'Usuario eliminado',
        text: 'El usuario fue eliminado correctamente.',
        timer: 1500,
        showConfirmButton: false,
      });

      await loadUsuarios();

    } catch (e) {

      // Error al eliminar
      Swal.fire({
        icon: 'error',
        title: 'Error al eliminar',
        text: e.message || 'No se pudo eliminar este usuario.',
        confirmButtonColor: '#d33'
      });
    }
  }

  //  Eventos 
  function wire() {
    // crear
    $('#btn-crear-usuario')?.addEventListener('click', crearUsuario);

    // tabla (delegado)
    document.addEventListener('click', (e) => {
      const t = e.target;
      const tr = t.closest('#tbl-usuarios tbody tr');
      const id = tr?.dataset?.id;
      if (!id) return;

      if (t.classList.contains('u-edit')) editarUsuario(id);
      if (t.classList.contains('u-pass')) resetPassword(id);
      if (t.classList.contains('u-toggle')) toggleActivo(id, t.textContent.includes('Activar'));
      if (t.classList.contains('u-del')) eliminarUsuario(id);
    });
  }
  // inicializacion de la pagina ,cargar roles y usuarios, y asignar eventos
  document.addEventListener('DOMContentLoaded', async () => {
    wire();
    await loadRoles();
    await loadUsuarios();
  });
})();
