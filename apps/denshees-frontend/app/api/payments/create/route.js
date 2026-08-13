import { NextResponse } from "next/server";
import DodoPayments from "dodopayments";

function getDodoClient() {
  const bearerToken = process.env.DODO_PAYMENTS_API_KEY;
  if (!bearerToken) {
    throw new Error("DODO_PAYMENTS_API_KEY is not configured");
  }
  return new DodoPayments({ bearerToken });
}

export async function POST(request) {
  try {
    const client = getDodoClient();
    const body = await request.json();
    const { creditType, quantity, userInfo } = body;

    
    if (!creditType || !quantity || !userInfo) {
      return NextResponse.json(
        { error: "Missing required fields: creditType, quantity, userInfo" },
        { status: 400 }
      );
    }

    
    const productIds = {
      email: "pdt_c4RWntNhdXKORtUOwtVOW",
      ai: "pdt_Rwecty69q6lJdpnP6dCwb",
    };

    const productId = productIds[creditType];
    if (!productId) {
      return NextResponse.json(
        { error: 'Invalid credit type. Must be "email" or "ai"' },
        { status: 400 }
      );
    }

    console.log(userInfo);
    
    const payment = await client.payments.create({
      return_url: `https://app.denshees.com/dashboard`,
      payment_link: true,
      billing: {
        city: userInfo.city || "Unknown",
        country: userInfo.country || "US",
        state: userInfo.state || "Unknown",
        street: userInfo.street || "Unknown",
        zipcode: userInfo.zipcode || "00000",
      },
      customer: {
        name: userInfo.name,
        email: userInfo.email,
        create_new_customer: true,
      },
      product_cart: [
        {
          product_id: productId,
          quantity: quantity,
        },
      ],
    });

    console.log("Payment created:", payment);
    
    console.log("Payment created:", payment.payment_id);

    
    return NextResponse.json({
      success: true,
      payment_id: payment.payment_id,
      payment_link: payment.payment_link,
      total_amount: payment.total_amount,
      expires_on: payment.expires_on,
      customer: payment.customer,
    });
  } catch (error) {
    console.error("Payment creation error:", error);

    
    if (error.response) {
      
      return NextResponse.json(
        {
          error: "Payment service error",
          details: error.response.data?.message || error.message,
        },
        { status: error.response.status || 500 }
      );
    } else if (error.request) {
      
      return NextResponse.json(
        { error: "Network error - unable to reach payment service" },
        { status: 503 }
      );
    } else {
      
      return NextResponse.json(
        { error: "Internal server error", details: error.message },
        { status: 500 }
      );
    }
  }
}


export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST to create payments." },
    { status: 405 }
  );
}
