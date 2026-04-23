// api/flow/create-payment.js
import { getDb } from "../../lib/db.js";
import crypto from "crypto";
import { z } from "zod";

export const config = {
  runtime: "nodejs", // Necesario para algunas operaciones de Flow
  maxDuration: 30, // Timeout de 30 segundos
};

// Schema de validación con Zod
const paymentSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        quantity: z.number().int().min(1).max(10),
      }),
    )
    .min(1),
  customerEmail: z.string().email("Email inválido"),
  customerName: z.string().min(2).max(100),
});

export default async function handler(request) {
  // Solo permitir POST
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", Allow: "POST" },
    });
  }

  try {
    // Parsear y validar body
    const body = await request.json();
    const validated = paymentSchema.parse(body);

    const db = getDb();

    // 1. Validar productos y calcular total en servidor (NUNCA confiar en el frontend)
    const validatedItems = [];
    let total = 0;

    for (const item of validated.items) {
      const { rows } = await db.execute({
        sql: "SELECT id, name, price, stock FROM products WHERE id = ?",
        args: [item.id],
      });

      if (!rows[0]) {
        return new Response(
          JSON.stringify({
            error: `Producto no encontrado: ${item.id}`,
          }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        );
      }

      const product = rows[0];

      if (product.stock < item.quantity) {
        return new Response(
          JSON.stringify({
            error: `Stock insuficiente para: ${product.name}`,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      validatedItems.push({
        id: product.id,
        name: product.name,
        price: Number(product.price),
        quantity: item.quantity,
        subtotal: Number(product.price) * item.quantity,
      });

      total += validatedItems[validatedItems.length - 1].subtotal;
    }

    // 2. Crear orden en la base de datos
    const orderId = `ORD-${crypto.randomUUID()}`;

    await db.execute({
      sql: `INSERT INTO orders 
            (id, customer_email, customer_name, total, items, status) 
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        orderId,
        validated.customerEmail.toLowerCase().trim(),
        validated.customerName.trim(),
        total,
        JSON.stringify(validatedItems),
        "pending",
      ],
    });

    // 3. Preparar payload para Flow API
    // NOTA: En producción, descomenta la llamada real a Flow
    const flowPayload = {
      commerceOrder: orderId,
      subject: `Compra Pack Digital - ${validatedItems.length} producto(s)`,
      currency: "CLP",
      amount: total,
      buyerEmail: validated.customerEmail,
      buyerPhone: "", // Opcional
      urlConfirmation: `${process.env.VERCEL_URL || process.env.DEPLOYMENT_URL}/api/flow/webhook`,
      urlReturn: `${process.env.VERCEL_URL || process.env.DEPLOYMENT_URL}/gracias?order=${orderId}`,
      // Opcional: metadata para tracking
      metadata: {
        items: validatedItems.map((i) => i.name).join(", "),
        customerName: validated.customerName,
      },
    };

    // 4. Llamar a Flow API (descomentar en producción)
    /*
    const flowResponse = await fetch('https://api.flow.cl/v2/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.FLOW_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(flowPayload)
    });

    if (!flowResponse.ok) {
      const error = await flowResponse.text();
      console.error('❌ Flow API error:', error);
      throw new Error('Error al crear pago en Flow');
    }

    const flowData = await flowResponse.json();
    
    // Actualizar orden con flow_payment_id
    await db.execute({
      sql: 'UPDATE orders SET flow_payment_id = ? WHERE id = ?',
      args: [flowData.token, orderId]
    });
    */

    // 5. Respuesta para el frontend (modo desarrollo/simulación)
    return new Response(
      JSON.stringify({
        success: true,
        orderId,
        total,
        items: validatedItems,
        customerEmail: validated.customerEmail,
        // En producción: paymentUrl: flowData.url
        paymentUrl: `https://api.flow.cl/v2/payments?token=${crypto.randomBytes(16).toString("hex")}`,
        message: "Orden creada. Redirigiendo a Flow...",
        // Para testing: simular éxito inmediato
        _testMode: process.env.NODE_ENV !== "production",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("❌ Create payment error:", error);

    // Manejar errores de validación de Zod
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({
          error: "Datos inválidos",
          details: error.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        error: "No se pudo procesar la solicitud",
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
