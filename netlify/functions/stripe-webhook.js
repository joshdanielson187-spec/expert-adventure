const crypto = require("crypto");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const STARTER_PAYMENT_LINK_ID = "plink_1TTmthHHJHOb4J4jVWRDRXQY";
const PREMIUM_PAYMENT_LINK_ID = "plink_1TTmthHHJHOb4J4jRLkHKP3J";
const GLUTEN_FREE_PAYMENT_LINK_ID = "plink_1TXq65HHJHOb4J4j0SrDA1sK";
const SITE_URL = (process.env.SITE_URL || "https://all-recipe-diet.netlify.app").replace(/\/$/, "");
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
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Recipe Package is Ready</title>
  </head>
  <body style="margin:0;padding:0;background:#f8f5ef;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;color:#26342b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f5ef;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border-radius:22px;overflow:hidden;border:1px solid #e7dfd2;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
            <!-- Header -->
            <tr>
              <td style="padding:28px 28px 14px;background:linear-gradient(135deg, #1f7a4d 0%, #165a39 100%);">
                <p style="margin:0 0 8px;color:#ffffff;font-weight:800;letter-spacing:.08em;text-transform:uppercase;font-size:12px;">All Recipe Diet</p>
                <h1 style="margin:0;font-size:32px;line-height:1.2;color:#ffffff;font-weight:700;">Your Recipe Package is Ready!</h1>
              </td>
            </tr>
            <!-- Body -->
            <tr>
              <td style="padding:28px 28px;">
                <p style="font-size:16px;line-height:1.6;margin:16px 0 0 0;color:#26342b;">
                  Hello${payload.customerName ? `, ${payload.customerName}` : ""},
                </p>
                <p style="font-size:16px;line-height:1.6;margin:16px 0;color:#26342b;">
                  Thank you for purchasing the <strong style="color:#1f7a4d;">${payload.packageName}</strong>! 
                  Your recipes are ready to download and start using right away.
                </p>
                <div style="background:#f0f8f4;border-left:4px solid #1f7a4d;padding:18px;border-radius:8px;margin:20px 0;">
                  <p style="margin:0;color:#165a39;font-weight:600;">📦 Package Details:</p>
                  <p style="margin:8px 0 0 0;color:#26342b;font-size:14px;">Type: ${payload.packageName}</p>
                  <p style="margin:4px 0 0 0;color:#26342b;font-size:14px;">Order ID: ${payload.checkoutSessionId}</p>
                </div>
                ${downloadButton}
                <p style="font-size:13px;line-height:1.5;color:#647067;margin:16px 0 0;border-top:1px solid #e7dfd2;padding-top:16px;">
                  <strong>Link not working?</strong> Copy and paste this URL into your browser:
                </p>
                <p style="font-size:12px;line-height:1.5;word-break:break-all;color:#1f7a4d;margin:8px 0 0;background:#f5f5f5;padding:12px;border-radius:6px;font-family:'Courier New', monospace;">
                  ${payload.deliveryUrl || "Delivery link is being prepared..."}
                </p>
                <p style="font-size:13px;line-height:1.5;color:#647067;margin:16px 0 0;">
                  💡 Save this email so you can access your recipes anytime. You can always download them again using the link above.
                </p>
              </td>
            </tr>
            <!-- CTA Section -->
            <tr>
              <td style="padding:24px 28px;background:#f8f5ef;border-top:1px solid #e7dfd2;">
                <p style="margin:0 0 12px;color:#26342b;font-weight:600;font-size:14px;">Need Help?</p>
                <p style="margin:0;color:#647067;font-size:13px;line-height:1.6;">
                  If you have any questions or need assistance, please don't hesitate to reach out to our support team.
                </p>
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="background:#26342b;color:#ffffff;padding:24px 28px;font-size:12px;line-height:1.6;text-align:center;">
                <p style="margin:0 0 8px;">All Recipe Diet by Josh Danielson</p>
                <p style="margin:0;color:#a8a8a8;">
                  <a href="https://all-recipe-diet.netlify.app" style="color:#a8a8a8;text-decoration:none;">Visit Our Website</a> | 
                  <a href="mailto:support@allrecipediet.com" style="color:#a8a8a8;text-decoration:none;">Contact Support</a>
                </p>
                <p style="margin:12px 0 0;color:#666666;font-size:11px;">
                  Order Reference: ${payload.checkoutSessionId}
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;color:#a8a8a8;font-size:11px;text-align:center;">
            © 2026 All Recipe Diet. All rights reserved.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildRecipeEmailText(payload) {
  return [
    "ALL RECIPE DIET",
    "Your Recipe Package is Ready!",
    "",
    `Hello${payload.customerName ? `, ${payload.customerName}` : ""},`,
    "",
    `Thank you for purchasing the ${payload.packageName}!`,
    "Your recipes are ready to download and start using right away.",
    "",
    "PACKAGE DETAILS:",
    `- Type: ${payload.packageName}`,
    `- Order ID: ${payload.checkoutSessionId}`,
    "",
    "DOWNLOAD YOUR RECIPES:",
    payload.deliveryUrl
      ? `${payload.deliveryUrl}`
      : "Your recipe download link is being prepared. Please check back shortly.",
    "",
    "NEED HELP?",
    "If you have any questions or need assistance, please reach out to our support team.",
    "",
    "Save this email so you can access your recipes anytime!",
    "",
    "---",
    "All Recipe Diet by Josh Danielson",
    "https://all-recipe-diet.netlify.app",
    `Order Reference: ${payload.checkoutSessionId}`,
    "© 2026 All Recipe Diet. All rights reserved.",
  ].join("\n");
}

async function sendRecipeEmail(payload) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.FROM_EMAIL || "All Recipe Diet <noreply@allrecipediet.com>";
  const replyToEmail = process.env.REPLY_TO_EMAIL || "support@allrecipediet.com";

  if (!resendApiKey) {
    console.error("RESEND_API_KEY not configured. Recipe email NOT sent.", {
      customerEmail: payload.customerEmail,
      packageKey: payload.packageKey,
    });
    return { configured: false, sent: false, reason: "api_key_missing" };
  }

  if (!payload.customerEmail) {
    console.warn("No customer email found on checkout session. Recipe email not sent.", {
      sessionId: payload.checkoutSessionId,
      packageKey: payload.packageKey,
    });
    return { configured: true, sent: false, reason: "missing_customer_email" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${resendApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [payload.customerEmail],
        reply_to: replyToEmail,
        subject: `🎉 Your ${payload.packageName} is Ready to Download`,
        html: buildRecipeEmailHtml(payload),
        text: buildRecipeEmailText(payload),
        tags: [
          { name: "website", value: "all-recipe-diet" },
          { name: "package", value: payload.packageKey },
          { name: "type", value: "order-confirmation" },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Resend API error ${response.status}: ${errorText}`);
    }

    const responseData = await response.json();

    console.log("Recipe email sent successfully", {
      messageId: responseData.id,
      to: payload.customerEmail,
      package: payload.packageKey,
      sessionId: payload.checkoutSessionId,
    });

    return { configured: true, sent: true, messageId: responseData.id };
  } catch (error) {
    console.error("Failed to send recipe email", {
      error: error.message,
      customerEmail: payload.customerEmail,
      packageKey: payload.packageKey,
      sessionId: payload.checkoutSessionId,
    });

    return { configured: true, sent: false, error: error.message };
  }
}

exports.handler = async (event) => {
  console.log("Webhook event received", { type: event.httpMethod });

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

  const signatureHeader = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];
  const isValidSignature = verifyStripeSignature(rawBody, signatureHeader, webhookSecret);

  if (!isValidSignature) {
    console.warn("Invalid Stripe webhook signature.");
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "Invalid signature" }),
    };
  }

  let stripeEvent;

  try {
    stripeEvent = JSON.parse(rawBody);
  } catch (error) {
    console.error("Webhook JSON parse error", error);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid JSON" }),
    };
  }

  console.log("Stripe event parsed", { type: stripeEvent.type, id: stripeEvent.id });

  if (stripeEvent.type !== "checkout.session.completed") {
    console.log("Event ignored - not checkout.session.completed", { type: stripeEvent.type });
    return {
      statusCode: 200,
      body: JSON.stringify({ received: true, ignored: stripeEvent.type }),
    };
  }

  const session = stripeEvent.data.object;
  const packageInfo = getPackageFromSession(session);
  const customerEmail = session.customer_details?.email || session.customer_email || "";

  console.log("Processing checkout completion", {
    sessionId: session.id,
    package: packageInfo.packageKey,
    customerEmail: customerEmail,
    amount: session.amount_total,
  });

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
    const [deliveryResult, emailResult, payoutResult] = await Promise.all([
      notifyDeliveryAutomation(deliveryPayload),
      sendRecipeEmail(deliveryPayload),
      processBankPayout(session, packageInfo),
    ]);

    console.log("Stripe checkout completed successfully", {
      sessionId: session.id,
      package: packageInfo.packageKey,
      customerEmail: customerEmail,
      deliveryConfigured: deliveryResult.configured,
      emailSent: emailResult.sent,
      payoutProcessed: payoutResult.processed,
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
    console.error("Webhook processing error", {
      error: error.message,
      sessionId: session.id,
      package: packageInfo.packageKey,
      customerEmail: customerEmail,
    });

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Payment received, but processing failed.",
        details: error.message,
      }),
    };
  }
};
