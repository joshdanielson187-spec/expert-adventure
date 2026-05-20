
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  const sig = event.headers['stripe-signature'];
  const body = event.body;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  // Verify webhook signature
  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Webhook signature verification failed' }),
    };
  }

  // Handle checkout.session.completed event
  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;

    try {
      // Process the payment
      console.log(`Payment received for session: ${session.id}`);
      console.log(`Amount: ${session.amount_total}`);
      console.log(`Customer: ${session.customer_email}`);

      // TODO: Add your bank payout logic here
      // Example:
      // - Update database with order status
      // - Trigger payout to bank account
      // - Send confirmation email to customer
      // - Log transaction for accounting

      return {
        statusCode: 200,
        body: JSON.stringify({ received: true }),
      };
    } catch (error) {
      console.error(`Error processing payment: ${error.message}`);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Payment processing failed' }),
      };
    }
  }

  // Handle other webhook events as needed
  if (stripeEvent.type === 'charge.refunded') {
    console.log('Refund processed');
    // Handle refund logic
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ received: true }),
  };
};
