import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const CreateInvoiceSchema = z.object({
    action: z.literal('create'),
    client_name: z.string().min(1),
    client_email: z.string().email().optional(),
    client_address: z.string().optional(),
    your_name: z.string().min(1),
    your_email: z.string().email().optional(),
    your_address: z.string().optional(),
    invoice_number: z.string().optional(),
    issue_date: z.string(),
    due_date: z.string().optional(),
    currency: z.string().default('USD'),
    items: z.array(z.object({
        description: z.string(),
        quantity: z.number().default(1),
        rate: z.number(),
    })).min(1),
    tax_rate: z.number().min(0).max(50).default(0),
    notes: z.string().optional(),
    service_type: z.enum(['sponsored_post', 'consulting', 'content_writing', 'seo_services', 'link_building', 'custom']).default('sponsored_post'),
});

function generateInvoiceHtml(data: ReturnType<typeof CreateInvoiceSchema.parse>, subtotal: number, tax: number, total: number, invoiceNum: string): string {
    const items = data.items.map(item => `
        <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #eee">${item.description}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${item.quantity}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${data.currency} ${item.rate.toFixed(2)}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${data.currency} ${(item.quantity * item.rate).toFixed(2)}</td>
        </tr>`).join('');

    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Invoice ${invoiceNum}</title></head>
<body style="font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:40px;color:#333">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px">
        <div>
            <h1 style="font-size:2.5rem;font-weight:900;color:#1e40af;margin:0">INVOICE</h1>
            <div style="color:#6b7280;margin-top:4px">#${invoiceNum}</div>
        </div>
        <div style="text-align:right">
            <div style="font-weight:700;font-size:1.1rem">${data.your_name}</div>
            ${data.your_email ? `<div style="color:#6b7280">${data.your_email}</div>` : ''}
            ${data.your_address ? `<div style="color:#6b7280;white-space:pre-line">${data.your_address}</div>` : ''}
        </div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-bottom:40px">
        <div>
            <div style="font-size:0.75rem;text-transform:uppercase;color:#6b7280;margin-bottom:6px">Bill To</div>
            <div style="font-weight:700">${data.client_name}</div>
            ${data.client_email ? `<div style="color:#6b7280">${data.client_email}</div>` : ''}
            ${data.client_address ? `<div style="color:#6b7280;white-space:pre-line">${data.client_address}</div>` : ''}
        </div>
        <div style="text-align:right">
            <div style="margin-bottom:4px"><span style="color:#6b7280">Issue Date:</span> <strong>${data.issue_date}</strong></div>
            ${data.due_date ? `<div><span style="color:#6b7280">Due Date:</span> <strong>${data.due_date}</strong></div>` : ''}
        </div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <thead><tr style="background:#1e40af;color:#fff">
            <th style="padding:10px 12px;text-align:left">Description</th>
            <th style="padding:10px 12px;text-align:center">Qty</th>
            <th style="padding:10px 12px;text-align:right">Rate</th>
            <th style="padding:10px 12px;text-align:right">Amount</th>
        </tr></thead>
        <tbody>${items}</tbody>
    </table>
    <div style="display:flex;justify-content:flex-end">
        <div style="min-width:240px">
            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee"><span style="color:#6b7280">Subtotal</span><span>${data.currency} ${subtotal.toFixed(2)}</span></div>
            ${data.tax_rate > 0 ? `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee"><span style="color:#6b7280">Tax (${data.tax_rate}%)</span><span>${data.currency} ${tax.toFixed(2)}</span></div>` : ''}
            <div style="display:flex;justify-content:space-between;padding:10px 0;font-weight:900;font-size:1.1rem;color:#1e40af"><span>Total</span><span>${data.currency} ${total.toFixed(2)}</span></div>
        </div>
    </div>
    ${data.notes ? `<div style="margin-top:32px;padding:16px;background:#f8fafc;border-radius:6px"><div style="font-size:0.75rem;text-transform:uppercase;color:#6b7280;margin-bottom:6px">Notes</div><div>${data.notes}</div></div>` : ''}
    <div style="margin-top:40px;text-align:center;color:#6b7280;font-size:0.85rem;border-top:1px solid #eee;padding-top:20px">Thank you for your business!</div>
</body></html>`;
}

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const { data } = await supabase.from('invoices').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    return NextResponse.json({ invoices: data || [] });
}

export async function POST(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const body = await req.json();

    if (body.action === 'create') {
        const parsed = CreateInvoiceSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        const d = parsed.data;

        const subtotal = d.items.reduce((s, i) => s + i.quantity * i.rate, 0);
        const tax = subtotal * (d.tax_rate / 100);
        const total = subtotal + tax;

        const { count } = await supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
        const invoiceNum = d.invoice_number || `INV-${String((count || 0) + 1).padStart(4, '0')}`;

        const html = generateInvoiceHtml(d, subtotal, tax, total, invoiceNum);

        const { data: invoice, error } = await supabase.from('invoices').insert({
            user_id: user.id, invoice_number: invoiceNum, client_name: d.client_name,
            client_email: d.client_email || null, service_type: d.service_type,
            subtotal, tax, total, currency: d.currency,
            issue_date: d.issue_date, due_date: d.due_date || null,
            status: 'draft', html, items: d.items,
        }).select().single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ invoice, html });
    }

    if (body.action === 'update_status') {
        await supabase.from('invoices').update({ status: body.status }).eq('id', body.invoice_id).eq('user_id', user.id);
        return NextResponse.json({ updated: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
