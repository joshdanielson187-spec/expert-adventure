# All Recipe Diet Webhook Email Setup

This site includes a Netlify Function backend that receives Stripe events and emails the recipe download link to the buyer.

## Endpoint

```
https://all-recipe-diet.org/.netlify/functions/stripe-webhook
```

Netlify rewrites that path to the underlying function at `/.netlify/functions/stripe-webhook` (see `netlify.toml`).

## What the webhook does

When Stripe sends a `checkout.session.completed` event:

- The Stripe signature is verified using `STRIPE_WEBHOOK_SECRET`.
- The function maps the purchase to one of three packages by Stripe payment link ID (with an amount-based fallback for Premium only, since Starter and Gluten-Free are both $19 and cannot be told apart by price):
  - **Starter** — payment link `plink_1TTmthHHJHOb4J4jVWRDRXQY` ($19) → `/downloads/starter-package-9f4d2a7c.html`
  - **Premium** — payment link `plink_1TTmthHHJHOb4J4jRLkHKP3J` ($29) → `/downloads/premium-package-c8e7b3a1.html`
  - **Gluten-Free** — payment link `plink_1TXq65HHJHOb4J4j0SrDA1sK` ($19) → `/downloads/gluten-free-package-a6c91d2f.html`
- If `RESEND_API_KEY` is configured, an email is sent through Resend to the buyer with the download link.
- If `DELIVERY_WEBHOOK_URL` is configured, the same payload is also POSTed there (Zapier/Make/etc.).
- The customer's email comes from the Stripe Checkout session.

## Netlify environment variables

In Netlify, go to **Site settings → Environment variables** and add:

```text
STRIPE_WEBHOOK_SECRET=your Stripe webhook signing secret (starts with whsec_)
RESEND_API_KEY=your Resend email API key
FROM_EMAIL=All Recipe Diet <your verified sender email>
REPLY_TO_EMAIL=your support email
SITE_URL=https://all-recipe-diet.org
```

Optional overrides for the delivery URLs (defaults are derived from `SITE_URL`):

```text
STARTER_DELIVERY_URL=https://all-recipe-diet.org/downloads/starter-package-9f4d2a7c.html
PREMIUM_DELIVERY_URL=https://all-recipe-diet.org/downloads/premium-package-c8e7b3a1.html
GLUTEN_FREE_DELIVERY_URL=https://all-recipe-diet.org/downloads/gluten-free-package-a6c91d2f.html
```

Optional outbound automation:

```text
DELIVERY_WEBHOOK_URL=https://hooks.zapier.com/... (or any URL that accepts a JSON POST)
```

Until `RESEND_API_KEY` is added, the webhook still receives and verifies Stripe events, it just does not send the recipe email.

## Stripe webhook settings

In the Stripe Dashboard, go to **Developers → Webhooks → Add endpoint**.

Endpoint URL:

```text
https://all-recipe-diet.org/.netlify/functions/stripe-webhook
```

Event to send:

```text
checkout.session.completed
```

After creating the endpoint, copy the webhook signing secret (`whsec_...`) and paste it into Netlify as `STRIPE_WEBHOOK_SECRET`.

## Delivery URLs

These are the three download files served by Netlify:

| Package | Price | Payment link | Delivery URL |
| --- | --- | --- | --- |
| Starter | $19 | `https://pay.all-recipe-diet.org/b/eVq5kD46T0Mg7T0exO5gc05` | `https://all-recipe-diet.org/downloads/starter-package-9f4d2a7c.html` |
| Gluten-Free | $19 | `https://pay.all-recipe-diet.org/b/dRmdR90UH66Agpwahy5gc0d` | `https://all-recipe-diet.org/downloads/gluten-free-package-a6c91d2f.html` |
| Premium | $29 | `https://pay.all-recipe-diet.org/b/5kQbJ17j5fHa7T0dtK5gc04` | `https://all-recipe-diet.org/downloads/premium-package-c8e7b3a1.html` |

## Email service

The function is ready to send through Resend. Create a Resend account, verify your sender/domain, then copy your Resend API key into Netlify as `RESEND_API_KEY`. Set `FROM_EMAIL` to a sender you have verified in Resend.
