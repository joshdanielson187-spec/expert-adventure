import type { Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";

export default async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email) {
    return Response.json({ error: "Email is required" }, { status: 400 });
  }

  const db = getDatabase();

  const results = await db.sql`
    SELECT package_type, created_at
    FROM purchases
    WHERE email = ${email}
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (results.rows.length === 0) {
    return Response.json({ found: false }, { status: 200 });
  }

  const purchase = results.rows[0];
  return Response.json({
    found: true,
    packageType: purchase.package_type,
  });
};

export const config: Config = {
  path: "/api/verify-purchase",
  method: "POST",
};
