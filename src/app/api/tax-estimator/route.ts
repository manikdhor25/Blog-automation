// ============================================================
// RankMaster Pro - Affiliate Tax Estimator API
// Quarterly estimated taxes for self-employed affiliate income
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';
import { z } from 'zod';

const Schema = z.object({
    action: z.enum(['estimate', 'log_payment', 'get_history', 'set_profile']),
    filing_status: z.enum(['single', 'married_joint', 'married_separate', 'head_of_household']).optional(),
    state: z.string().max(2).optional(),
    annual_income_estimate: z.number().min(0).optional(),
    other_income: z.number().min(0).default(0).optional(),
    deductible_expenses: z.number().min(0).default(0).optional(),
    quarter: z.enum(['Q1', 'Q2', 'Q3', 'Q4']).optional(),
    year: z.number().int().optional(),
    amount_paid: z.number().min(0).optional(),
});

// 2024 US Federal Tax Brackets (Single)
const FEDERAL_BRACKETS_SINGLE = [
    { min: 0, max: 11600, rate: 0.10 },
    { min: 11600, max: 47150, rate: 0.12 },
    { min: 47150, max: 100525, rate: 0.22 },
    { min: 100525, max: 191950, rate: 0.24 },
    { min: 191950, max: 243725, rate: 0.32 },
    { min: 243725, max: 609350, rate: 0.35 },
    { min: 609350, max: Infinity, rate: 0.37 },
];

const FEDERAL_BRACKETS_MFJ = [
    { min: 0, max: 23200, rate: 0.10 },
    { min: 23200, max: 94300, rate: 0.12 },
    { min: 94300, max: 201050, rate: 0.22 },
    { min: 201050, max: 383900, rate: 0.24 },
    { min: 383900, max: 487450, rate: 0.32 },
    { min: 487450, max: 731200, rate: 0.35 },
    { min: 731200, max: Infinity, rate: 0.37 },
];

function calcFederalTax(income: number, isMFJ: boolean): number {
    const brackets = isMFJ ? FEDERAL_BRACKETS_MFJ : FEDERAL_BRACKETS_SINGLE;
    let tax = 0;
    for (const bracket of brackets) {
        if (income <= bracket.min) break;
        const taxableInBracket = Math.min(income, bracket.max) - bracket.min;
        tax += taxableInBracket * bracket.rate;
    }
    return tax;
}

// Quarterly due dates
const QUARTER_DUE_DATES: Record<string, string> = {
    Q1: 'April 15', Q2: 'June 15', Q3: 'September 15', Q4: 'January 15 (next year)',
};

export async function POST(request: NextRequest) {
    const auth = await getAuthUser();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { action } = parsed.data;

    if (action === 'estimate') {
        const { filing_status = 'single', annual_income_estimate = 0, other_income = 0, deductible_expenses = 0 } = parsed.data;

        // Get actual revenue from DB if available
        const { data: revenue } = await auth.supabase.from('affiliate_revenue').select('amount, month').eq('user_id', auth.user.id).order('month', { ascending: false }).limit(12);
        const totalAffiliateRevenue = (revenue || []).reduce((s: number, r: { amount: number }) => s + r.amount, 0);
        const annualAffiliate = revenue?.length ? (totalAffiliateRevenue / Math.min(revenue.length, 12)) * 12 : annual_income_estimate;

        const grossIncome = annualAffiliate + other_income;
        const seDeduction = grossIncome * 0.9235 * 0.1530 / 2; // SE tax deduction
        const standardDeduction = filing_status === 'married_joint' ? 29200 : 14600;
        const adjustedGross = Math.max(0, grossIncome - seDeduction - deductible_expenses);
        const taxableIncome = Math.max(0, adjustedGross - standardDeduction);

        const isMFJ = filing_status === 'married_joint';
        const federalTax = calcFederalTax(taxableIncome, isMFJ);

        // Self-employment tax (15.3% on 92.35% of net SE income)
        const seTax = Math.min(annualAffiliate * 0.9235, 160200) * 0.124 + annualAffiliate * 0.9235 * 0.029;

        const totalTax = federalTax + seTax;
        const quarterlyPayment = totalTax / 4;
        const effectiveRate = grossIncome > 0 ? (totalTax / grossIncome) * 100 : 0;

        const currentMonth = new Date().getMonth() + 1;
        const currentQuarter = currentMonth <= 3 ? 'Q1' : currentMonth <= 5 ? 'Q2' : currentMonth <= 8 ? 'Q3' : 'Q4';

        return NextResponse.json({
            estimate: {
                gross_income: Math.round(grossIncome),
                affiliate_income: Math.round(annualAffiliate),
                deductible_expenses: Math.round(deductible_expenses),
                standard_deduction: standardDeduction,
                taxable_income: Math.round(taxableIncome),
                federal_income_tax: Math.round(federalTax),
                self_employment_tax: Math.round(seTax),
                total_annual_tax: Math.round(totalTax),
                quarterly_payment: Math.round(quarterlyPayment),
                effective_tax_rate: parseFloat(effectiveRate.toFixed(1)),
                current_quarter: currentQuarter,
                next_due_date: QUARTER_DUE_DATES[currentQuarter],
            },
            quarterly_schedule: ['Q1', 'Q2', 'Q3', 'Q4'].map(q => ({
                quarter: q,
                amount_due: Math.round(quarterlyPayment),
                due_date: QUARTER_DUE_DATES[q],
                period: q === 'Q1' ? 'Jan 1 – Mar 31' : q === 'Q2' ? 'Apr 1 – May 31' : q === 'Q3' ? 'Jun 1 – Aug 31' : 'Sep 1 – Dec 31',
            })),
            deductible_expenses_reminder: [
                'Home office (% of home used for business)',
                'Internet and phone (business % only)',
                'Software subscriptions (SEO tools, hosting, email)',
                'Hardware (laptop, monitors, equipment)',
                'Education (courses, books, conferences)',
                'Health insurance premiums (self-employed deduction)',
                'Retirement contributions (SEP-IRA, Solo 401k)',
                'Professional services (accountant, legal)',
            ],
            disclaimer: 'This is an estimate only. Consult a tax professional for advice specific to your situation. Tax laws change annually.',
        });
    }

    if (action === 'log_payment') {
        const { quarter, year, amount_paid } = parsed.data;
        if (!quarter || !amount_paid) return NextResponse.json({ error: 'quarter and amount_paid required' }, { status: 400 });

        const { data, error } = await auth.supabase.from('tax_payments').upsert({
            user_id: auth.user.id,
            quarter, year: year || new Date().getFullYear(), amount_paid,
            paid_at: new Date().toISOString(),
        }, { onConflict: 'user_id,quarter,year' }).select().single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ payment: data });
    }

    if (action === 'get_history') {
        const { data } = await auth.supabase.from('tax_payments').select('*').eq('user_id', auth.user.id).order('year', { ascending: false }).order('quarter', { ascending: false });
        return NextResponse.json({ payments: data || [] });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
