exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { allow: "POST" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  console.log("Resend webhook received", {
    headers: event.headers,
    body: event.body,
  });

  return {
    statusCode: 200,
    body: JSON.stringify({ received: true }),
  };
};
