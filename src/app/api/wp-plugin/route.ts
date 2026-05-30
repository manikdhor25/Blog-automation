import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-guard';

function generatePlugin(siteUrl: string, apiKey: string, userId: string): string {
    return `<?php
/**
 * Plugin Name: RankMaster Pro Integration
 * Description: Auto-logs 404s, click tracking, and push updates to RankMaster Pro
 * Version: 1.0.0
 * Author: RankMaster Pro
 */

if (!defined('ABSPATH')) exit;

define('RANKMASTER_API_URL', '${siteUrl}/api');
define('RANKMASTER_API_KEY', '${apiKey}');
define('RANKMASTER_USER_ID', '${userId}');

// â”€â”€ 404 Auto-Logging â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

add_action('wp', 'rankmaster_log_404');
function rankmaster_log_404() {
    if (!is_404()) return;
    $url = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'] . $_SERVER['REQUEST_URI'];
    $referrer = isset($_SERVER['HTTP_REFERER']) ? $_SERVER['HTTP_REFERER'] : '';
    wp_remote_post(RANKMASTER_API_URL . '/404-monitor', [
        'body'    => wp_json_encode(['action' => 'log', 'url' => $url, 'referrer' => $referrer]),
        'headers' => ['Content-Type' => 'application/json', 'X-API-Key' => RANKMASTER_API_KEY],
        'timeout' => 3,
        'blocking' => false,
    ]);
}

// â”€â”€ Affiliate Click Tracking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

add_action('init', 'rankmaster_handle_click');
function rankmaster_handle_click() {
    if (!isset($_GET['rmid'])) return;
    $tracking_id = sanitize_text_field($_GET['rmid']);
    $destination = get_transient('rm_link_' . $tracking_id);
    if (!$destination) {
        $response = wp_remote_post(RANKMASTER_API_URL . '/click-tracker', [
            'body'    => wp_json_encode(['action' => 'record_click', 'tracking_id' => $tracking_id, 'referrer' => isset($_SERVER['HTTP_REFERER']) ? $_SERVER['HTTP_REFERER'] : '']),
            'headers' => ['Content-Type' => 'application/json', 'X-API-Key' => RANKMASTER_API_KEY],
            'timeout' => 5,
        ]);
        if (!is_wp_error($response)) {
            $body = json_decode(wp_remote_retrieve_body($response), true);
            $destination = $body['destination'] ?? home_url();
            set_transient('rm_link_' . $tracking_id, $destination, 3600);
        }
    }
    wp_redirect($destination, 301);
    exit;
}

// â”€â”€ Publish Notification â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

add_action('publish_post', 'rankmaster_notify_publish', 10, 2);
function rankmaster_notify_publish($post_id, $post) {
    if (wp_is_post_revision($post_id) || wp_is_post_autosave($post_id)) return;
    wp_remote_post(RANKMASTER_API_URL . '/notifications', [
        'body'    => wp_json_encode(['action' => 'create', 'type' => 'system', 'title' => 'Post Published', 'message' => '"' . $post->post_title . '" published on WordPress', 'link' => '/content-records', 'priority' => 'low']),
        'headers' => ['Content-Type' => 'application/json', 'X-API-Key' => RANKMASTER_API_KEY],
        'timeout' => 3,
        'blocking' => false,
    ]);
}

// â”€â”€ Outbound Link Click Tracking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

add_filter('the_content', 'rankmaster_track_outbound_links');
function rankmaster_track_outbound_links($content) {
    return preg_replace_callback(
        '/<a\\s+(?:[^>]*?\\s+)?href=["\'](?!' . preg_quote(home_url(), '/') . ')([^"\']+)["\']([^>]*)>/i',
        function($matches) {
            $href = $matches[1];
            $rest = $matches[2];
            if (strpos($href, 'amazon.') !== false || strpos($href, 'amzn.') !== false) {
                return '<a href="' . esc_url($href) . '" onclick="fetch(\'' . RANKMASTER_API_URL . '/click-tracker\',{method:\'POST\',headers:{\'Content-Type\':\'application/json\'},body:JSON.stringify({action:\'record_click\',tracking_id:\'' . md5($href) . '\',referrer:window.location.href})})" target="_blank" rel="nofollow sponsored"' . $rest . '>';
            }
            return $matches[0];
        },
        $content
    );
}

// â”€â”€ Shortcode: Affiliate Button â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

add_shortcode('rm_button', 'rankmaster_affiliate_button');
function rankmaster_affiliate_button($atts) {
    $a = shortcode_atts(['url' => '#', 'text' => 'Check Price', 'id' => '', 'color' => '#2563eb'], $atts);
    $tracking_url = $a['id'] ? home_url('/?rmid=' . $a['id']) : $a['url'];
    return sprintf('<a href="%s" class="rm-btn" style="display:inline-block;background:%s;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:700" target="_blank" rel="nofollow sponsored">%s</a>',
        esc_url($tracking_url), esc_attr($a['color']), esc_html($a['text'])
    );
}
`;
}

export async function GET(req: NextRequest) {
    const auth = await getAuthUser(req);
    if (auth.error) return auth.error;
    const { supabase, user } = auth;
    const url = new URL(req.url);
    const siteId = url.searchParams.get('site_id');

    let site = null;
    if (siteId) {
        const { data } = await supabase.from('sites').select('id, name, url').eq('id', siteId).eq('user_id', user.id).single();
        site = data;
    }

    const siteUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://yourapp.com';
    const apiKey = Buffer.from(`${user.id}:${Date.now()}`).toString('base64').substring(0, 32);

    const plugin = generatePlugin(siteUrl, apiKey, user.id);

    return NextResponse.json({ plugin, site, api_key: apiKey, site_url: siteUrl });
}
