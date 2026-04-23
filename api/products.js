// api/products.js
import { getDb } from "../lib/db.js";

export const config = {
  runtime: "edge", // Más rápido, menor cold start (~100ms)
};

export default async function handler(request) {
  // Solo permitir GET
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        Allow: "GET",
      },
    });
  }

  try {
    const db = getDb();

    // Obtener productos activos
    const { rows } = await db.execute(`
      SELECT id, name, description, price, category, stock 
      FROM products 
      WHERE stock > 0 
      ORDER BY category, name
    `);

    // Formatear respuesta
    const products = rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      price: Number(row.price),
      category: row.category,
      available: Number(row.stock) > 0,
    }));

    return new Response(JSON.stringify(products), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        "CDN-Cache-Control": "public, max-age=60",
        "Vercel-CDN-Cache-Control": "max-age=60",
      },
    });
  } catch (error) {
    console.error("❌ Error fetching products:", error);

    return new Response(
      JSON.stringify({
        error: "No se pudieron cargar los productos",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
