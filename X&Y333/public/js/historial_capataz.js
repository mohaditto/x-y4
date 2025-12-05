document.addEventListener("DOMContentLoaded", () => {
  const tablaHistorial = document.querySelector("#tablaHistorial tbody");
  const inputBuscar = document.getElementById("buscarHistorial");
  const btnBuscar = document.getElementById("btnBuscarHistorial");

  const user = JSON.parse(localStorage.getItem("user"));
  if (!user) {
    alert("Debes iniciar sesión primero");
    window.location.href = "index.html";
    return;
  }

    
        function formatearFecha(fecha) {
        if (!fecha || fecha === "0000-00-00 00:00:00" || fecha === "NO DEVUELTA") {
          return "—";
        }

        // Cuando viene con hora (formato MySQL: yyyy-mm-dd hh:mm:ss)
        if (fecha.includes(" ")) {
          const [fechaSQL, horaSQL] = fecha.split(" ");
          const [yyyy, mm, dd] = fechaSQL.split("-");
          const [hh, min] = horaSQL.split(":");
          return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
        }

        // Cuando viene en : yyyy-mm-ddThh:mm:ss
        if (fecha.includes("T")) {
          const [fechaSQL, horaSQL] = fecha.split("T");
          const [yyyy, mm, dd] = fechaSQL.split("-");
          const [hh, min] = horaSQL.split(":");
          return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
        }

        // Si solo viene con fecha yyyy-mm-dd
        const [yyyy, mm, dd] = fecha.split("-");
        return `${dd}-${mm}-${yyyy}`;
      }


  // Cargar historial desde el backend  
  async function cargarHistorial() {
    try {
      const resp = await fetch(`/api/capataz/historial/${user.id}`);
      const data = await resp.json();
      // Verificar que la respuesta es un array
      if (!Array.isArray(data)) {
        console.error("Respuesta inesperada:", data);
        return;
      }

      mostrarHistorial(data);
    } catch (error) {
      console.error("Error al cargar historial:", error);
    }
  }

  // Mostrar historial en la tabla
  function mostrarHistorial(lista) {
    tablaHistorial.innerHTML = "";

    lista.forEach((r) => {
      const fila = document.createElement("tr");

      // Asigna color segun estado
      let colorEstado = "";
      switch (r.estado) {
        case "ACTIVO":
          colorEstado = "#e74c3c"; 
          break;
        case "CERRADO":
          colorEstado = "#27ae60"; 
          break;
        case "PARCIAL":
          colorEstado = "#f1c40f"; 
          break;
        default:
          colorEstado = "#95a5a6"; 
      }

      fila.innerHTML = `
        <td>${r.trabajador}</td>
        <td>${r.herramienta}</td>
        <td>${formatearFecha(r.fecha_prestamo)}</td>
        <td>${formatearFecha(r.fecha_devolucion)}</td>
        <td style="color:${colorEstado}; font-weight:600;">${r.estado}</td>
      `;

      tablaHistorial.appendChild(fila);
    });
  }

  // Filtro de búsqueda
  btnBuscar.addEventListener("click", async () => {
    const termino = inputBuscar.value.toLowerCase();
    const resp = await fetch(`/api/capataz/historial/${user.id}`);
    const data = await resp.json();

    const filtrado = data.filter(
      (r) =>
        r.trabajador.toLowerCase().includes(termino) ||
        r.herramienta.toLowerCase().includes(termino)
    );

    mostrarHistorial(filtrado);
  });

  // Cargar historial al iniciar
  cargarHistorial();

});
