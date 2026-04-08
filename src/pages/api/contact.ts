import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const body = await request.json();

    if (!body.name?.trim()) {
      return new Response(JSON.stringify({ error: "Ім'я обов'язкове" }), { status: 400, headers });
    }
    if (!body.phone?.trim()) {
      return new Response(JSON.stringify({ error: "Телефон обов'язковий" }), { status: 400, headers });
    }

    // Get env from Cloudflare Workers (Astro v6+)
    let botToken: string | undefined;
    let chatId: string | undefined;
    let turnstileSecret: string | undefined;

    try {
      const { env } = await import('cloudflare:workers');
      botToken = (env as any).TELEGRAM_BOT_TOKEN;
      chatId = (env as any).TELEGRAM_CHAT_ID;
      turnstileSecret = (env as any).TURNSTILE_SECRET_KEY;
    } catch {
      // Fallback for local dev
      botToken = import.meta.env.TELEGRAM_BOT_TOKEN;
      chatId = import.meta.env.TELEGRAM_CHAT_ID;
      turnstileSecret = import.meta.env.TURNSTILE_SECRET_KEY;
    }

    if (!botToken || !chatId) {
      console.log('--- Contact Form (no Telegram configured) ---');
      console.log('Name:', body.name, '| Phone:', body.phone);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
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

    if (!tgRes.ok) {
      const tgError = await tgRes.text();
      console.error('Telegram API error:', tgError);
      return new Response(JSON.stringify({ error: 'Помилка надсилання' }), { status: 500, headers });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (err) {
    console.error('Contact form error:', err);
    return new Response(JSON.stringify({ error: 'Внутрішня помилка сервера' }), { status: 500, headers });
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
