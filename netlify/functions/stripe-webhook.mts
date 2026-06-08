import type { Config, Context } from "@netlify/functions";
import { createHmac, timingSafeEqual } from "node:crypto";

const SITE_URL = "https://all-recipe-diet.org";

interface PackageInfo {
  name: string;
  path: string;
}

function getPackage(
  paymentLinkId: string | null,
  amountCents: number
): PackageInfo | null {
  const plinkStarter = Netlify.env.get("STRIPE_PLINK_STARTER");
  const plinkPremium = Netlify.env.get("STRIPE_PLINK_PREMIUM");
  const plinkGlutenFree = Netlify.env.get("STRIPE_PLINK_GLUTENFREE");

  if (paymentLinkId) {
    if (plinkStarter && paymentLinkId === plinkStarter) {
      return { name: "Starter Plan", path: "/downloads/starter-plan.html" };
    }
    if (plinkPremium && paymentLinkId === plinkPremium) {
      return { name: "Premium Plan", path: "/downloads/premium-plan.html" };
    }
    if (plinkGlutenFree && paymentLinkId === plinkGlutenFree) {
      return {
        name: "Gluten Free Plan",
        path: "/downloads/gluten-free-package-a6c91d2f.html",      
      };
    }
  }

  if (amountCents === 2900) {
    return { name: "Premium Plan", path: "/downloads/premium-plan.html" };
  }
  if (amountCents === 1900) {
    return { name: "Gluten Free Plan", path: "/downloads/gluten-free-package-a6c91d2f.html" };
  }

  return null;
}

function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const elements = signature.split(",");
  let timestamp = "";
  const v1Signatures: string[] = [];

  for (const element of elements) {
    const [key, value] = element.split("=");
    if (key === "t") timestamp = value;
    if (key === "v1") v1Signatures.push(value);
  }

  if (!timestamp || v1Signatures.length === 0) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const expected = createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");

  return v1Signatures.some((sig) => {
    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
    } catch {
      return false;
    }
  });
}

async function sendRecipeEmail(
  to: string,
  pkg: PackageInfo
): Promise<void> {
  const resendApiKey = Netlify.env.get("RESEND_API_KEY");
  if (!resendApiKey) throw new Error("RESEND_API_KEY not configured");

  const fromEmail =
    Netlify.env.get("FROM_EMAIL") || "recipes@all-recipe-diet.org";
  const downloadUrl = `${SITE_URL}${pkg.path}`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `All Recipe Diet <${fromEmail}>`,
      to: [to],
      subject: `Your ${pkg.name} Recipes Are Ready!`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#fbf6ee;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="color:#1a140e;font-size:24px;margin:0 0 8px;">All Recipe Diet</h1>
      <p style="color:#6b5e53;font-size:14px;margin:0;">by Josh Danielson</p>
    </div>
    <div style="background:#fff;border-radius:12px;padding:32px 24px;border:1px solid #e8ddd0;">
      <h2 style="color:#1a140e;font-size:20px;margin:0 0 12px;">Your ${pkg.name} is ready!</h2>
      <p style="color:#4a3f36;font-size:15px;line-height:1.6;margin:0 0 24px;">
        Thank you for your purchase. Click the button below to access your recipe package. You can view it on any device, print it, or save it as a PDF.
      </p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${downloadUrl}" style="display:inline-block;background:#c8623d;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600;">
          Download Your Recipes
        </a>
      </div>
      <p style="color:#6b5e53;font-size:13px;line-height:1.5;margin:24px 0 0;text-align:center;">
        Bookmark this link so you can access your recipes anytime.<br>
        To save as PDF: open the page, then use File &rarr; Print &rarr; Save as PDF.
      </p>
    </div>
    <div style="text-align:center;margin-top:32px;">
      <p style="color:#9a8d82;font-size:12px;margin:0;">
        Questions? Reply to this email or contact Josh Danielson.<br>
        &copy; All Recipe Diet &middot; all-recipe-diet.org
      </p>
    </div>
  </div>
</body>
</html>`,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Resend API error: ${response.status} ${error}`);
  }
}

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const webhookSecret = Netlify.env.get("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET not configured");
    return new Response("Server configuration error", { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  const body = await req.text();

  if (!verifyStripeSignature(body, signature, webhookSecret)) {
    return new Response("Invalid signature", { status: 400 });
  }

  const event = JSON.parse(body);

  if (event.type !== "checkout.session.completed") {
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  }

  const session = event.data.object;
  const customerEmail = session.customer_details?.email;

  if (!customerEmail) {
    console.error("No customer email in session:", session.id);
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  }

  const pkg = getPackage(session.payment_link || null, session.amount_total);

  if (!pkg) {
    console.error(
      "Could not determine package for session:",
      session.id,
      "amount:",
      session.amount_total,
      "payment_link:",
      session.payment_link
    );
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  }

  try {
    await sendRecipeEmail(customerEmail, pkg);
    console.log(`Recipe email sent to ${customerEmail} for ${pkg.name}`);
  } catch (error) {
    console.error("Failed to send recipe email:", error);
    return new Response("Email delivery failed", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true, emailed: true }), {
    status: 200,
  });
};

export const config: Config = {
  path: "/api/stripe-webhook",
  method: "POST",
};
