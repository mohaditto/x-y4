document.addEventListener("DOMContentLoaded", () => {
  const inputAsistencia = document.getElementById("asistencia");
  const tablaBody = document.querySelector("#tablaAsistencia tbody");
  const btnEntrada = document.getElementById("btnRegistrar");
  const btnSalida = document.getElementById("btnSalida");

  // Obtener usuario logueado
  const user = JSON.parse(localStorage.getItem("user"));
  if (!user) {
    alert("Debes iniciar sesión primero");
    window.location.href = "index.html";
    return;
  }
  const usuario_id = user.id;

  // Función perfecta para formatear fechas
  function formatearFecha(fechaSQL) {
  if (!fechaSQL) return "—";

  // Si viene en formato Date completo: "2025-11-18T03:00:00.000Z"
  if (fechaSQL.includes("T")) {
    const [fecha] = fechaSQL.split("T");
    const [yyyy, mm, dd] = fecha.split("-");
    return `${dd}-${mm}-${yyyy}`;
  }

  // Si viene normal (YYYY-MM-DD)
  const [yyyy, mm, dd] = fechaSQL.split("-");
  return `${dd}-${mm}-${yyyy}`;
}


  // Mensajes flotantes
  const showMessage = (msg, type = "info") => {
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
  };

  // Fecha actual
  const ahora = new Date();
  const hoy = ahora.toISOString().slice(0, 10); // YYYY-MM-DD
  inputAsistencia.min = `${hoy}T08:00`;
  inputAsistencia.max = `${hoy}T17:00`;
  inputAsistencia.value = ahora.toISOString().slice(0, 16);

  // Cargar asistencias existentes
  async function cargarAsistencias() {
    try {
      const resp = await fetch(`/api/capataz/asistencias/${usuario_id}`);
      const data = await resp.json();

      tablaBody.innerHTML = "";

      if (data.length === 0) {
        btnEntrada.disabled = false;
        btnSalida.disabled = true;
        return;
      }

      data.forEach((a) => {
        const fila = document.createElement("tr");

        const fechaSQL = a.fecha;
        const fechaVisual = formatearFecha(fechaSQL);

        fila.innerHTML = `
          <td data-fecha="${fechaSQL}">${fechaVisual}</td>
          <td>${a.hora_entrada?.slice(0, 5) || "-"}</td>
          <td id="salida-${a.id}">${a.hora_salida?.slice(0, 5) || "-"}</td>
        `;
        tablaBody.appendChild(fila);
      });

      const asistenciaHoy = data.find(a => a.fecha === hoy);

      if (!asistenciaHoy) {
        btnEntrada.disabled = false;
        btnSalida.disabled = true;
      } else {
        btnEntrada.disabled = true;
        btnSalida.disabled = !(!asistenciaHoy.hora_salida || asistenciaHoy.hora_salida === "00:00:00");
      }

    } catch (error) {
      console.error(error);
      showMessage("Error al cargar asistencias", "error");
    }
  }

  cargarAsistencias();

  // Registrar ENTRADA
  btnEntrada.addEventListener("click", async () => {
    const valor = inputAsistencia.value;
    if (!valor) return showMessage("Selecciona una hora válida.", "error");

    const fecha = new Date(valor);

    if (fecha.toISOString().slice(0, 10) !== hoy)
      return showMessage("Solo puedes registrar asistencia del día actual.", "error");

    const hora = fecha.getHours();
    if (hora < 8 || hora >= 17)
      return showMessage("El horario permitido es entre 08:00 y 17:00.", "error");

    try {
      const resp = await fetch("/api/capataz/asistencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha: hoy, hora_entrada: valor, usuario_id }),
      });

      const data = await resp.json();

      if (resp.ok) {
        const fila = document.createElement("tr");
        //crear html de la fila con los datos recibidos
        fila.innerHTML = `
          <td data-fecha="${data.fecha}">${formatearFecha(data.fecha)}</td>
          <td>${data.hora_entrada}</td>
          <td id="salida-${data.id}">-</td>
        `;

        tablaBody.appendChild(fila);
        btnEntrada.disabled = true;
        btnSalida.disabled = false;

        showMessage("Entrada registrada correctamente", "success");
      } else {
        showMessage(data.message || "Error al registrar asistencia", "error");
      }
    } catch (err) {
      console.error(err);
      showMessage("No se pudo conectar al servidor", "error");
    }
  });

  // Registrar SALIDA
  btnSalida.addEventListener("click", async () => {
    try {
      const resp = await fetch(`/api/capataz/asistencia/salida/${usuario_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
      });

      const data = await resp.json();
      // Actualizar la tabla si la respuesta es exitosa
      if (resp.ok) {
        const filaHoy = [...tablaBody.querySelectorAll("tr")].find(f => {
          return f.querySelector("td").dataset.fecha === hoy;
        });

        // Actualizar hora de salida en la fila correspondiente (slice para mostrar HH:MM)
        if (filaHoy) {
          filaHoy.querySelector("td:last-child").textContent = data.hora_salida.slice(0, 5);
        }

        btnSalida.disabled = true;
        showMessage("Salida registrada correctamente", "success");

        await cargarAsistencias();

      } else {
        showMessage(data.message || "Error al registrar salida", "error");
      }

    } catch (err) {
      console.error(err);
      showMessage("No se pudo conectar al servidor", "error");
    }
  });

});
