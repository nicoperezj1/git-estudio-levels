import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { sendReceipt } from "@/lib/resend";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();
  const body = await req.json();
  const { transactionId, email } = body;

  const { data: tx } = await supabase
    .from("transactions")
    .select(`
      *,
      client:clients(name, email),
      barber:profiles(name),
      items:transaction_items(description, quantity, unit_price, total)
    `)
    .eq("id", transactionId)
    .single();

  if (!tx) return NextResponse.json({ error: "Transaccion no encontrada" }, { status: 404 });

  const recipientEmail = email || tx.client?.email;
  if (!recipientEmail) {
    return NextResponse.json({ error: "No se encontro email del cliente" }, { status: 400 });
  }

  let businessLogoUrl: string | null = null;
  let businessName: string | null = null;
  if (tx.tenant_id) {
    const { data: tenantRow } = await supabase
      .from("tenants")
      .select("logo_url, name")
      .eq("id", tx.tenant_id)
      .single();
    businessLogoUrl = tenantRow?.logo_url || null;
    businessName = tenantRow?.name || null;
  }

  try {
    await sendReceipt({
      to: recipientEmail,
      clientName: tx.client?.name || "Cliente",
      transactionId: tx.id,
      items: (tx.items || []).map((item: any) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: Number(item.unit_price),
        total: Number(item.total),
      })),
      subtotal: Number(tx.subtotal),
      discount: Number(tx.discount),
      total: Number(tx.total),
      paymentMethod: tx.payment_method,
      date: new Date(tx.created_at),
      barberName: tx.barber?.name || "Tu profesional",
      businessLogoUrl,
      businessName,
    });

    await supabase
      .from("transactions")
      .update({ receipt_sent: true, receipt_email: recipientEmail })
      .eq("id", transactionId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
