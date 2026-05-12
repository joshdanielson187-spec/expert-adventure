import type { Config, Context } from "@netlify/functions";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getDatabase } from "@netlify/database";

function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string,
  toleranceSec = 300
): boolean {
  const parts = sigHeader.split(",").reduce<Record<string, string>>((acc, part) => {
    const [key, val] = part.split("=");
    acc[key] = val;
    return acc;
  }, {});

  const timestamp = parts["t"];
  const signature = parts["v1"];
  if (!timestamp || !signature) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > toleranceSec) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const webhookSecret = Netlify.env.get("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured");
    return new Response("Server misconfigured", { status: 500 });
  }

  const sigHeader = req.headers.get("stripe-signature");
  if (!sigHeader) {
    return new Response("Missing signature", { status: 400 });
  }

  const rawBody = await req.text();

  if (!verifyStripeSignature(rawBody, sigHeader, webhookSecret)) {
    return new Response("Invalid signature", { status: 400 });
  }

  const event = JSON.parse(rawBody);

  if (event.type !== "checkout.session.completed") {
    return new Response("OK", { status: 200 });
  }

  const session = event.data.object;
  const email = session.customer_details?.email || session.customer_email;
  const amountTotal = session.amount_total;
  const sessionId = session.id;

  if (!email) {
    console.error("No customer email in checkout session", sessionId);
    return new Response("OK", { status: 200 });
  }

  let packageType = "starter";
  if (amountTotal >= 2900) {
    packageType = "premium";
  }

  const db = getDatabase();

  try {
    await db.sql`
      INSERT INTO purchases (email, package_type, stripe_session_id)
      VALUES (${email.toLowerCase()}, ${packageType}, ${sessionId})
      ON CONFLICT (stripe_session_id) DO NOTHING
    `;
    console.log(`Recorded ${packageType} purchase for ${email}`);
  } catch (err) {
    console.error("Database insert failed:", err);
    return new Response("Server error", { status: 500 });
  }

  return new Response("OK", { status: 200 });
};

export const config: Config = {
  path: "/api/stripe-webhook",
  method: "POST",
};
