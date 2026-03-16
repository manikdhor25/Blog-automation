// ============================================================
// RankMaster Pro - WordPress Multi-Site Client
// Full WordPress REST API v2 integration
// ============================================================

import { WPPost, WPCategory, Site } from '../types';

export class WordPressClient {
    private site: Site;
    private baseUrl: string;
    private authHeader: string;

    constructor(site: Site) {
        this.site = site;
        this.baseUrl = `${site.url.replace(/\/$/, '')}/wp-json/wp/v2`;
        this.authHeader = 'Basic ' + Buffer.from(`${site.username}:${site.app_password_encrypted}`).toString('base64');
    }

    // Test WordPress connection
    async testConnection(): Promise<{ success: boolean; message: string; siteName?: string }> {
        try {
            const response = await fetch(`${this.site.url.replace(/\/$/, '')}/wp-json`, {
                headers: { Authorization: this.authHeader },
            });

            if (!response.ok) {
                return { success: false, message: `HTTP ${response.status}: ${response.statusText}` };
            }

            const data = await response.json();
            return {
                success: true,
                message: 'Connected successfully',
                siteName: data.name,
            };
        } catch (error) {
            return {
                success: false,
                message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    }

    // Fetch all posts with pagination
    async fetchAllPosts(options?: { page?: number; perPage?: number; status?: string }): Promise<{
        posts: WPPost[];
        totalPages: number;
        totalPosts: number;
    }> {
        const { page = 1, perPage = 20, status = 'publish,draft' } = options || {};

        const params = new URLSearchParams({
            page: String(page),
            per_page: String(perPage),
            status,
            _fields: 'id,title,content,excerpt,slug,status,date,modified,categories,tags,link',
        });

        const response = await fetch(`${this.baseUrl}/posts?${params}`, {
            headers: { Authorization: this.authHeader },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch posts: ${response.status}`);
        }

        const posts: WPPost[] = await response.json();
        const totalPages = parseInt(response.headers.get('X-WP-TotalPages') || '1');
        const totalPosts = parseInt(response.headers.get('X-WP-Total') || '0');

        return { posts, totalPages, totalPosts };
    }

    // Fetch single post
    async fetchPost(postId: number): Promise<WPPost> {
        const response = await fetch(`${this.baseUrl}/posts/${postId}`, {
            headers: { Authorization: this.authHeader },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch post ${postId}: ${response.status}`);
        }

        return response.json();
    }

    // Create a new post
    async createPost(data: {
        title: string;
        content: string;
        status: 'draft' | 'publish' | 'pending' | 'private' | 'future';
        slug?: string;
        categories?: number[];
        tags?: number[];
        excerpt?: string;
        meta?: Record<string, string>;
    }): Promise<WPPost> {
        const response = await fetch(`${this.baseUrl}/posts`, {
            method: 'POST',
            headers: {
                Authorization: this.authHeader,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                title: data.title,
                content: data.content,
                status: data.status,
                slug: data.slug,
                categories: data.categories,
                tags: data.tags,
                excerpt: data.excerpt,
                meta: data.meta,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to create post: ${response.status} - ${errorText}`);
        }

        return response.json();
    }

    // Update existing post
    async updatePost(postId: number, data: {
        title?: string;
        content?: string;
        status?: 'draft' | 'publish' | 'pending' | 'private' | 'future';
        slug?: string;
        excerpt?: string;
        meta?: Record<string, string>;
    }): Promise<WPPost> {
        const response = await fetch(`${this.baseUrl}/posts/${postId}`, {
            method: 'PUT',
            headers: {
                Authorization: this.authHeader,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to update post ${postId}: ${response.status} - ${errorText}`);
        }

        return response.json();
    }

    // Delete post
    async deletePost(postId: number): Promise<void> {
        const response = await fetch(`${this.baseUrl}/posts/${postId}`, {
            method: 'DELETE',
            headers: { Authorization: this.authHeader },
        });

        if (!response.ok) {
            throw new Error(`Failed to delete post ${postId}: ${response.status}`);
        }
    }

    // Fetch categories
    async fetchCategories(): Promise<WPCategory[]> {
        const response = await fetch(`${this.baseUrl}/categories?per_page=100`, {
            headers: { Authorization: this.authHeader },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch categories: ${response.status}`);
        }

        return response.json();
    }

    // Fetch tags
    async fetchTags(): Promise<{ id: number; name: string; slug: string; count: number }[]> {
        const response = await fetch(`${this.baseUrl}/tags?per_page=100`, {
            headers: { Authorization: this.authHeader },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch tags: ${response.status}`);
        }

        return response.json();
    }

    // Sync all posts from WordPress to our system
    async syncAllPosts(): Promise<WPPost[]> {
        const allPosts: WPPost[] = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            const { posts, totalPages } = await this.fetchAllPosts({ page, perPage: 100 });
            allPosts.push(...posts);
            hasMore = page < totalPages;
            page++;
        }

        return allPosts;
    }

    // Update Yoast/RankMath SEO meta (supports both plugins)
    async updateSEOMeta(postId: number, meta: {
        title?: string;
        description?: string;
        focusKeyword?: string;
        plugin?: 'yoast' | 'rankmath' | 'auto';
    }): Promise<void> {
        const metaData: Record<string, string> = {};
        const plugin = meta.plugin || 'auto';

        if (plugin === 'yoast' || plugin === 'auto') {
            // Yoast SEO meta keys
            if (meta.title) metaData['_yoast_wpseo_title'] = meta.title;
            if (meta.description) metaData['_yoast_wpseo_metadesc'] = meta.description;
            if (meta.focusKeyword) metaData['_yoast_wpseo_focuskw'] = meta.focusKeyword;
        }

        if (plugin === 'rankmath' || plugin === 'auto') {
            // RankMath SEO meta keys
            if (meta.title) metaData['rank_math_title'] = meta.title;
            if (meta.description) metaData['rank_math_description'] = meta.description;
            if (meta.focusKeyword) metaData['rank_math_focus_keyword'] = meta.focusKeyword;
        }

        if (Object.keys(metaData).length > 0) {
            await this.updatePost(postId, { meta: metaData });
        }
    }
}

// Factory function
export function createWordPressClient(site: Site): WordPressClient {
    return new WordPressClient(site);
}
