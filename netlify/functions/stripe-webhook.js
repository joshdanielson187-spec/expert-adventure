const crypto = require("crypto");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const STARTER_PAYMENT_LINK_ID = "plink_1TTmthHHJHOb4J4jVWRDRXQY";
const PREMIUM_PAYMENT_LINK_ID = "plink_1TTmthHHJHOb4J4jRLkHKP3J";
const GLUTEN_FREE_PAYMENT_LINK_ID = "plink_1TXq65HHJHOb4J4j0SrDA1sK";
const SITE_URL = (process.env.SITE_URL || "https://all-recipe-diet.org").replace(/\/$/, "");
const STARTER_DEFAULT_DELIVERY_URL = `${SITE_URL}/downloads/starter-package-9f4d2a7c.html`;
const PREMIUM_DEFAULT_DELIVERY_URL = `${SITE_URL}/downloads/premium-package-c8e7b3a1.html`;
const GLUTEN_FREE_DEFAULT_DELIVERY_URL = `${SITE_URL}/downloads/gluten-free-package-a6c91d2f.html`;

// Payout configuration - takes a percentage fee before sending to your bank
const PAYOUT_PERCENTAGE = 0.95; // Send 95%, keep 5% for fees/costs

function timingSafeEqual(a, b) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function verifyStripeSignature(rawBody, signatureHeader, webhookSecret) {
  if (!signatureHeader || !webhookSecret) {
    return false;
  }

  const parts = signatureHeader.split(",");
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));

  if (!timestamp || signatures.length === 0) {
    return false;
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(signedPayload, "utf8")
    .digest("hex");

  const timestampSeconds = Number(timestamp);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const isRecent = Number.isFinite(timestampSeconds) && Math.abs(nowSeconds - timestampSeconds) <= 300;

  return isRecent && signatures.some((signature) => timingSafeEqual(signature, expectedSignature));
}

function getPackageFromSession(session) {
  if (session.payment_link === STARTER_PAYMENT_LINK_ID) {
    return {
      packageName: "All Recipe Diet Starter Package",
      packageKey: "starter",
      deliveryUrl: process.env.STARTER_DELIVERY_URL || STARTER_DEFAULT_DELIVERY_URL,
    };
  }

  if (session.payment_link === PREMIUM_PAYMENT_LINK_ID) {
    return {
      packageName: "All Recipe Diet Premium Package",
      packageKey: "premium",
      deliveryUrl: process.env.PREMIUM_DELIVERY_URL || PREMIUM_DEFAULT_DELIVERY_URL,
    };
  }

  if (session.payment_link === GLUTEN_FREE_PAYMENT_LINK_ID) {
    return {
      packageName: "All Recipe Diet Gluten-Free Package",
      packageKey: "gluten-free",
      deliveryUrl: process.env.GLUTEN_FREE_DELIVERY_URL || GLUTEN_FREE_DEFAULT_DELIVERY_URL,
    };
  }

  if (session.amount_total === 1900) {
    return {
      packageName: "All Recipe Diet Starter Package",
      packageKey: "starter",
      deliveryUrl: process.env.STARTER_DELIVERY_URL || STARTER_DEFAULT_DELIVERY_URL,
    };
  }

  if (session.amount_total === 2900) {
    return {
      packageName: "All Recipe Diet Premium Package",
      packageKey: "premium",
      deliveryUrl: process.env.PREMIUM_DELIVERY_URL || PREMIUM_DEFAULT_DELIVERY_URL,
    };
  }

  if (session.amount_total === 1900) {
    return {
      packageName: "All Recipe Diet Gluten-Free Package",
      packageKey: "gluten-free",
      deliveryUrl: process.env.GLUTEN_FREE_DELIVERY_URL || GLUTEN_FREE_DEFAULT_DELIVERY_URL,
    };
  }

  return {
    packageName: "Unknown All Recipe Diet Package",
    packageKey: "unknown",
    deliveryUrl: "",
  };
}

async function processBankPayout(session, packageInfo) {
  const stripeConnectAccountId = process.env.STRIPE_CONNECTED_ACCOUNT_ID;

  // If no connected account, skip payout but log it
  if (!stripeConnectAccountId) {
    console.log("STRIPE_CONNECTED_ACCOUNT_ID not configured. Payout not processed.", {
      sessionId: session.id,
      amount: session.amount_total,
      currency: session.currency,
    });
    return { configured: false, processed: false, reason: "account_not_configured" };
  }

  try {
    // Verify payment was actually captured
    if (session.payment_status !== "paid") {
      console.warn("Payment not yet captured. Skipping payout.", { sessionId: session.id, status: session.payment_status });
      return { configured: true, processed: false, reason: "payment_not_captured" };
    }

    // Calculate payout amount (after fees)
    const payoutAmount = Math.round(session.amount_total * PAYOUT_PERCENTAGE);
    
    // Create payout to connected account
    const payout = await stripe.payouts.create(
      {
        amount: payoutAmount,
        currency: session.currency.toLowerCase(),
        description: `Payment for ${packageInfo.packageName} (Order: ${session.id})`,
        metadata: {
          checkout_session_id: session.id,
          package_key: packageInfo.packageKey,
          original_amount: session.amount_total,
          fee_amount: session.amount_total - payoutAmount,
        },
      },
      { stripeAccount: stripeConnectAccountId }
    );

    console.log("Bank payout processed successfully", {
      payoutId: payout.id,
      amount: payoutAmount,
      status: payout.status,
      sessionId: session.id,
    });

    return {
      configured: true,
      processed: true,
      payoutId: payout.id,
      status: payout.status,
      amount: payoutAmount,
    };
  } catch (error) {
    console.error("Bank payout error", {
      error: error.message,
      sessionId: session.id,
      amount: session.amount_total,
    });

    return {
      configured: true,
      processed: false,
      error: error.message,
    };
  }
}

async function notifyDeliveryAutomation(payload) {
  const deliveryWebhookUrl = process.env.DELIVERY_WEBHOOK_URL;

  if (!deliveryWebhookUrl) {
    console.log("Delivery webhook not configured. Payment recorded only.", payload);
    return { configured: false };
  }

  const response = await fetch(deliveryWebhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Delivery webhook failed with ${response.status}: ${responseText}`);
  }

  return { configured: true, status: response.status };
}

function buildRecipeEmailHtml(payload) {
  const downloadButton = payload.deliveryUrl
    ? `<a href="${payload.deliveryUrl}" style="display:inline-block;background:#1f7a4d;color:#ffffff;text-decoration:none;padding:14px 20px;border-radius:999px;font-weight:700;margin:18px 0;">Download Your Recipes</a>`
    : `<p style="background:#fff6df;border:1px solid #f0d48a;border-radius:14px;padding:14px 16px;color:#5b4420;">Your recipe package is being prepared. Please reply to this email if you need help.</p>`;

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f8f5ef;font-family:Arial,Helvetica,sans-serif;color:#26342b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f5ef;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border-radius:22px;overflow:hidden;border:1px solid #e7dfd2;">
            <tr>
              <td style="padding:28px 28px 14px;">
                <p style="margin:0 0 8px;color:#1f7a4d;font-weight:800;letter-spacing:.08em;text-transform:uppercase;font-size:12px;">All Recipe Diet</p>
                <h1 style="margin:0;font-size:30px;line-height:1.1;color:#26342b;">Your recipe package is ready.</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 28px;">
                <p style="font-size:16px;line-height:1.6;margin:16px 0;">Thank you for your purchase${payload.customerName ? `, ${payload.customerName}` : ""}. You bought the <strong>${payload.packageName}</strong>.</p>
                ${downloadButton}
                <p style="font-size:14px;line-height:1.6;color:#647067;margin:16px 0 0;">Keep this email so you can come back to your recipe package later. If the button does not work, copy and paste the link below into your browser.</p>
                <p style="font-size:13px;line-height:1.5;word-break:break-all;color:#1f7a4d;margin:8px 0 0;">${payload.deliveryUrl || "Delivery link not configured yet."}</p>
              </td>
            </tr>
            <tr>
              <td style="background:#26342b;color:#ffffff;padding:18px 28px;font-size:13px;line-height:1.5;">
                All Recipe Diet by Josh Danielson. Order reference: ${payload.checkoutSessionId}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildRecipeEmailText(payload) {
  return [
    "All Recipe Diet",
    "",
    `Thank you${payload.customerName ? `, ${payload.customerName}` : ""}. Your ${payload.packageName} is ready.`,
    "",
    payload.deliveryUrl
      ? `Download your recipes here: ${payload.deliveryUrl}`
      : "Your recipe package delivery link is not configured yet. Please reply for help.",
    "",
    `Order reference: ${payload.checkoutSessionId}`,
  ].join("\n");
}

async function sendRecipeEmail(payload) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.FROM_EMAIL || "All Recipe Diet <noreply@all-recipe-diet.org>";
  const replyToEmail = process.env.REPLY_TO_EMAIL || "";

  if (!resendApiKey) {
    console.log("RESEND_API_KEY not configured. Recipe email not sent.", payload);
    return { configured: false };
  }

  if (!payload.customerEmail) {
    console.warn("No customer email found on checkout session. Recipe email not sent.", payload);
    return { configured: true, sent: false, reason: "missing_customer_email" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${resendApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [payload.customerEmail],
      reply_to: replyToEmail || undefined,
      subject: `Your ${payload.packageName} is ready`,
      html: buildRecipeEmailHtml(payload),
      text: buildRecipeEmailText(payload),
      tags: [
        { name: "website", value: "all-recipe-diet" },
        { name: "package", value: payload.packageKey },
      ],
    }),
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`Resend email failed with ${response.status}: ${responseText}`);
  }

  return { configured: true, sent: true, response: responseText };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { allow: "POST" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("Missing STRIPE_WEBHOOK_SECRET environment variable.");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Webhook is not configured yet." }),
    };
  }

const rawBody = event.isBase64Encoded
  ? Buffer.from(event.body || "", "base64").toString("utf8")
  : event.body || "";

const signatureHeader =
  event.headers["stripe-signature"] ||
  event.headers["Stripe-Signature"];

let stripeEvent;

try {
  stripeEvent = stripe.webhooks.constructEvent(
    rawBody,
    signatureHeader,
    webhookSecret.trim()
  );
} catch (error) {
  console.error("Stripe webhook signature error:", error.message);

  return {
    statusCode: 401,
    body: JSON.stringify({
      error: "Invalid Stripe signature",
      details: error.message,
    }),
  };
}

if (stripeEvent.type !== "checkout.session.completed") {
    return {
      statusCode: 200,
      body: JSON.stringify({ received: true, ignored: stripeEvent.type }),
    };
  }

  const session = stripeEvent.data.object;
  const packageInfo = getPackageFromSession(session);
  const customerEmail = session.customer_details?.email || session.customer_email || "";

  const deliveryPayload = {
    eventId: stripeEvent.id,
    eventType: stripeEvent.type,
    checkoutSessionId: session.id,
    paymentIntentId: session.payment_intent || "",
    paymentLinkId: session.payment_link || "",
    customerEmail,
    customerName: session.customer_details?.name || "",
    packageName: packageInfo.packageName,
    packageKey: packageInfo.packageKey,
    deliveryUrl: packageInfo.deliveryUrl,
    amountTotal: session.amount_total,
    currency: session.currency,
    paidAt: new Date((stripeEvent.created || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
  };

  try {
    // Process all actions in parallel: delivery, email, and bank payout
    const [deliveryResult, emailResult] = await Promise.all([
  notifyDeliveryAutomation(deliveryPayload),
  sendRecipeEmail(deliveryPayload),
]);

const payoutResult = {
  configured: false,
  processed: false,
  reason: "automatic_stripe_payouts"
};

    console.log("Stripe checkout completed", {
      ...deliveryPayload,
      deliveryResult,
      emailResult,
      payoutResult,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        received: true,
        package: packageInfo.packageKey,
        deliveryAutomationConfigured: deliveryResult.configured,
        recipeEmailConfigured: emailResult.configured,
        recipeEmailSent: Boolean(emailResult.sent),
        bankPayoutConfigured: payoutResult.configured,
        bankPayoutProcessed: payoutResult.processed,
        payoutId: payoutResult.payoutId || null,
      }),
    };
  } catch (error) {
    console.error("Webhook processing error", error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Payment received, but processing failed.",
        details: error.message,
      }),
    };
  }
};
