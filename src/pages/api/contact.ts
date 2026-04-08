import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const body = await request.json();
    console.log('[CONTACT] Received request:', JSON.stringify({ name: body.name, phone: body.phone, lang: body.lang }));

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
    let envSource = 'none';

    try {
      const { env } = await import('cloudflare:workers');
      console.log('[CONTACT] cloudflare:workers imported OK');
      console.log('[CONTACT] env keys:', Object.keys(env || {}));
      botToken = (env as any).TELEGRAM_BOT_TOKEN;
      chatId = (env as any).TELEGRAM_CHAT_ID;
      turnstileSecret = (env as any).TURNSTILE_SECRET_KEY;
      envSource = 'cloudflare:workers';
    } catch (e) {
      console.log('[CONTACT] cloudflare:workers import failed:', e);
      // Fallback for local dev
      botToken = import.meta.env.TELEGRAM_BOT_TOKEN;
      chatId = import.meta.env.TELEGRAM_CHAT_ID;
      turnstileSecret = import.meta.env.TURNSTILE_SECRET_KEY;
      envSource = 'import.meta.env';
    }

    console.log('[CONTACT] envSource:', envSource);
    console.log('[CONTACT] botToken exists:', !!botToken, '| chatId exists:', !!chatId);
    console.log('[CONTACT] botToken preview:', botToken ? botToken.substring(0, 8) + '...' : 'EMPTY');
    console.log('[CONTACT] chatId:', chatId || 'EMPTY');

    if (!botToken || !chatId) {
      console.error('[CONTACT] ERROR: Telegram credentials not found!');
      return new Response(JSON.stringify({ ok: true, debug: 'no-telegram-credentials' }), { status: 200, headers });
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

    const tgUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const tgBody = {
      chat_id: chatId,
      text: lines.join('\n'),
      parse_mode: 'Markdown',
    };

    console.log('[CONTACT] Sending to Telegram...', JSON.stringify({ chat_id: chatId, textLength: tgBody.text.length }));

    const tgRes = await fetch(tgUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tgBody),
    });

    const tgResponseText = await tgRes.text();
    console.log('[CONTACT] Telegram response status:', tgRes.status);
    console.log('[CONTACT] Telegram response body:', tgResponseText);

    if (!tgRes.ok) {
      return new Response(JSON.stringify({ error: 'Помилка надсилання', debug: tgResponseText }), { status: 500, headers });
    }

    console.log('[CONTACT] SUCCESS — message sent to Telegram');
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (err) {
    console.error('[CONTACT] FATAL error:', err);
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
