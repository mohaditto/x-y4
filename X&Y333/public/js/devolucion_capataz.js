document.addEventListener("DOMContentLoaded", () => {
  const tablaBody = document.querySelector("#tablaDevolucion tbody");
  const btnDevolver = document.getElementById("btnDevolver");
  let prestamosActivos = [];

  //verificar que los elementos existen
  if (!tablaBody) {
    console.warn('tablaDevolucion no encontrada en el DOM. asegurate que el HTML contiene <table id="tablaDevolucion"><tbody>...</tbody></table>');
    return;
  }
  if (!btnDevolver) {
    console.warn('btnDevolver no encontrado en el DOM.');
    return;
  }

  function showMessage(msg, type = "info") {
    // Mensajes flotantes
    const box = document.createElement("div");
    box.textContent = msg;
    Object.assign(box.style, {
      position: "fixed",
      top: "20px",
      right: "20px",
      padding: "10px 15px",
      background: type === "error" ? "#f44336" : "#4CAF50",
      color: "white",
      borderRadius: "6px",
      zIndex: 9999,
    });
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 3000);
  }

  async function cargarPrestadas() {
    try {
      // cargar herramientas prestadas desde el backend
      tablaBody.innerHTML = `<tr><td colspan="3" style="text-align:center; opacity:0.7;">Cargando herramientas prestadas...</td></tr>`;
      const resp = await fetch("/api/capataz/prestadas");
      console.log('fetch /api/capataz/prestadas status:', resp.status);
      if (!resp.ok) {
        //error HTTP
        console.error('Error HTTP cargando /api/capataz/prestadas', resp.status);
        prestamosActivos = [];
      } else {
        const data = await resp.json();
        console.log('respuesta /api/capataz/prestadas:', data);
        prestamosActivos = data || [];
      }
      mostrarPrestadas(prestamosActivos);
    } catch (error) {
      console.error(error);
      showMessage("Error al cargar herramientas prestadas", "error");
    }
  }

  // Conectar SSE para actualizar la lista automáticamente cuando se creen prestamos o cambie el estado de herramientas
  try {
    if (typeof EventSource !== 'undefined') {
      //crear la conexion SSE , atraves del endpoint /sse
      const es = new EventSource('/sse');
      es.addEventListener('prestamo:created', async () => { await cargarPrestadas(); });
      es.addEventListener('herramienta:estado', async () => { await cargarPrestadas(); });
    }
  } catch (e) {
    console.warn('SSE devolucion init failed', e);
  }

  // Recargar cuando se haga click en la pestaña de Devolución (tab4)
  const tab4 = document.getElementById('tab4');
  if (tab4) {
    tab4.addEventListener('change', async (e) => {
      if (e.target.checked) {
        console.log('Pestaña Devolución activada, recargando prestadas...');
        await cargarPrestadas();
      }
    });
  }

  function mostrarPrestadas(lista) {
    // un log para depuracion y ver que se llama correctamente
    console.log('mostrarPrestadas llamada, items:', lista.length);
    tablaBody.innerHTML = "";
    // Manejar caso sin herramientas prestadas
    if (lista.length === 0) {
      const fila = document.createElement("tr");
      fila.innerHTML = `<td colspan="3" style="text-align:center;">No hay herramientas prestadas.</td>`;
      tablaBody.appendChild(fila);
      return;
    }
    lista.forEach((h) => {
      console.log('renderizando item prestada:', h);
      const fila = document.createElement("tr");
      fila.innerHTML = `
        <td>
          <input type="checkbox" class="chkDev" data-prestamo="${h.prestamo_id}" data-id="${h.herramienta_id}">
          ${h.herramienta}
        </td>
        <td>${h.trabajador}</td>
        
      `;
      tablaBody.appendChild(fila);
      console.log('fila añadida, tablaBody childCount:', tablaBody.childElementCount);
    });
  }

  // Registrar devolución
  btnDevolver.addEventListener("click", async () => {
    const seleccionadas = Array.from(document.querySelectorAll(".chkDev:checked")).map((chk) => ({
      prestamo_id: chk.dataset.prestamo,
      herramienta_id: chk.dataset.id,
    }));

    if (seleccionadas.length === 0) {
      showMessage("Selecciona al menos una herramienta.", "error");
      return;
    }

    try {
      // Enviar solicitud de devolución al backend
      const resp = await fetch("/api/capataz/herramientas/devolver", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ herramientas: seleccionadas }),
      });

      const data = await resp.json();
      if (resp.ok) {
        showMessage(data.message, "success");
        await cargarPrestadas();

        //actualizar historial de devoluciones
        try {
          const user = JSON.parse(localStorage.getItem("user"));
          const respHist = await fetch(`/api/capataz/historial/${user.id}`);
          const dataHist = await respHist.json();
          const tablaHist = document.querySelector("#tablaHistorial tbody");
          // Actualizar tabla historial 
          if (tablaHist) {
            tablaHist.innerHTML = "";
            dataHist.forEach((r) => {
              const fila = document.createElement("tr");
              fila.innerHTML = `
                <td>${r.trabajador}</td>
                <td>${r.herramienta}</td>
                <td>${new Date(r.fecha_prestamo).toLocaleDateString("es-CL")}</td>
                <td>${r.fecha_devolucion || "-"}</td>
                <td>${r.estado}</td>
              `;
              tablaHist.appendChild(fila);
            });
          }
        } catch (err) {
          console.error("Error al actualizar historial:", err);
        }
      } else {
        showMessage(data.message || "Error al devolver herramientas", "error");
      }
    } catch (error) {
      console.error(error);
      showMessage("No se pudo devolver herramientas", "error");
    }
  });

  cargarPrestadas();
});
