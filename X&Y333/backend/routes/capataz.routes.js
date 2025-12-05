import express from "express";
import { pool } from "../db.js";
const router = express.Router();

const ESTADOS_VALIDOS = ["DISPONIBLE","NO_DISPONIBLE","MANTENCION","DAÑADA","BAJA"];


// REGISTRO DE ASISTENCIA


// Registsrar ENTRADA
router.post("/asistencia", async (req, res) => {
  try {
    const { fecha, hora_entrada, usuario_id } = req.body;
    console.log("Datos recibidos CAPATAZ:", req.body);

    if (!fecha || !hora_entrada || !usuario_id) {
      return res.status(400).json({ message: "Faltan datos obligatorios" });
    }

    const fechaSQL = fecha; // formato correcto desde el front

    const horaSolo = hora_entrada.split("T")[1]?.slice(0, 8);

    const [existe] = await pool.query(
      "SELECT id FROM asistencias WHERE usuario_id = ? AND fecha = ?",
      [usuario_id, fechaSQL]
    );

    if (existe.length > 0) {
      return res.status(400).json({ message: "Ya existe asistencia registrada para hoy" });
    }

    const [result] = await pool.query(
      "INSERT INTO asistencias (usuario_id, fecha, hora_entrada, estado, turno_id) VALUES (?, ?, ?, 'PRESENTE', 1)",
      [usuario_id, fechaSQL, horaSolo]
    );

    res.json({
      id: result.insertId,
      fecha: fechaSQL,
      hora_entrada: horaSolo.slice(0, 5),
    });

  } catch (error) {
    console.error("Error en registrar entrada CAPATAZ:", error);
    res.status(500).json({ message: "Error al registrar asistencia" });
  }
});



// Registrar SALIDA
router.put("/asistencia/salida/:usuario_id", async (req, res) => {
  try {
    //obtener la asistencia del dia para el usuario
    const { usuario_id } = req.params;
    //obtener la fecha de hoy , slice para obtener yyyy-mm-dd
    const hoy = new Date().toISOString().slice(0, 10);
    const horaSalida = new Date().toTimeString().slice(0, 8);

    //verificar que exista la asistencia del dia
    const [asistencia] = await pool.query(
      "SELECT id FROM asistencias WHERE usuario_id = ? AND fecha = ?",
      [usuario_id, hoy]
    );

    if (asistencia.length === 0) {
      return res.status(404).json({ message: "No se encontró asistencia del día para registrar salida." });
    }

    //actualizar la asistencia con la hora de salida
    const id = asistencia[0].id;
    await pool.query(
      "UPDATE asistencias SET hora_salida = ?, estado = 'PRESENTE' WHERE id = ?",
      [horaSalida, id]
    );

    res.json({
      message: "Salida registrada correctamente (Capataz)",
      hora_salida: horaSalida.slice(0, 5),
    });
  } catch (error) {
    console.error("Error al registrar salida CAPATAZ:", error);
    res.status(500).json({ message: "Error al registrar salida" });
  }
});

// Obtener asistencias
router.get("/asistencias/:usuario_id", async (req, res) => {
  try {
    const { usuario_id } = req.params;

    //segun las filas , obtener las asistencias del usuario
    const [rows] = await pool.query(
      "SELECT id, fecha, hora_entrada, hora_salida FROM asistencias WHERE usuario_id = ? ORDER BY fecha DESC, hora_entrada ASC",
      [usuario_id]
    );

    res.json(rows);
  } catch (error) {
    console.error("Error al obtener asistencias CAPATAZ:", error);
    res.status(500).json({ message: "Error al obtener asistencias" });
  }
});


// GESTIÓN DE HERRAMIENTAS
// Obtener todas las herramientas disponibles
router.get("/herramientas", async (req, res) => {
  try {
    // buscar por nombre o descripción
    const buscar = req.query.buscar || "";

    const [rows] = await pool.query(
      `SELECT id, nombre, descripcion, estado 
       FROM herramientas
       WHERE activo = 1
       AND (nombre LIKE ? OR descripcion LIKE ?)
       ORDER BY nombre ASC`,
      [`%${buscar}%`, `%${buscar}%`]
    );

    res.json(rows);
  } catch (error) {
    console.error("Error al obtener herramientas:", error);
    res.status(500).json({ message: "Error al obtener herramientas" });
  }
});

// Marcar herramienta como "En uso" (cuando el capataz la utiliza)
router.put("/herramientas/usar/:id", async (req, res) => {
  try {
    const { id } = req.params;

    //actualizar estado a no disponible 
    await pool.query(
      "UPDATE herramientas SET estado = 'NO_DISPONIBLE' WHERE id = ?",
      [id]
    );

  // Emitir actualización en tiempo real (SSE)
  try{ const b = req.app.locals.broadcast; if(b) b('herramienta:estado', { id: Number(id), estado: 'NO_DISPONIBLE' }); }catch(_){ }

    res.json({ message: "Herramienta marcada como EN USO correctamente" });
  } catch (error) {
    console.error("Error al usar herramienta:", error);
    res.status(500).json({ message: "Error al actualizar herramienta" });
  }
});

// Marcar herramienta como "Disponible" (cuando el capataz la devuelve)
router.put("/herramientas/devolver/:id", async (req, res) => {
  try {
    const { id } = req.params;

    //actualizar estado a disponible 
    await pool.query(
      "UPDATE herramientas SET estado = 'DISPONIBLE' WHERE id = ?",
      [id]
    );
    //emitir actualizacion atravez de sse
  try{ const b = req.app.locals.broadcast; if(b) b('herramienta:estado', { id: Number(id), estado: 'DISPONIBLE' }); }catch(_){ }

    res.json({ message: "Herramienta devuelta correctamente" });
  } catch (error) {
    console.error("Error al devolver herramienta:", error);
    res.status(500).json({ message: "Error al actualizar herramienta" });
  }
});

// Cambiar estado de herramienta
router.put("/herramientas/estado/:id", async (req, res) => {
  try {
    //obtiene id y estado para cambiar estado
    const { id } = req.params;
    const { estado } = req.body;

    if (!estado || !ESTADOS_VALIDOS.includes(estado)) {
      return res.status(400).json({ 
        message: "Estado no válido. Debe ser: DISPONIBLE, NO_DISPONIBLE, MANTENCION, DAÑADA, BAJA" 
      });
    }

    const [result] = await pool.query(
      "UPDATE herramientas SET estado = ? WHERE id = ?",
      [estado, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Herramienta no encontrada" });
    }

    // emitir evento con la info final (puede consultarse en listeners para refrescar)
    try{
      const b = req.app.locals.broadcast;
      if(b){
        const [[row]] = await pool.query(`SELECT h.id,h.codigo,h.nombre,h.estado,c.nombre AS categoria FROM herramientas h LEFT JOIN categorias_herramienta c ON c.id=h.categoria_id WHERE h.id=?`, [id]);
        b('herramienta:estado', row || { id: Number(id), estado });
      }
    }catch(_){ }

    res.json({ message: "Estado de herramienta actualizado correctamente", estado });
  } catch (error) {
    console.error("Error al cambiar estado de herramienta:", error);
    res.status(500).json({ message: "Error al actualizar estado de herramienta" });
  }
});


//  ASOCIAR HERRAMIENTAS A UN TRABAJADOR (PRÉSTAMOS)
// Crear un prestamo (capataz asigna herramientas a trabajador)
router.post("/herramientas/prestar", async (req, res) => {
  try {
    // tomar datos del body
    const { capataz_id, trabajador_id, herramientas } = req.body;

    if (!capataz_id || !trabajador_id || !herramientas || herramientas.length === 0) {
      return res.status(400).json({ message: "Datos incompletos para crear prestamos" });
    }

    // Validar que ninguna herramienta esté dañada
    const [herramientasCheck] = await pool.query(
      "SELECT id, nombre, estado FROM herramientas WHERE id IN (?) AND estado IN ('DAÑADA', 'BAJA')",
      [herramientas]
    );
    //si hay herramientas dañadas , devolver error
    if (herramientasCheck.length > 0) {
      const herramientasDanadas = herramientasCheck.map(h => `${h.nombre} (${h.estado})`).join(", ");
      return res.status(400).json({ 
        message: `No se pueden prestar herramientas dañadas o dadas de baja: ${herramientasDanadas}`,
        herramientas_danadas: herramientasCheck
      });
    }

    // Registrar prestamo con fecha actual en el backend
    const [prestamoResult] = await pool.query(
      "INSERT INTO prestamos (capataz_id, trabajador_id, fecha_entrada, estado) VALUES (?, ?, NOW(), 'ACTIVO')",
      [capataz_id, trabajador_id]
    );

    //obtener id del prestamo ya hecho
    const prestamo_id = prestamoResult.insertId;

    // Asociar herramientas — insertar explicitamente estado_devolucion='PENDIENTE' y hora_entrada=NULL
    for (const herramienta_id of herramientas) {
      await pool.query(
        "INSERT INTO prestamo_items (prestamo_id, herramienta_id, estado_devolucion, hora_entrada) VALUES (?, ?, 'PENDIENTE', NULL)",
        [prestamo_id, herramienta_id]
      );

      // Marcar herramienta como no disponible
      await pool.query(
        "UPDATE herramientas SET estado = 'NO_DISPONIBLE' WHERE id = ?",
        [herramienta_id]
      );
      // Emitir evento por cada herramienta prestada
      try{ const b = req.app.locals.broadcast; if(b) b('herramienta:estado', { id: Number(herramienta_id), estado: 'NO_DISPONIBLE' }); }catch(_){ }
    }
    //crea evento sse de nuevo prestamo creado
  try{ const b = req.app.locals.broadcast; if(b) b('prestamo:created', { prestamo_id, capataz_id, trabajador_id }); }catch(_){ }

    res.json({ message: "Préstamo creado correctamente", prestamo_id });
  } catch (error) {
    console.error("Error al crear préstamo:", error);
    res.status(500).json({ message: "Error al registrar préstamo" });
  }
  
});


// Devolver herramienta
router.put("/herramientas/devolver-prestamo/:herramienta_id", async (req, res) => {
  try {
    const { herramienta_id } = req.params;
    
    // Actualizar prestamo_items para marcar como devuelta
    await pool.query(
      `UPDATE prestamo_items 
       SET hora_entrada = NOW(), estado_devolucion = 'OK' 
       WHERE herramienta_id = ? AND estado_devolucion = 'PENDIENTE'`,
      [herramienta_id]
    );
    // Marcar herramienta como DISPONIBLE
    await pool.query(
      "UPDATE herramientas SET estado = 'DISPONIBLE' WHERE id = ?",
      [herramienta_id]
    );
    //emite evento para el estado de la herrramienta , manda id y estado DISPONIBLE
  try{ const b = req.app.locals.broadcast; if(b) b('herramienta:estado', { id: Number(herramienta_id), estado: 'DISPONIBLE' }); }catch(_){ }

    res.json({ message: "Herramienta devuelta correctamente y disponible" });
  } catch (error) {
    console.error("Error al devolver herramienta:", error);
    res.status(500).json({ message: "Error al devolver herramienta" });
  }
});


// Obtener lista de usuarios por rol (por ejemplo, rol=10 = trabajadores)
router.get("/usuarios", async (req, res) => {
  try {
    const { rol } = req.query;

    // Si no se especifica rol, trae todos
    let query = "SELECT id, nombre, email, rol_id FROM usuarios WHERE activo = 1";
    const params = [];

    //si hay un rol , agregar a la consulta
    if (rol) {
      query += " AND rol_id = ?";
      params.push(rol);
    }
    //ejecutar consulta
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error("Error al obtener usuarios:", error);
    res.status(500).json({ message: "Error al obtener usuarios" });
  }
});

// Obtener lista de trabajadores (solo los activos)
router.get("/trabajadores", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, nombre, email FROM usuarios WHERE activo = 1 AND rol_id = 10"
    );
    res.json(rows);
  } catch (error) {
    console.error("Error al obtener trabajadores:", error);
    res.status(500).json({ message: "Error al obtener trabajadores" });
  }
});
// Obtener historial de prestamos del capataz
router.get("/historial/:capataz_id", async (req, res) => {
  try {
    const { capataz_id } = req.params;

    const [rows] = await pool.query(`
      SELECT 
        p.id AS prestamo_id,
        DATE_FORMAT(p.fecha_entrada, '%Y-%m-%d %H:%i:%s') AS fecha_prestamo,
        DATE_FORMAT(p.fecha_salida, '%Y-%m-%d %H:%i:%s') AS fecha_devolucion,
        p.estado,
        u.nombre AS trabajador,
        h.nombre AS herramienta
      FROM prestamos p
      JOIN usuarios u ON u.id = p.trabajador_id
      JOIN prestamo_items pi ON pi.prestamo_id = p.id
      JOIN herramientas h ON h.id = pi.herramienta_id
      WHERE p.capataz_id = ?
      ORDER BY p.fecha_entrada DESC
    `, [capataz_id]);

    res.json(rows);
  } catch (error) {
    console.error("Error al obtener historial:", error);
    res.status(500).json({ message: "Error al obtener historial" });
  }
});

// Devolver una o varias herramientas
router.put("/herramientas/devolver", async (req, res) => {
  try {
    const { herramientas } = req.body; // Array de objetos: { prestamo_id, herramienta_id }

    //validar que se envien herramientas
    if (!herramientas || herramientas.length === 0) {
      return res.status(400).json({ message: "No se enviaron herramientas a devolver." });
    }

    // por cont h en herramientas , actualizar cada una
    for (const h of herramientas) {
      await pool.query(
        "UPDATE prestamo_items SET hora_entrada = NOW() WHERE prestamo_id = ? AND herramienta_id = ?",
        [h.prestamo_id, h.herramienta_id]
      );
      // Marcar la herramienta como DISPONIBLE tambien
      await pool.query(
        "UPDATE herramientas SET estado = 'DISPONIBLE' WHERE id = ?",
        [h.herramienta_id]
      );
      // Emitir evento SSE para que clientes se sincronicen
      try{ const b = req.app.locals.broadcast; if(b) b('herramienta:estado', { id: Number(h.herramienta_id), estado: 'DISPONIBLE' }); }catch(_){ }
    }

    // Para cada prestamo afectado, comprobar si ya no quedan items pendientes; si no quedan, cerrar el préstamo
    try {
      const prestamoIds = [...new Set(herramientas.map(h => Number(h.prestamo_id)))];
      for (const pid of prestamoIds) {
        const [[pendientesRow]] = await pool.query(
          "SELECT COUNT(*) AS pendientes FROM prestamo_items WHERE prestamo_id = ? AND hora_entrada IS NULL",
          [pid]
        );
        // marcar prestamo como cerrado si no hay pendientes
        const pendientes = pendientesRow ? pendientesRow.pendientes || pendientesRow.PENDIENTES || 0 : 0;
        if (Number(pendientes) === 0) {
          await pool.query(
            "UPDATE prestamos SET estado = 'CERRADO', fecha_salida = NOW() WHERE id = ?",
            [pid]
          );
          // Emitir evento SSE de prestamo cerrado
          try{ const b = req.app.locals.broadcast; if(b) b('prestamo:closed', { prestamo_id: pid }); }catch(_){ }
        }
      }
    } catch (err) {
      console.warn('Error verificando cierre de prestamos tras devolución', err);
    }

    res.json({ message: "Devoluciones registradas correctamente" });
  } catch (error) {
    console.error("Error al registrar devoluciones:", error);
    res.status(500).json({ message: "Error al registrar devoluciones" });
  }
});
// Obtener herramientas actualmente prestadas
router.get("/prestadas", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        prestamo_id,
        herramienta_id,
        herramienta,
        trabajador,
        estado_devolucion,
        hora_salida,
        hora_entrada
      FROM vw_prestamos_activos
      WHERE hora_entrada IS NULL
    `);

    // log para depuracion en caso de error
    console.log(`/api/capataz/prestadas -> ${rows.length} rows`);
    res.json(rows);

  } catch (error) {
    console.error("Error al obtener herramientas prestadas:", error);
    res.status(500).json({ message: "Error al obtener herramientas prestadas" });
  }
});


// Obtener herramientas dañadas o en mantenimiento
router.get("/herramientas/danadas", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        id,
        nombre,
        codigo,
        estado,
        ubicacion,
        descripcion
      FROM herramientas
      WHERE estado IN ('DAÑADA', 'MANTENCION', 'BAJA')
      ORDER BY estado DESC, nombre ASC
    `);
    console.log(`/api/capataz/herramientas/danadas -> ${rows.length} rows`);
    res.json(rows);
  } catch (error) {
    console.error("Error al obtener herramientas dañadas:", error);
    res.status(500).json({ message: "Error al obtener herramientas dañadas" });
  }
});

export default router;
