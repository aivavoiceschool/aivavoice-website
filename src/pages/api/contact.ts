import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const body = await request.json();
    console.log('[CONTACT] Received:', JSON.stringify({ name: body.name, phone: body.phone, lang: body.lang }));

    if (!body.name?.trim()) {
      return new Response(JSON.stringify({ error: "Ім'я обов'язкове" }), { status: 400, headers });
    }
    if (!body.phone?.trim()) {
      return new Response(JSON.stringify({ error: "Телефон обов'язковий" }), { status: 400, headers });
    }

    // Get env from Cloudflare (static import)
    const cfEnv = env as Record<string, string>;
    const botToken = cfEnv.TELEGRAM_BOT_TOKEN;
    const chatId = cfEnv.TELEGRAM_CHAT_ID;
    const turnstileSecret = cfEnv.TURNSTILE_SECRET_KEY;

    console.log('[CONTACT] env type:', typeof env);
    console.log('[CONTACT] env keys:', Object.keys(cfEnv));
    console.log('[CONTACT] botToken exists:', !!botToken, '| chatId exists:', !!chatId);

    if (!botToken || !chatId) {
      console.error('[CONTACT] ERROR: Telegram credentials not found in env!');
      return new Response(JSON.stringify({ error: 'Server config error', debug: 'no-credentials', envKeys: Object.keys(cfEnv) }), { status: 500, headers });
    }

    // Validate Turnstile if configured
    if (turnstileSecret) {
      const turnstileRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret: turnstileSecret,
          response: body.turnstileToken || '',
          remoteip: request.headers.get('CF-Connecting-IP') || '',
        }),
      });
      const turnstileData = await turnstileRes.json() as { success: boolean };
      if (!turnstileData.success) {
        return new Response(JSON.stringify({ error: 'Перевірка captcha не пройдена' }), { status: 403, headers });
      }
    }

    // Build Telegram message
    const langPrefix = body.lang === 'en' ? '[EN] ' : '[UA] ';
    const lines = [
      `📩 *${langPrefix}Нова заявка з сайту AivaVoice*`,
      '',
      `👤 *Ім'я:* ${escapeMarkdown(body.name.trim())}`,
      `📞 *Телефон:* ${escapeMarkdown(body.phone.trim())}`,
    ];

    if (body.message?.trim()) {
      lines.push(`💬 *Повідомлення:* ${escapeMarkdown(body.message.trim())}`);
    }
    if (body.lang) {
      lines.push(`🌐 *Мова сайту:* ${body.lang === 'en' ? 'English' : 'Українська'}`);
    }

    console.log('[CONTACT] Sending to Telegram...');

    const tgRes = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: lines.join('\n'),
          parse_mode: 'Markdown',
        }),
      }
    );

    const tgResponseText = await tgRes.text();
    console.log('[CONTACT] Telegram status:', tgRes.status, '| body:', tgResponseText);

    if (!tgRes.ok) {
      return new Response(JSON.stringify({ error: 'Помилка надсилання' }), { status: 500, headers });
    }

    console.log('[CONTACT] SUCCESS');
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (err) {
    console.error('[CONTACT] FATAL:', err);
    return new Response(JSON.stringify({ error: 'Внутрішня помилка сервера', debug: String(err) }), { status: 500, headers });
  }
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}
