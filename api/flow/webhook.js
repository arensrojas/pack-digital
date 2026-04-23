// api/flow/webhook.js
import { getDb } from "../../lib/db.js";
import crypto from "crypto";

export const config = {
  runtime: "nodejs",
  maxDuration: 30,
};

export default async function handler(request) {
  // Solo permitir POST
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // 1. Verificar firma HMAC de Flow (CRÍTICO para seguridad)
    const signature = request.headers.get("x-flow-signature");
    const rawBody = await request.text();

    const expectedSignature = crypto
      .createHmac("sha256", process.env.FLOW_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    if (signature !== expectedSignature) {
      console.warn("⚠️ Webhook Flow: Firma inválida", {
        received: signature?.substring(0, 10) + "...",
        ip: request.headers.get("x-forwarded-for"),
      });
      return new Response("Unauthorized", { status: 401 });
    }

    // 2. Parsear payload
    const data = JSON.parse(rawBody);
    const { commerceOrder, status, token, amount } = data;

    console.log(`🔔 Webhook Flow recibido: ${commerceOrder} -> ${status}`);

    const db = getDb();

    // 3. Verificar que la orden existe
    const { rows: orderRows } = await db.execute({
      sql: "SELECT * FROM orders WHERE id = ?",
      args: [commerceOrder],
    });

    if (!orderRows[0]) {
      console.warn(`⚠️ Webhook: Orden no encontrada ${commerceOrder}`);
      return new Response("Order not found", { status: 404 });
    }

    const order = orderRows[0];

    // 4. Validar monto (previene manipulación)
    if (Number(order.total) !== Number(amount)) {
      console.error(
        `❌ Webhook: Monto inconsistente. Orden: ${order.total}, Webhook: ${amount}`,
      );
      return new Response("Amount mismatch", { status: 400 });
    }

    // 5. Actualizar estado de la orden
    await db.execute({
      sql: `UPDATE orders 
            SET status = ?, updated_at = datetime('now'), flow_payment_id = COALESCE(?, flow_payment_id)
            WHERE id = ?`,
      args: [status, token, commerceOrder],
    });

    // 6. Acciones según el estado
    if (status === "accepted") {
      // ✅ Pago exitoso: enviar email con descargas
      await sendDownloadEmail({
        orderId: commerceOrder,
        email: order.customer_email,
        name: order.customer_name,
        items: JSON.parse(order.items),
      });

      console.log(
        `✅ Orden ${commerceOrder} completada. Email enviado a ${order.customer_email}`,
      );
    } else if (
      status === "rejected" ||
      status === "expired" ||
      status === "canceled"
    ) {
      // ❌ Pago fallido: notificar al cliente
      await sendPaymentFailedEmail({
        orderId: commerceOrder,
        email: order.customer_email,
        name: order.customer_name,
        reason: status,
      });

      console.log(`❌ Orden ${commerceOrder} fallida: ${status}`);
    }

    // 7. Responder a Flow (debe ser rápido)
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("❌ Webhook error:", error);
    // Flow reintenta automáticamente, así que respondemos error para que reintente
    return new Response("Internal error", { status: 500 });
  }
}

// Función para enviar email de descarga (implementar con tu servicio de email)
async function sendDownloadEmail({ orderId, email, name, items }) {
  // Opciones:
  // 1. Resend (recomendado para Vercel): https://resend.com
  // 2. SendGrid: https://sendgrid.com
  // 3. Nodemailer + SMTP

  // Ejemplo con Resend (descomentar y configurar):
  /*
  const resend = new Resend(process.env.RESEND_API_KEY);
  
  await resend.emails.send({
    from: 'Pack Digital <noreply@tu-dominio.cl>',
    to: email,
    subject: `✅ Tu compra #${orderId} está lista`,
    html: `
      <h2>¡Gracias por tu compra, ${name}! 👋</h2>
      <p>Tus productos digitales están listos para descargar:</p>
      <ul>
        ${items.map(item => `<li><strong>${item.name}</strong> - $${item.price.toLocaleString('es-CL')}</li>`).join('')}
      </ul>
      <p><a href="${process.env.FRONTEND_URL}/descargar/${orderId}" style="background:#25D366;color:white;padding:12px 24px;border-radius:8px;text-decoration:none">Descargar Ahora</a></p>
      <p><small>Este enlace expira en 24 horas por seguridad.</small></p>
    `
  });
  */

  // Para testing: log en consola
  console.log(`📧 Email de descarga enviado a ${email} para orden ${orderId}`);
}

async function sendPaymentFailedEmail({ orderId, email, name, reason }) {
  console.log(
    `📧 Email de pago fallido enviado a ${email} para orden ${orderId} (${reason})`,
  );
  // Implementar similar a sendDownloadEmail
}
