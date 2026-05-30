'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { useToast } from '@/components/Toast';

type SchemaType = 'faq' | 'howto' | 'product' | 'review' | 'article' | 'breadcrumb' | 'local_business';

interface FAQItem { question: string; answer: string; }
interface HowToStep { name: string; text: string; image?: string; }
interface BreadcrumbItem { name: string; url: string; }

export default function SchemaBuilderPage() {
    const toast = useToast();
    const [schemaType, setSchemaType] = useState<SchemaType>('faq');
    const [output, setOutput] = useState('');
    const [copied, setCopied] = useState(false);

    // FAQ
    const [faqItems, setFaqItems] = useState<FAQItem[]>([{ question: '', answer: '' }, { question: '', answer: '' }]);

    // HowTo
    const [howToName, setHowToName] = useState('');
    const [howToDesc, setHowToDesc] = useState('');
    const [howToSteps, setHowToSteps] = useState<HowToStep[]>([{ name: '', text: '' }, { name: '', text: '' }]);
    const [howToDuration, setHowToDuration] = useState('PT10M');

    // Product
    const [productName, setProductName] = useState('');
    const [productDesc, setProductDesc] = useState('');
    const [productPrice, setProductPrice] = useState('');
    const [productCurrency, setProductCurrency] = useState('USD');
    const [productRating, setProductRating] = useState('');
    const [productReviews, setProductReviews] = useState('');
    const [productBrand, setProductBrand] = useState('');
    const [productAvail, setProductAvail] = useState('InStock');

    // Article
    const [articleTitle, setArticleTitle] = useState('');
    const [articleDesc, setArticleDesc] = useState('');
    const [articleAuthor, setArticleAuthor] = useState('');
    const [articleDate, setArticleDate] = useState(new Date().toISOString().split('T')[0]);
    const [articleImage, setArticleImage] = useState('');

    // Breadcrumb
    const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([{ name: 'Home', url: 'https://yoursite.com' }, { name: '', url: '' }]);

    // Local Business
    const [bizName, setBizName] = useState('');
    const [bizAddress, setBizAddress] = useState('');
    const [bizPhone, setBizPhone] = useState('');
    const [bizUrl, setBizUrl] = useState('');
    const [bizType, setBizType] = useState('LocalBusiness');

    const generate = () => {
        let schema: Record<string, unknown> = {};

        if (schemaType === 'faq') {
            schema = {
                '@context': 'https://schema.org',
                '@type': 'FAQPage',
                'mainEntity': faqItems.filter(f => f.question && f.answer).map(f => ({
                    '@type': 'Question',
                    'name': f.question,
                    'acceptedAnswer': { '@type': 'Answer', 'text': f.answer },
                })),
            };
        } else if (schemaType === 'howto') {
            schema = {
                '@context': 'https://schema.org',
                '@type': 'HowTo',
                'name': howToName,
                'description': howToDesc,
                'totalTime': howToDuration,
                'step': howToSteps.filter(s => s.name && s.text).map((s, i) => ({
                    '@type': 'HowToStep',
                    'position': i + 1,
                    'name': s.name,
                    'text': s.text,
                    ...(s.image ? { 'image': s.image } : {}),
                })),
            };
        } else if (schemaType === 'product') {
            schema = {
                '@context': 'https://schema.org',
                '@type': 'Product',
                'name': productName,
                'description': productDesc,
                'brand': { '@type': 'Brand', 'name': productBrand },
                'offers': {
                    '@type': 'Offer',
                    'price': productPrice,
                    'priceCurrency': productCurrency,
                    'availability': `https://schema.org/${productAvail}`,
                },
                ...(productRating ? {
                    'aggregateRating': {
                        '@type': 'AggregateRating',
                        'ratingValue': productRating,
                        'reviewCount': productReviews || '0',
                    },
                } : {}),
            };
        } else if (schemaType === 'article') {
            schema = {
                '@context': 'https://schema.org',
                '@type': 'Article',
                'headline': articleTitle,
                'description': articleDesc,
                'author': { '@type': 'Person', 'name': articleAuthor },
                'datePublished': articleDate,
                'dateModified': articleDate,
                ...(articleImage ? { 'image': articleImage } : {}),
            };
        } else if (schemaType === 'breadcrumb') {
            schema = {
                '@context': 'https://schema.org',
                '@type': 'BreadcrumbList',
                'itemListElement': breadcrumbs.filter(b => b.name && b.url).map((b, i) => ({
                    '@type': 'ListItem',
                    'position': i + 1,
                    'name': b.name,
                    'item': b.url,
                })),
            };
        } else if (schemaType === 'local_business') {
            schema = {
                '@context': 'https://schema.org',
                '@type': bizType,
                'name': bizName,
                'address': { '@type': 'PostalAddress', 'streetAddress': bizAddress },
                'telephone': bizPhone,
                'url': bizUrl,
            };
        }

        const scriptTag = `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;
        setOutput(scriptTag);
    };

    const copy = () => {
        navigator.clipboard.writeText(output);
        setCopied(true);
        toast.success('Schema copied');
        setTimeout(() => setCopied(false), 2000);
    };

    const TYPES: SchemaType[] = ['faq', 'howto', 'product', 'review', 'article', 'breadcrumb', 'local_business'];

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Schema Builder</h1>
                        <p className="page-description">Visual JSON-LD schema markup generator — FAQ, HowTo, Product, Article</p>
                    </div>
                </div>

                <div className="grid-2" style={{ gap: 16, alignItems: 'flex-start' }}>
                    <div className="card">
                        <div className="form-group">
                            <label className="form-label">Schema Type</label>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {TYPES.map(t => <button key={t} className={`btn btn-sm ${schemaType === t ? 'btn-primary' : ''}`} onClick={() => setSchemaType(t)}>{t.replace('_', ' ')}</button>)}
                            </div>
                        </div>

                        {/* FAQ */}
                        {schemaType === 'faq' && (
                            <>
                                {faqItems.map((f, i) => (
                                    <div key={i} style={{ marginBottom: 12, padding: 12, background: 'var(--bg-secondary)', borderRadius: 6 }}>
                                        <div className="form-group" style={{ marginBottom: 8 }}>
                                            <label className="form-label">Question {i + 1}</label>
                                            <input className="form-input" value={f.question} onChange={e => setFaqItems(prev => prev.map((x, j) => j === i ? { ...x, question: e.target.value } : x))} placeholder="What is...?" />
                                        </div>
                                        <div className="form-group" style={{ margin: 0 }}>
                                            <label className="form-label">Answer</label>
                                            <textarea className="form-input" rows={2} value={f.answer} onChange={e => setFaqItems(prev => prev.map((x, j) => j === i ? { ...x, answer: e.target.value } : x))} />
                                        </div>
                                    </div>
                                ))}
                                <button className="btn btn-sm" onClick={() => setFaqItems(p => [...p, { question: '', answer: '' }])}>+ Add Question</button>
                            </>
                        )}

                        {/* HowTo */}
                        {schemaType === 'howto' && (
                            <>
                                <div className="form-group"><label className="form-label">Title</label><input className="form-input" value={howToName} onChange={e => setHowToName(e.target.value)} /></div>
                                <div className="form-group"><label className="form-label">Description</label><textarea className="form-input" rows={2} value={howToDesc} onChange={e => setHowToDesc(e.target.value)} /></div>
                                <div className="form-group"><label className="form-label">Total Time (ISO 8601)</label><input className="form-input" value={howToDuration} onChange={e => setHowToDuration(e.target.value)} placeholder="PT10M = 10 min, PT1H = 1 hour" /></div>
                                {howToSteps.map((s, i) => (
                                    <div key={i} style={{ marginBottom: 10, padding: 10, background: 'var(--bg-secondary)', borderRadius: 6 }}>
                                        <div className="form-group" style={{ marginBottom: 6 }}><label className="form-label">Step {i + 1} Name</label><input className="form-input" value={s.name} onChange={e => setHowToSteps(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} /></div>
                                        <div className="form-group" style={{ margin: 0 }}><label className="form-label">Instructions</label><textarea className="form-input" rows={2} value={s.text} onChange={e => setHowToSteps(prev => prev.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} /></div>
                                    </div>
                                ))}
                                <button className="btn btn-sm" onClick={() => setHowToSteps(p => [...p, { name: '', text: '' }])}>+ Add Step</button>
                            </>
                        )}

                        {/* Product */}
                        {schemaType === 'product' && (
                            <div className="grid-2" style={{ gap: 12 }}>
                                {[['Name', productName, setProductName], ['Brand', productBrand, setProductBrand], ['Price', productPrice, setProductPrice], ['Currency', productCurrency, setProductCurrency], ['Rating (0-5)', productRating, setProductRating], ['Review Count', productReviews, setProductReviews]].map(([label, val, setter]) => (
                                    <div key={label as string} className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">{label as string}</label>
                                        <input className="form-input" value={val as string} onChange={e => (setter as (v: string) => void)(e.target.value)} />
                                    </div>
                                ))}
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Availability</label>
                                    <select className="form-select" value={productAvail} onChange={e => setProductAvail(e.target.value)}>
                                        {['InStock', 'OutOfStock', 'PreOrder', 'Discontinued'].map(a => <option key={a} value={a}>{a}</option>)}
                                    </select>
                                </div>
                                <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                                    <label className="form-label">Description</label>
                                    <textarea className="form-input" rows={2} value={productDesc} onChange={e => setProductDesc(e.target.value)} />
                                </div>
                            </div>
                        )}

                        {/* Article */}
                        {schemaType === 'article' && (
                            <>
                                <div className="form-group"><label className="form-label">Headline</label><input className="form-input" value={articleTitle} onChange={e => setArticleTitle(e.target.value)} /></div>
                                <div className="form-group"><label className="form-label">Description</label><textarea className="form-input" rows={2} value={articleDesc} onChange={e => setArticleDesc(e.target.value)} /></div>
                                <div className="form-group"><label className="form-label">Author Name</label><input className="form-input" value={articleAuthor} onChange={e => setArticleAuthor(e.target.value)} /></div>
                                <div className="form-group"><label className="form-label">Date Published</label><input type="date" className="form-input" value={articleDate} onChange={e => setArticleDate(e.target.value)} /></div>
                                <div className="form-group"><label className="form-label">Image URL</label><input className="form-input" value={articleImage} onChange={e => setArticleImage(e.target.value)} /></div>
                            </>
                        )}

                        {/* Breadcrumb */}
                        {schemaType === 'breadcrumb' && (
                            <>
                                {breadcrumbs.map((b, i) => (
                                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                                        <div className="form-group" style={{ margin: 0 }}><label className="form-label">Name {i + 1}</label><input className="form-input" value={b.name} onChange={e => setBreadcrumbs(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} /></div>
                                        <div className="form-group" style={{ margin: 0 }}><label className="form-label">URL {i + 1}</label><input className="form-input" value={b.url} onChange={e => setBreadcrumbs(prev => prev.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} /></div>
                                    </div>
                                ))}
                                <button className="btn btn-sm" onClick={() => setBreadcrumbs(p => [...p, { name: '', url: '' }])}>+ Add Item</button>
                            </>
                        )}

                        {/* Local Business */}
                        {schemaType === 'local_business' && (
                            <div className="grid-2" style={{ gap: 12 }}>
                                {[['Business Name', bizName, setBizName], ['Address', bizAddress, setBizAddress], ['Phone', bizPhone, setBizPhone], ['Website URL', bizUrl, setBizUrl]].map(([label, val, setter]) => (
                                    <div key={label as string} className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">{label as string}</label>
                                        <input className="form-input" value={val as string} onChange={e => (setter as (v: string) => void)(e.target.value)} />
                                    </div>
                                ))}
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label">Schema Type</label>
                                    <input className="form-input" value={bizType} onChange={e => setBizType(e.target.value)} placeholder="LocalBusiness, Restaurant, MedicalClinic..." />
                                </div>
                            </div>
                        )}

                        <button className="btn btn-primary" style={{ marginTop: 16, width: '100%' }} onClick={generate}>Generate Schema →</button>
                    </div>

                    <div className="card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <h3 className="card-title" style={{ margin: 0 }}>Generated JSON-LD</h3>
                            {output && <button className="btn btn-sm" onClick={copy}>{copied ? 'Copied!' : 'Copy'}</button>}
                        </div>
                        {output ? (
                            <>
                                <textarea className="form-input" rows={20} readOnly value={output} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} />
                                <div className="text-sm text-muted" style={{ marginTop: 8 }}>Paste this inside your page's &lt;head&gt; or before &lt;/body&gt;</div>
                            </>
                        ) : (
                            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                                <div style={{ fontSize: '3rem', marginBottom: 16 }}>{'{ }'}</div>
                                <div style={{ fontWeight: 600 }}>Fill in the fields and click Generate</div>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
