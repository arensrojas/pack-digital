import { getDb } from "../../lib/db.js";

export const config = { runtime: "nodejs" };

export default async function handler(request) {
  // 1. Verificar Seguridad
  const secret = request.headers.get("x-admin-secret");
  if (secret !== process.env.ADMIN_SECRET) {
    return new Response(JSON.stringify({ error: "Acceso denegado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = getDb();

  try {
    // 2. Manejar GET (Ver lista de productos)
    if (request.method === "GET") {
      const { rows } = await db.execute(
        "SELECT * FROM products ORDER BY created_at DESC",
      );
      return new Response(JSON.stringify(rows), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 3. Manejar POST (Crear o Editar producto)
    if (request.method === "POST") {
      const data = await request.json();

      // Validación básica
      if (!data.id || !data.name || !data.price) {
        return new Response(
          JSON.stringify({ error: "Faltan datos (id, name, price)" }),
          { status: 400 },
        );
      }

      // Insertar o Reemplazar (Upsert)
      await db.execute({
        sql: `INSERT OR REPLACE INTO products 
              (id, name, description, price, category, stock) 
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          data.id,
          data.name,
          data.description || "",
          Number(data.price),
          data.category || "general",
          Number(data.stock) || 999,
        ],
      });

      return new Response(
        JSON.stringify({ success: true, message: "Producto guardado" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // 4. Manejar DELETE (Borrar producto)
    if (request.method === "DELETE") {
      const data = await request.json();
      if (!data.id)
        return new Response(JSON.stringify({ error: "Falta ID" }), {
          status: 400,
        });

      await db.execute({
        sql: "DELETE FROM products WHERE id = ?",
        args: [data.id],
      });

      return new Response(
        JSON.stringify({ success: true, message: "Producto eliminado" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response("Method not allowed", { status: 405 });
  } catch (error) {
    console.error("Admin Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
