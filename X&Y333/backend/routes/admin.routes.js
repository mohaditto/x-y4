import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const r = Router();

const ESTADOS_VALIDOS = ["DISPONIBLE", "NO_DISPONIBLE", "MANTENCION", "DAÑADA", "BAJA"];
const isEmpty = v => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

// Debug son para listar las rutas disponibles en este router
r.get("/__debug", requireAuth, requireAdmin, (_req, res) => {
  res.json({
    ok: true,
    rutas: [
      // Dashboard
      "GET  /api/admin/reportes/dashboard",
      // Categorías
      "GET  /api/admin/categorias",
      // Herramientas
      "GET  /api/admin/herramientas?estado=&q=&categoria_id=",
      "POST /api/admin/herramientas",
      "PATCH /api/admin/herramientas/:id",
      "PATCH /api/admin/herramientas/:id/estado",
      "DELETE /api/admin/herramientas/:id",
      // Roles
      "GET  /api/admin/roles",
      // Usuarios
      "GET  /api/admin/usuarios",
      "POST /api/admin/usuarios",
      "PATCH /api/admin/usuarios/:id",
      "PATCH /api/admin/usuarios/:id/password",
      "PATCH /api/admin/usuarios/:id/estado",
      "DELETE /api/admin/usuarios/:id",
    ]
  });
});


// Dashboard 
r.get("/reportes/dashboard", requireAuth, requireAdmin, async (_req, res) => {
  const [[kpis]] = await pool.query(`
    SELECT
      SUM(estado='DISPONIBLE')    AS disponibles,
      SUM(estado='NO_DISPONIBLE') AS en_uso,
      SUM(estado='MANTENCION')    AS en_mantencion,
      SUM(estado='DANADA')        AS danadas,
      SUM(estado='BAJA')          AS bajas,
      COUNT(*)                    AS total
    FROM herramientas
  `);
  res.json({ ok: true, kpis: kpis || {} });
});


// Categorias de herramientas
r.get("/categorias", requireAuth, requireAdmin, async (_req, res) => {
  const [rows] = await pool.query(`
    SELECT id, nombre, slug, activa
      FROM categorias_herramienta
     WHERE activa=1
     ORDER BY nombre
  `);
  res.json({ ok: true, data: rows });
});


//obtiene listas de herramientas con su estado 
r.get("/herramientas", requireAuth, requireAdmin, async (req, res) => {
  const { estado = "", q = null, categoria_id = "" } = req.query;

  const where = [];
  const params = [];

  if (estado && ESTADOS_VALIDOS.includes(estado)) {
    where.push("h.estado = ?");
    params.push(estado);
  }
  if (categoria_id && Number(categoria_id) > 0) {
    where.push("h.categoria_id = ?");
    params.push(Number(categoria_id));
  }
  if (q && q.trim() !== "") {
    where.push("(h.codigo LIKE CONCAT('%',?,'%') OR h.nombre LIKE CONCAT('%',?,'%'))");
    params.push(q, q);
  }

  const sql = `
    SELECT h.id, h.codigo, h.nombre, h.estado, h.ubicacion,
           h.descripcion, h.valor_estimado, h.categoria_id,
           c.nombre AS categoria
      FROM herramientas h
 LEFT JOIN categorias_herramienta c ON c.id=h.categoria_id
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY h.nombre
  `;
  const [rows] = await pool.query(sql, params);
  res.json({ ok: true, data: rows });
});

//crear nueva herramienta
r.post("/herramientas", requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      categoria_id,
      codigo,
      nombre,
      descripcion = null,
      ubicacion = null,
      valor_estimado = null,
      estado = "DISPONIBLE"
    } = req.body;

    if (!categoria_id || !codigo || !nombre) {
      return res.status(400).json({ ok: false, error: "Faltan campos obligatorios: categoria_id, codigo, nombre." });
    }
    if (!ESTADOS_VALIDOS.includes(estado)) {
      return res.status(400).json({ ok: false, error: "Estado inválido." });
    }

    const [result] = await pool.query(
      `INSERT INTO herramientas(categoria_id,codigo,nombre,descripcion,ubicacion,valor_estimado,estado)
       VALUES (?,?,?,?,?,?,?)`,
      [categoria_id, codigo, nombre, descripcion, ubicacion, valor_estimado, estado]
    );

    const [[row]] = await pool.query(
      `SELECT h.*, c.nombre AS categoria
         FROM herramientas h
    LEFT JOIN categorias_herramienta c ON c.id=h.categoria_id
        WHERE h.id=?`,
      [result.insertId]
    );

    // Emitir evento en tiempo real (SSE)
    try { const b = req.app.locals.broadcast; if (b) b('herramienta:created', row); } catch (_) { }
    res.status(201).json({ ok: true, data: row });
  } catch (e) {
    if (e?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ ok: false, error: "El código ya existe. Debe ser único." });
    }
    console.error("POST /herramientas error:", e);
    res.status(500).json({ ok: false, error: "No se pudo crear la herramienta." });
  }
});

// Actualizar solo codigo, nombre atravez de patch
r.patch("/herramientas/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { codigo, nombre, categoria_id } = req.body;

    if (!codigo && !nombre && !categoria_id) {
      return res.status(400).json({ ok: false, error: "Debes enviar al menos un campo (codigo, nombre o categoria_id)." });
    }

    const campos = [];
    const valores = [];

    if (codigo) { campos.push("codigo = ?"); valores.push(codigo); }
    if (nombre) { campos.push("nombre = ?"); valores.push(nombre); }
    if (categoria_id) { campos.push("categoria_id = ?"); valores.push(Number(categoria_id)); }

    valores.push(id);

    const [result] = await pool.query(
      `UPDATE herramientas SET ${campos.join(", ")} WHERE id=?`,
      valores
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, error: "Herramienta no encontrada." });
    }

    const [[row]] = await pool.query(`
      SELECT h.id, h.codigo, h.nombre, h.estado,
             c.nombre AS categoria
        FROM herramientas h
   LEFT JOIN categorias_herramienta c ON c.id=h.categoria_id
       WHERE h.id=?`, [id]);

    try { const b = req.app.locals.broadcast; if (b) b('herramienta:updated', row); } catch (_) { }
    res.json({ ok: true, data: row });
  } catch (e) {
    if (e?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ ok: false, error: "El código ya existe. Debe ser único." });
    }
    console.error("PATCH /herramientas/:id error:", e);
    res.status(500).json({ ok: false, error: "No se pudo actualizar la herramienta." });
  }
});

// Obtener una herramienta por ID 
r.get("/herramientas/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const [[row]] = await pool.query(
      `SELECT h.id, h.codigo, h.nombre, h.descripcion, h.categoria_id, h.estado,
              c.nombre AS categoria
         FROM herramientas h
    LEFT JOIN categorias_herramienta c ON c.id = h.categoria_id
        WHERE h.id = ?`,
      [id]
    );

    if (!row) {
      return res.status(404).json({ ok: false, error: "Herramienta no encontrada." });
    }

    res.json({ ok: true, data: row });

  } catch (e) {
    console.error("GET /herramientas/:id error:", e);
    res.status(500).json({ ok: false, error: "No se pudo obtener la herramienta." });
  }
});

// Cambiar estado de herramienta atravez igual mente de patch
r.patch("/herramientas/:id/estado", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { estado, detalle = null } = req.body;

    if (!ESTADOS_VALIDOS.includes(estado)) {
      return res.status(400).json({ ok: false, error: "Estado inválido." });
    }

    const [[prev]] = await pool.query(`SELECT estado FROM herramientas WHERE id=?`, [id]);
    if (!prev) return res.status(404).json({ ok: false, error: "Herramienta no encontrada." });

    const [upd] = await pool.query(
      `UPDATE herramientas SET estado=? WHERE id=?`,
      [estado, id]
    );
    if (upd.affectedRows === 0) {
      return res.status(404).json({ ok: false, error: "Herramienta no encontrada." });
    }

    //registrar movimiento si la tabla existe
    try {
      let tipo = "AJUSTE";
      if (estado === "MANTENCION") tipo = "MANTENCION";
      if (estado === "BAJA") tipo = "BAJA";

      await pool.query(
        `INSERT INTO movimientos_herramienta(herramienta_id, tipo, ref_tabla, ref_id, creado_por, detalle)
         VALUES(?, ?, NULL, NULL, ?, ?)`,
        [id, tipo, (req.user?.id ?? 0), detalle || `Cambio de ${prev.estado} a ${estado}`]
      );
    } catch (_) {  }

    const [[row]] = await pool.query(
      `SELECT h.*, c.nombre AS categoria
         FROM herramientas h
    LEFT JOIN categorias_herramienta c ON c.id=h.categoria_id
        WHERE h.id=?`,
      [id]
    );

    try { const b = req.app.locals.broadcast; if (b) b('herramienta:estado', row); } catch (_) { }
    res.json({ ok: true, data: row });
  } catch (e) {
    console.error("PATCH /herramientas/:id/estado error:", e);
    res.status(500).json({ ok: false, error: "No se pudo cambiar el estado." });
  }
});

//eliminar herramienta 
r.delete("/herramientas/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query(`DELETE FROM herramientas WHERE id=?`, [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, error: "No encontrada" });
    }
    try { const b = req.app.locals.broadcast; if (b) b('herramienta:deleted', { id: Number(id) }); } catch (_) { }
    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /herramientas/:id", e);
    res.status(500).json({ ok: false, error: "No se pudo eliminar (revisar referencias o usar BAJA lógica)." });
  }
});


// obtener roles
r.get("/roles", requireAuth, requireAdmin, async (_req, res) => {
  const [rows] = await pool.query(`SELECT id, nombre FROM roles ORDER BY nombre`);
  res.json({ ok: true, data: rows });
});


// Usuarios

// verifica que el rol exista
async function assertRolExists(rol_id) {
  if (!rol_id) return;
  const [[r0]] = await pool.query(`SELECT id FROM roles WHERE id=?`, [rol_id]);
  if (!r0) {
    const e = new Error("ROL_NOT_FOUND");
    e.code = "ROL_NOT_FOUND";
    throw e;
  }
}

// Listar usuarios con filtros
r.get("/usuarios", requireAuth, requireAdmin, async (req, res) => {
  const { q = "", rol_id = "", activo = "" } = req.query;

  const where = [];
  const params = [];

  if (q && q.trim() !== "") {
    where.push("(u.nombre LIKE CONCAT('%',?,'%') OR u.email LIKE CONCAT('%',?,'%'))");
    params.push(q, q);
  }
  if (rol_id && Number(rol_id) > 0) {
    where.push("u.rol_id = ?");
    params.push(Number(rol_id));
  }
  if (activo !== "") {
    where.push("u.activo = ?");
    params.push(Number(activo) ? 1 : 0);
  }

  const [rows] = await pool.query(`
    SELECT u.id, u.nombre, u.email, u.rol_id, u.activo, r.nombre AS rol
      FROM usuarios u
      JOIN roles r ON r.id = u.rol_id
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY u.nombre
  `, params);

  res.json({ ok: true, data: rows });
});

// Crear usuario
r.post("/usuarios", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { nombre, email, password, rol_id, activo = 1 } = req.body;
    if (!nombre || !email || !password || !rol_id) {
      return res.status(400).json({ ok: false, error: "Faltan campos: nombre, email, password, rol_id" });
    }
    
    // utiliza el verificar rol de arriba
    await assertRolExists(rol_id);
    // hashea la contraseña
    const hash = await bcrypt.hash(String(password), 10);

    const [ins] = await pool.query(`
      INSERT INTO usuarios(nombre, email, password_hash, rol_id, activo)
      VALUES (?,?,?,?,?)`,
      [nombre.trim(), email.trim().toLowerCase(), hash, Number(rol_id), Number(activo) ? 1 : 0]
    );

    const [[row]] = await pool.query(`
      SELECT u.id, u.nombre, u.email, u.rol_id, u.activo, r.nombre AS rol
        FROM usuarios u JOIN roles r ON r.id=u.rol_id
       WHERE u.id=?`, [ins.insertId]
    );

    res.status(201).json({ ok: true, data: row });
  } catch (e) {
    if (e?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ ok: false, error: "El email ya está registrado." });
    }
    if (e?.code === "ROL_NOT_FOUND") {
      return res.status(400).json({ ok: false, error: "El rol indicado no existe." });
    }
    console.error("POST /usuarios error:", e);
    res.status(500).json({ ok: false, error: "No se pudo crear el usuario." });
  }
});

// Editar usuario (nombre, email, rol_id, activo)
r.patch("/usuarios/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, email, rol_id, activo } = req.body;
    
    // prevenir que el admin se desactive a si mismo
    if (Number(id) === Number(req.user?.id) && (activo === 0 || activo === false)) {
      return res.status(400).json({ ok: false, error: "No puedes desactivarte a ti mismo." });
    }

    // construir query dinamicamente
    const campos = [];
    const vals = [];

    if (nombre && !isEmpty(nombre)) { campos.push("nombre=?"); vals.push(nombre.trim()); }
    if (email && !isEmpty(email)) { campos.push("email=?"); vals.push(email.trim().toLowerCase()); }
    if (rol_id) {
      await assertRolExists(rol_id);
      campos.push("rol_id=?"); vals.push(Number(rol_id));
    }
    if (activo !== undefined) { campos.push("activo=?"); vals.push(Number(activo) ? 1 : 0); }

    if (campos.length === 0) return res.status(400).json({ ok: false, error: "No hay campos para actualizar." });

    // ejecutar update (vals.push) es para añadir mas de uno o mas elementos
    vals.push(id);
    const [upd] = await pool.query(`UPDATE usuarios SET ${campos.join(", ")} WHERE id=?`, vals);
    if (upd.affectedRows === 0) return res.status(404).json({ ok: false, error: "Usuario no encontrado." });


    const [[row]] = await pool.query(`
      SELECT u.id, u.nombre, u.email, u.rol_id, u.activo, r.nombre AS rol
        FROM usuarios u JOIN roles r ON r.id=u.rol_id
       WHERE u.id=?`, [id]
    );
    res.json({ ok: true, data: row });
  } catch (e) {
    if (e?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ ok: false, error: "El email ya está registrado." });
    }
    if (e?.code === "ROL_NOT_FOUND") {
      return res.status(400).json({ ok: false, error: "El rol indicado no existe." });
    }
    console.error("PATCH /usuarios/:id error:", e);
    res.status(500).json({ ok: false, error: "No se pudo actualizar el usuario." });
  }
});

// Reset password
r.patch("/usuarios/:id/password", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    if (!password) return res.status(400).json({ ok: false, error: "Falta password." });

    const hash = await bcrypt.hash(String(password), 10);
    const [u] = await pool.query(`UPDATE usuarios SET password_hash=? WHERE id=?`, [hash, id]);
    if (u.affectedRows === 0) return res.status(404).json({ ok: false, error: "Usuario no encontrado." });

    res.json({ ok: true });
  } catch (e) {
    console.error("PATCH /usuarios/:id/password error:", e);
    res.status(500).json({ ok: false, error: "No se pudo actualizar la contraseña." });
  }
});

// Activar / Desactivar
r.patch("/usuarios/:id/estado", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { activo } = req.body;

    if (Number(id) === Number(req.user?.id)) {
      return res.status(400).json({ ok: false, error: "No puedes cambiar tu propio estado." });
    }

    const [u] = await pool.query(`UPDATE usuarios SET activo=? WHERE id=?`, [Number(activo) ? 1 : 0, id]);
    if (u.affectedRows === 0) return res.status(404).json({ ok: false, error: "Usuario no encontrado." });

    res.json({ ok: true });
  } catch (e) {
    console.error("PATCH /usuarios/:id/estado error:", e);
    res.status(500).json({ ok: false, error: "No se pudo cambiar el estado." });
  }
});

// Eliminar usuario
r.delete("/usuarios/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (Number(id) === Number(req.user?.id)) {
      return res.status(400).json({ ok: false, error: "No puedes eliminarte a ti mismo." });
    }

    const [del] = await pool.query(`DELETE FROM usuarios WHERE id=?`, [id]);
    if (del.affectedRows === 0) return res.status(404).json({ ok: false, error: "Usuario no encontrado." });

    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /usuarios/:id error:", e);
    res.status(500).json({ ok: false, error: "No se pudo eliminar (revisar referencias)." });
  }
});

// Reporte de asistencias (admin)

r.get("/reportes/asistencias", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { desde, hasta, usuario } = req.query;

    // Fechas por defecto: hoy
    const hoy = new Date().toISOString().slice(0, 10);
    const f1 = desde || hoy;
    const f2 = hasta || hoy;

    let sql = `
      SELECT 
        a.id,
        a.fecha,
        a.hora_entrada,
        a.hora_salida,
        u.id AS usuario_id,
        u.nombre AS usuario,
        TIMEDIFF(
          IFNULL(a.hora_salida, CURRENT_TIME()),
          a.hora_entrada
        ) AS horas_trabajadas
      FROM asistencias a
      INNER JOIN usuarios u ON u.id = a.usuario_id
      WHERE DATE(a.fecha) BETWEEN ? AND ?
    `;
    const params = [f1, f2];

    //busca un usuario por los nombres que escribio el usuario
    if (usuario && usuario.trim() !== "") {
      sql += " AND u.nombre LIKE CONCAT('%', ?, '%')";
      params.push(usuario.trim());
    }

    sql += " ORDER BY a.fecha DESC, u.nombre ASC";

    const [rows] = await pool.query(sql, params);

    // también buscamos los usuarios que no marcaron asistencia en el rango
    const [usuarios] = await pool.query("SELECT id, nombre FROM usuarios WHERE rol_id != 1"); // suponiendo rol 1 = admin

    // verificamos quienes no aparecen en la tabla de asistencias
    const noMarcados = usuarios.filter(u =>
      !rows.some(a => a.usuario_id === u.id)
    );

    res.json({
      ok: true,
      data: rows,
      sin_marcar: noMarcados
    });
  } catch (error) {
    console.error("Error en /reportes/asistencias:", error);
    res.status(500).json({ ok: false, error: "Error al generar reporte de asistencias." });
  }
});

// Reporte de herramientas
r.get("/reportes/herramientas", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { mes, estado, categoria_id } = req.query;

    // Construir el WHERE
    let where = [];
    let params = [];

    if (estado && ESTADOS_VALIDOS.includes(estado)) {
      where.push("h.estado = ?");
      params.push(estado);
    }

    if (categoria_id && Number(categoria_id) > 0) {
      where.push("h.categoria_id = ?");
      params.push(Number(categoria_id));
    }

    // SQL para obtener herramientas con estadisticas de uso
    const sql = `
      SELECT 
        h.id,
        h.nombre AS herramienta,
        h.codigo,
        h.estado,
        c.nombre AS categoria,
        COUNT(DISTINCT pi.prestamo_id) AS veces_prestada,
        COALESCE(SUM(TIMESTAMPDIFF(HOUR, p.fecha_entrada, IFNULL(p.fecha_salida, NOW()))), 0) AS horas_uso,
        COUNT(DISTINCT CASE WHEN h.estado IN ('DAÑADA', 'MANTENCION') THEN h.id END) AS incidencias
      FROM herramientas h
      LEFT JOIN categorias_herramienta c ON c.id = h.categoria_id
      LEFT JOIN prestamo_items pi ON pi.herramienta_id = h.id
      LEFT JOIN prestamos p ON p.id = pi.prestamo_id
      ${where.length > 0 ? "WHERE " + where.join(" AND ") : ""}
      GROUP BY h.id, h.nombre, h.codigo, h.estado, c.nombre
      ORDER BY h.nombre ASC
    `;

    const [rows] = await pool.query(sql, params);

    res.json({
      ok: true,
      data: rows
    });
  } catch (error) {
    console.error("Error en /reportes/herramientas:", error);
    res.status(500).json({ ok: false, error: "Error al generar reporte de herramientas." });
  }
});

// Reporte consolidado
r.get("/reportes/consolidado", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { periodo = "mensual", area = "" } = req.query;

    // Datos consolidados del sistema
    const [[herramientas]] = await pool.query(`
      SELECT
        COUNT(*) AS total,
        SUM(estado='DISPONIBLE') AS disponibles,
        SUM(estado='NO_DISPONIBLE') AS en_uso,
        SUM(estado='MANTENCION') AS en_mantencion,
        SUM(estado='DAÑADA') AS danadas,
        SUM(estado='BAJA') AS bajas
      FROM herramientas
    `);

    const [[asistencias]] = await pool.query(`
      SELECT
        COUNT(DISTINCT usuario_id) AS usuarios_activos,
        COUNT(*) AS marcas_asistencia,
        AVG(TIMESTAMPDIFF(HOUR, hora_entrada, IFNULL(hora_salida, CURRENT_TIME()))) AS promedio_horas
      FROM asistencias
      WHERE DATE(fecha) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    `);

    const [[prestamos]] = await pool.query(`
      SELECT
        COUNT(DISTINCT p.id) AS prestamos_activos,
        COUNT(DISTINCT p.trabajador_id) AS trabajadores_con_prestamos,
        COUNT(pi.id) AS items_prestados
      FROM prestamos p
      LEFT JOIN prestamo_items pi ON pi.prestamo_id = p.id
      WHERE p.estado = 'ACTIVO'
    `);

    //crear un array con los datos del reporte
    const data = [
      { metrica: "Total de Herramientas", valor: herramientas?.total || 0, observacion: "Inventario completo" },
      { metrica: "Herramientas Disponibles", valor: herramientas?.disponibles || 0, observacion: "Listas para usar" },
      { metrica: "Herramientas en Uso", valor: herramientas?.en_uso || 0, observacion: "Actualmente prestadas" },
      { metrica: "En Mantención", valor: herramientas?.en_mantencion || 0, observacion: "En reparación" },
      { metrica: "Dañadas", valor: herramientas?.danadas || 0, observacion: "Requieren atención" },
      { metrica: "Usuarios Activos (30 días)", valor: asistencias?.usuarios_activos || 0, observacion: "Con asistencia registrada" },
      { metrica: "Promedio de Horas", valor: Math.round(asistencias?.promedio_horas || 0), observacion: "Por usuario al día" },
      { metrica: "Préstamos Activos", valor: prestamos?.prestamos_activos || 0, observacion: "En curso" },
      { metrica: "Trabajadores con Préstamos", valor: prestamos?.trabajadores_con_prestamos || 0, observacion: "Con herramientas asignadas" }
    ];

    res.json({
      ok: true,
      data: data,
      fecha_reporte: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error en /reportes/consolidado:", error);
    res.status(500).json({ ok: false, error: "Error al generar reporte consolidado." });
  }
});

export default r;
