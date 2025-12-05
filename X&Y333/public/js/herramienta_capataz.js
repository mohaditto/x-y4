document.addEventListener("DOMContentLoaded", () => {
  const inputBuscar = document.getElementById("buscaHerramienta");
  const btnBuscar = document.getElementById("btnBuscar");
  const tablaBodyHerr = document.querySelector("#content2 table tbody");
  const trabajadorSelect = document.getElementById("trabajadorSelect");
  const btnPrestar = document.getElementById("btnPrestar");

  if (!inputBuscar || !tablaBodyHerr) return;


  // funcion de mensajes flotantes

  function showMessage(msg, type = "info") {
    const box = document.createElement("div");
    box.textContent = msg;
    box.className = `msg ${type}`;
    Object.assign(box.style, {
      position: "fixed",
      top: "20px",
      right: "20px",
      padding: "10px 15px",
      background: type === "error" ? "#f44336" : "#4CAF50",
      color: "white",
      borderRadius: "6px",
      zIndex: 9999,
      boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
      transition: "opacity 0.3s",
    });
    document.body.appendChild(box);
    setTimeout(() => (box.style.opacity = "0"), 3500);
    setTimeout(() => box.remove(), 4000);
  }

  let herramientas = [];
  let seleccionadas = [];
  let herramientaSeleccionadaId = null;

  // funcion para obtener color según estado
  function getColorPorEstado(estado) {
    const colores = {
      'DISPONIBLE': '#4CAF50',
      'NO_DISPONIBLE': '#FF9800',
      'MANTENCION': '#2196F3',
      'DAÑADA': '#F44336',
      'BAJA': '#9C27B0'
    };
    return colores[estado] || '#999';
  }

  // Abrir modal para cambiar estado
  function abrirModalEstado(herramientaId, herramientaNombre) {
    herramientaSeleccionadaId = herramientaId;
    document.getElementById("modalHerramientaNombre").textContent = `Herramienta: ${herramientaNombre}`;
    document.getElementById("modalEstado").style.display = "flex";
    document.querySelectorAll('input[name="nuevoEstado"]').forEach(r => r.checked = false);
  }

  // Cerrar modal
  document.getElementById("btnCancelarEstado").addEventListener("click", () => {
    document.getElementById("modalEstado").style.display = "none";
    herramientaSeleccionadaId = null;
  });

  // Confirmar cambio de estado
  document.getElementById("btnConfirmarEstado").addEventListener("click", async () => {
    const nuevoEstado = document.querySelector('input[name="nuevoEstado"]:checked')?.value;

    if (!nuevoEstado) {
      showMessage("Seleccione un estado válido", "error");
      return;
    }

    if (!herramientaSeleccionadaId) {
      showMessage("Error: Herramienta no identificada", "error");
      return;
    }
    //peticion al backend para cambiar estado
    try {
      const resp = await fetch(`/api/capataz/herramientas/estado/${herramientaSeleccionadaId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: nuevoEstado })
      });

      const data = await resp.json();

      if (resp.ok) {
        showMessage("Estado actualizado correctamente", "success");
        document.getElementById("modalEstado").style.display = "none";
        await cargarHerramientas();
      } else {
        showMessage(data.message || "Error al actualizar estado", "error");
      }
    } catch (error) {
      console.error("Error:", error);
      showMessage("Error al cambiar estado", "error");
    }
  });


  // Cargar trabajadores en <select>
  async function cargarTrabajadores() {
    try {
      const resp = await fetch("/api/capataz/trabajadores");
      const data = await resp.json();

      trabajadorSelect.innerHTML =
        '<option value="">Seleccione un trabajador</option>';

      data.forEach((t) => {
        const opt = document.createElement("option");
        opt.value = t.id;
        opt.textContent = t.nombre;
        trabajadorSelect.appendChild(opt);
      });
    } catch (error) {
      console.error("Error al cargar trabajadores:", error);
      showMessage("Error al cargar trabajadores", "error");
    }
  }


  // Cargar herramientas dañadas

  async function cargarHerramientasDañadas() {
    try {
      // Solicitar herramientas dañadas al backend
      const resp = await fetch("/api/capataz/herramientas/danadas");
      const herramientasDañadas = await resp.json();

      const alertaDañadas = document.getElementById("alertaDañadas");
      const listaDañadas = document.getElementById("listaDañadas");

      if (herramientasDañadas.length > 0) {
        alertaDañadas.style.display = "block";
        alertaDañadas.classList.remove("d-none");

        // Mostrar la lista de herramientas dañadas
        listaDañadas.innerHTML = herramientasDañadas.map(h => `
          <div style="padding: 8px; border-left: 3px solid #f44336; margin-bottom: 8px; background: #fff3cd;">
            <strong>${h.nombre}</strong> (${h.codigo}) - <span style="color: #d32f2f; font-weight: bold;">${h.estado}</span>
            ${h.descripcion ? `<br><small>${h.descripcion}</small>` : ''}
            ${h.ubicacion ? `<br><small>Ubicación: ${h.ubicacion}</small>` : ''}
          </div>
        `).join('');
      } else {
        alertaDañadas.style.display = "none";
        alertaDañadas.classList.add("d-none");
      }
    } catch (error) {
      console.error("Error al cargar herramientas dañadas:", error);
    }
  }

  // Cargar herramientas

  async function cargarHerramientas() {
    try {
      const resp = await fetch("/api/capataz/herramientas");
      herramientas = await resp.json();
      mostrarHerramientas(herramientas);

      // tambien cargar herramientas dañadas
      await cargarHerramientasDañadas();
    } catch (error) {
      console.error(error);
      showMessage("Error al cargar herramientas", "error");
    }
  }


  // Mostrar herramientas en tabla
  function mostrarHerramientas(lista) {
    tablaBodyHerr.innerHTML = "";
    seleccionadas = [];

    // Manejar caso sin herramientas
    lista.forEach((h) => {
      const fila = document.createElement("tr");
      const colorEstado = getColorPorEstado(h.estado);
      fila.innerHTML = `
        <td>
          <input type="checkbox" class="checkHerr" data-id="${h.id}" ${h.estado === "DISPONIBLE" ? "" : "disabled"
        }>
          ${h.nombre}
        </td>
        <td>${h.descripcion || "-"}</td>
        <td style="color: ${colorEstado}; font-weight: bold;">● ${h.estado}</td>
        <td>
          <button class="btnCambiarEstado" data-id="${h.id}" data-nombre="${h.nombre}" style="padding: 5px 10px; background: #2196F3; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 12px;">Cambiar estado</button>
        </td>
      `;
      tablaBodyHerr.appendChild(fila);
    });

    // Evento: botones para cambiar estado
    document.querySelectorAll(".btnCambiarEstado").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = parseInt(e.target.dataset.id);
        const nombre = e.target.dataset.nombre;
        abrirModalEstado(id, nombre);
      });
    });

    // Evento: selección de herramientas
    document.querySelectorAll(".checkHerr").forEach((chk) => {
      chk.addEventListener("change", (e) => {
        const id = parseInt(e.target.dataset.id);
        if (e.target.checked) seleccionadas.push(id);
        else seleccionadas = seleccionadas.filter((x) => x !== id);
      });
    });
  }


  // Buscar herramientas por nombre
  btnBuscar.addEventListener("click", () => {
    const termino = inputBuscar.value.toLowerCase();
    const filtradas = herramientas.filter((h) =>
      h.nombre.toLowerCase().includes(termino)
    );
    mostrarHerramientas(filtradas);
  });


  // Registrar prestamo
  btnPrestar.addEventListener("click", async () => {
    const trabajador_id = trabajadorSelect.value;
    const user = JSON.parse(localStorage.getItem("user"));
    const capataz_id = user ? user.id : null;

    if (!capataz_id || !trabajador_id) {
      showMessage("Seleccione un trabajador válido.", "error");
      return;
    }

    if (seleccionadas.length === 0) {
      showMessage("Debe seleccionar al menos una herramienta.", "error");
      return;
    }

    btnPrestar.disabled = true;
    btnPrestar.textContent = "Prestando...";

    // Enviar solicitud al backend
    try {
      const resp = await fetch("/api/capataz/herramientas/prestar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capataz_id,
          trabajador_id,
          herramientas: seleccionadas,
        }),
      });

      const data = await resp.json();

      if (resp.ok) {
        showMessage(data.message, "success");
        if (resp.ok) {
          showMessage(data.message, "success");

          seleccionadas = [];
          await cargarHerramientas();

          // Actualizar historial si la funcion está definida(typeof cargarHistorial === "function")
          if (typeof cargarHistorial === "function") {
            await cargarHistorial();
          }
        }


        seleccionadas = [];
        await cargarHerramientas();
      } else {
        // Si hay herramientas dañadas, mostrar el error 
        if (data.herramientas_danadas && data.herramientas_danadas.length > 0) {
          const herramiientasList = data.herramientas_danadas.map(h => `${h.nombre} (${h.estado})`).join(", ");
          showMessage(` No se pueden prestar herramientas dañadas: ${herramiientasList}`, "error");
        } else {
          showMessage(data.message || "Error al registrar préstamo", "error");
        }
      }
    } catch (error) {
      console.error(error);
      showMessage("No se pudo registrar el préstamo", "error");
    } finally {
      btnPrestar.disabled = false;
      btnPrestar.textContent = "Prestar herramienta";

    }
  });


  // inicializacion
  cargarTrabajadores();
  cargarHerramientas();


  // Conectar SSE (EventSource) y escuchar cambios en herramientas para sincronizar
  try {
    if (typeof EventSource !== 'undefined') {
      const es = new EventSource('/sse');
      es.addEventListener('herramienta:estado', async () => { await cargarHerramientas(); });      
      es.addEventListener('herramienta:updated', async () => { await cargarHerramientas(); });
      es.addEventListener('herramienta:deleted', async () => { await cargarHerramientas(); });
      es.addEventListener('prestamo:created', async () => { await cargarHerramientas(); });
    }
  } catch (e) { console.warn('SSE capataz init failed', e); }

});
