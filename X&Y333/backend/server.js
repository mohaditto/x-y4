import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config.js";
// Usaremos SSE (Server-Sent Events) para notificaciones en tiempo real sin dependencias

import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import trabajadorRoutes from "./routes/trabajador.routes.js";
import capatazRoutes from "./routes/capataz.routes.js";

const app = express();

// Configurar rutas absolutas
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir frontend
app.use(express.static(path.join(__dirname, "../public")));
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// Inicializar colección de clientes SSE y broadcaster
app.locals.sseClients = [];
app.locals.broadcast = function (event, data) {
  try {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    (app.locals.sseClients || []).forEach(res => {
      try {
        res.write(`event: ${event}\n`);
        res.write(`data: ${payload}\n\n`);
      } catch (e) { /* ignore */ }
    });
  } catch (e) { console.error('Broadcast error', e); }
};

// Endpoint SSE para que la comunicacion entre la pagina y el servidor sea en tiempo real 
//permite al servidor enviar actualizaciones al cliente sin que este tenga que hacer peticiones repetidas

app.get('/sse', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();
  res.write(': connected\n\n');

  // Añadir el cliente a la lista de clientes SSE
  app.locals.sseClients.push(res);

  //cierrar conexion y eliminar cliente de la lista cuando se cierra la conexion
  req.on('close', () => {
    app.locals.sseClients = (app.locals.sseClients || []).filter(r => r !== res);
  });
});

// Rutas
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/trabajador", trabajadorRoutes);
app.use("/api/capataz", capatazRoutes);

// Error 404 API
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Ruta API no encontrada" });
});

// Error global
app.use((err, _req, res, _next) => {
  console.error("Error interno:", err);
  res.status(500).json({ error: "Error interno del servidor" });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor listo en: http://localhost:${PORT}`);
});
