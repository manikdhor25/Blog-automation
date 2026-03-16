// ============================================================
// RankMaster Pro - Core Types
// ============================================================

// --- Site Management ---
export interface Site {
    id: string;
    name: string;
    url: string;
    username: string;
    app_password_encrypted: string;
    niche: string;
    created_at: string;
    post_count?: number;
    avg_seo_score?: number;
}

export interface SiteFormData {
    name: string;
    url: string;
    username: string;
    app_password: string;
    niche: string;
}

// --- Author Profiles (E-E-A-T) ---
export interface AuthorProfile {
    id: string;
    site_id: string;
    name: string;
    slug: string;
    bio: string;
    credentials: string;
    headshot_url: string;
    social_twitter: string;
    social_linkedin: string;
    website_url: string;
    expertise_areas: string[];
    is_default: boolean;
    created_at: string;
}

// --- Topic Clusters ---
export interface TopicCluster {
    id: string;
    site_id: string;
    pillar_topic: string;
    description: string;
    authority_score: number;
    created_at: string;
    keywords?: Keyword[];
    posts?: Post[];
}

// --- Keywords ---
export type SearchIntent = 'informational' | 'commercial' | 'transactional' | 'navigational';
export type KeywordStatus = 'discovered' | 'researched' | 'targeted' | 'ranking' | 'archived';
export type SERPFeature = 'featured_snippet' | 'paa' | 'knowledge_panel' | 'video' | 'image_pack' | 'local_pack' | 'shopping' | 'news';

export interface Keyword {
    id: string;
    site_id: string;
    cluster_id: string | null;
    keyword: string;
    search_volume: number;
    difficulty: number;
    cpc: number;
    intent_type: SearchIntent;
    serp_features: SERPFeature[];
    priority_score: number;
    status: KeywordStatus;
    created_at: string;
}

// --- SERP Results ---
export interface SERPResult {
    id: string;
    keyword_id: string;
    position: number;
    url: string;
    title: string;
    snippet: string;
    domain: string;
    has_featured_snippet: boolean;
    has_paa: boolean;
    fetched_at: string;
}

// --- Competitor Content ---
export interface CompetitorContent {
    id: string;
    serp_result_id: string;
    word_count: number;
    headings_json: HeadingStructure[];
    entities_json: string[];
    content_structure: string;
    quality_score: number;
    analyzed_at: string;
}

export interface HeadingStructure {
    level: number;
    text: string;
}

// --- Posts ---
export type PostStatus = 'draft' | 'review' | 'optimized' | 'published' | 'scheduled';

export interface Post {
    id: string;
    site_id: string;
    wp_post_id: number | null;
    cluster_id: string | null;
    keyword_id: string | null;
    title: string;
    slug: string;
    content_html: string;
    content_markdown: string;
    status: PostStatus;
    seo_score: number;
    aeo_score: number;
    eeat_score: number;
    readability_score: number;
    snippet_score: number;
    overall_score: number;
    meta_title: string;
    meta_description: string;
    schema_markup_json: Record<string, unknown>;
    published_at: string | null;
    last_optimized_at: string | null;
    decay_alert: boolean;
    created_at: string;
}

// --- Content Scoring ---
export interface ContentScore {
    seo: number;
    aeo: number;
    eeat: number;
    readability: number;
    snippet: number;
    schema: number;
    links: number;
    freshness: number;
    depth: number;
    intent: number;
    geo: number;
    serpCorrelation: number;
    topicCoverage: number;
    missingTopics: string[];
    overall: number;
    details: ScoreDetail[];

    // QC-exclusive dimensions (added by score normalizer, 0-100 scale)
    humanness?: number;
    userValue?: number;
    competitive?: number;

    // Publish readiness (from QC Engine)
    publishReadiness?: {
        decision: PublishDecision;
        rankability: RankabilityPrediction;
        overallQC: number;          // 0-10 QC score
        improvements: string[];
    };
}

export interface ScoreDetail {
    dimension: string;
    score: number;
    maxScore: number;
    issues: string[];
    suggestions: string[];
}

// --- Internal Links ---
export interface InternalLink {
    id: string;
    site_id: string;
    from_post_id: string;
    to_post_id: string;
    anchor_text: string;
    relevance_score: number;
}

// --- Content Tasks ---
export type TaskType = 'optimize' | 'create' | 'refresh' | 'link_build';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface ContentTask {
    id: string;
    site_id: string;
    task_type: TaskType;
    keyword_id: string | null;
    status: TaskStatus;
    priority: number;
    scheduled_for: string | null;
    completed_at: string | null;
    created_at: string;
}

// --- Publishing Schedule ---
export interface PublishingSchedule {
    id: string;
    site_id: string;
    post_id: string;
    publish_at: string;
    status: 'scheduled' | 'published' | 'failed';
    created_at: string;
}

// --- AI Router ---
export type AIProvider = 'gemini' | 'openai';
export type AITaskType =
    | 'keyword_suggestion'
    | 'content_scoring'
    | 'competitor_analysis'
    | 'content_writing'
    | 'content_optimization'
    | 'schema_generation'
    | 'meta_generation'
    | 'topic_research';

// --- WordPress ---
export interface WPPost {
    id: number;
    title: { rendered: string };
    content: { rendered: string };
    excerpt: { rendered: string };
    slug: string;
    status: string;
    date: string;
    modified: string;
    categories: number[];
    tags: number[];
    link: string;
}

export interface WPCategory {
    id: number;
    name: string;
    slug: string;
    count: number;
}

// --- Dashboard Stats ---
export interface DashboardStats {
    totalSites: number;
    totalPosts: number;
    totalKeywords: number;
    avgSeoScore: number;
    avgAeoScore: number;
    pendingTasks: number;
    decayAlerts: number;
    recentActivity: ActivityItem[];
}

export interface ActivityItem {
    id: string;
    type: 'post_created' | 'post_optimized' | 'post_published' | 'keyword_added' | 'site_added';
    description: string;
    timestamp: string;
}

// --- Content Records (generation tracking) ---
export type ContentRecordType = 'article' | 'cluster' | 'optimized';
export type ContentPublishStatus = 'generated' | 'queued' | 'draft' | 'published';

export interface ContentRecord {
    id: string;
    user_id: string;
    site_id: string | null;
    post_id: string | null;
    keyword: string;
    title: string;
    slug: string;
    content_type: ContentRecordType;
    language: string;
    ai_provider: string;
    ai_model: string;
    word_count_target: number;
    word_count_actual: number;
    competitor_count: number;
    section_count: number;
    internal_link_count: number;
    external_link_count: number;
    generation_duration_ms: number;
    overall_score: number;
    seo_score: number;
    aeo_score: number;
    eeat_score: number;
    readability_score: number;
    naturalness_score: number;
    outline_data: Record<string, unknown>;
    blueprint_data: Record<string, unknown>;
    score_details: Record<string, unknown>;
    meta_title: string;
    meta_description: string;
    site_name: string;
    site_url: string;
    publish_status: ContentPublishStatus;
    published_at: string | null;
    wp_post_id: number | null;
    created_at: string;
    updated_at: string;
}

// --- Quality Control Engine ---
export type RankabilityPrediction =
    | 'NOT_RANKABLE'
    | 'LOW_RANK_POTENTIAL'
    | 'MODERATE_RANK_POTENTIAL'
    | 'HIGH_RANK_POTENTIAL'
    | 'ELITE_RANKABLE_CONTENT';

export type PublishDecision = 'Reject' | 'Needs Revision' | 'Acceptable' | 'Publish Immediately';

export type HumannessClassification =
    | 'Human-like'
    | 'Minor AI patterns'
    | 'Moderate AI patterns'
    | 'Strong AI patterns';

export type CompetitiveClassification = 'Weak' | 'Moderate' | 'Strong' | 'Dominant';

export interface QCDimensionResult {
    score: number;        // 0-10
    issues: string[];
    suggestions: string[];
    metrics: Record<string, number | string>;
}

export interface QualityControlReport {
    // Input context
    primaryKeyword: string;
    secondaryKeywords: string[];
    searchIntent: string;
    targetAudience: string;

    // 9 dimension scores (0-10)
    readabilityScore: QCDimensionResult;
    humannessScore: QCDimensionResult;
    seoStructureScore: QCDimensionResult;
    topicalDepthScore: QCDimensionResult;
    semanticScore: QCDimensionResult;
    eeatScore: QCDimensionResult;
    aeoScore: QCDimensionResult;
    valueScore: QCDimensionResult;
    competitiveScore: QCDimensionResult;

    // Aggregate
    overallScore: number; // 0-10 weighted average
    rankabilityPrediction: RankabilityPrediction;
    publishDecision: PublishDecision;
    humannessClassification: HumannessClassification;
    competitiveClassification: CompetitiveClassification;

    // Actionable
    requiredImprovements: string[];
    reasoning: string;

    // Metadata
    evaluatedAt: string;
    wordCount: number;
}
