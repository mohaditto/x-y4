import mysql from "mysql2/promise";
//crea pool de conexiones a la base de datos
export const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  port: Number(process.env.DB_PORT || 3306),
  password: process.env.DB_PASS || "",
  database: process.env.DB_NAME || "x&y",
  connectionLimit: 10,
});
