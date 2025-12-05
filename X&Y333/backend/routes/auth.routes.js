import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";

const r = Router();

// login de usuario y generación de token JWT
r.post("/login", async (req, res) => {
  try {
    let { email, password } = req.body || {};
    email = (email ?? "").trim().toLowerCase();
    password = (password ?? "").trim();

    if (!email || !password) {
      return res.status(400).json({ error: "Faltan email o contraseña" });
    }

    // Buscar usuario y rol
    const [rows] = await pool.query(
      `SELECT u.id, u.nombre, u.email, u.password_hash, 
              r.nombre AS rol, u.activo
         FROM usuarios u
         JOIN roles r ON r.id = u.rol_id
        WHERE u.email = ?`,
      [email]
    );

    if (!rows.length) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    //esto es cuando el administrador desactiva la cuenta
    const user = rows[0];
    if (!user.activo) {
      return res.status(403).json({ error: "Usuario inactivo" });
    }

    // verifica la contraseña
    const ok = await bcrypt.compare(password, user.password_hash || "");
    if (!ok) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    // Crear token JWT , para que el usuario pueda autenticarse en futuras solicitudes , incluye id, rol, nombre y email , por ejemplo funciones como requireAuth y requireAdmin
    
    const token = jwt.sign(
      {
        id: user.id,
        rol: user.rol,
        nombre: user.nombre,
        email: user.email,
      },
      process.env.JWT_SECRET || "dev",
      { expiresIn: process.env.JWT_EXPIRES || "8h" }
    );

    // DEVOLVER tambien el ID y el rol (para el frontend) por futuros usos por ejemplo para mostrar u ocultar opciones en el menú
    res.json({
      ok: true,
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
      token,
    });
  } catch (err) {
    console.error("Error en login:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

export default r;
