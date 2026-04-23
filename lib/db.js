// lib/db.js
import { createClient } from "@libsql/client";

let tursoClient = null;

export function getDb() {
  if (!tursoClient) {
    tursoClient = createClient({
      url: process.env.TURSO_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return tursoClient;
}

export async function initDb() {
  const db = getDb();

  try {
    // Crear tabla de productos si no existe
    await db.execute(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        price INTEGER NOT NULL,
        category TEXT DEFAULT 'digital',
        stock INTEGER DEFAULT 999,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Crear tabla de órdenes
    await db.execute(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        customer_email TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        total INTEGER NOT NULL,
        items TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        flow_payment_id TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Crear índice para búsquedas por email
    await db.execute(
      "CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(customer_email)",
    );
    await db.execute(
      "CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)",
    );

    // Seed inicial de productos (solo si está vacío)
    const { rows } = await db.execute("SELECT COUNT(*) as c FROM products");
    if (!rows[0] || rows[0].c === 0) {
      const defaultProducts = [
        {
          id: "prod-1",
          name: "Plantillas Contables Pro",
          description:
            "50+ plantillas Excel para gestión contable chilena. Incluye IVA, F29, libros y más.",
          price: 4990,
          category: "plantillas",
        },
        {
          id: "prod-2",
          name: "Pack Ebooks Negocios",
          description:
            "20 ebooks sobre emprendimiento, marketing digital y finanzas personales.",
          price: 7990,
          category: "ebooks",
        },
        {
          id: "prod-3",
          name: "Curso Finanzas Digitales",
          description:
            "Curso completo en video sobre finanzas para negocios digitales. 10+ horas de contenido.",
          price: 12990,
          category: "cursos",
        },
        {
          id: "prod-4",
          name: "Pack Diseño UI/UX",
          description:
            "100+ assets de diseño: iconos, mockups, templates Figma y más.",
          price: 9990,
          category: "design",
        },
        {
          id: "prod-5",
          name: "Kit Legal para Emprendedores",
          description:
            "Contratos, términos y condiciones, políticas de privacidad listos para usar.",
          price: 6990,
          category: "legal",
        },
      ];

      for (const p of defaultProducts) {
        await db.execute({
          sql: "INSERT OR IGNORE INTO products (id, name, description, price, category) VALUES (?, ?, ?, ?, ?)",
          args: [p.id, p.name, p.description, p.price, p.category],
        });
      }
      console.log("✅ Base de datos inicializada con productos por defecto");
    }

    return true;
  } catch (error) {
    console.error("❌ Error inicializando DB:", error);
    throw error;
  }
}

// Ejecutar init en cada cold start (Vercel serverless)
initDb().catch(console.error);
