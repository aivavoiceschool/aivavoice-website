interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  TURNSTILE_SECRET_KEY: string;
}

interface ContactBody {
  name: string;
  phone: string;
  message?: string;
  turnstileToken?: string;
  lang?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // CORS headers
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const body: ContactBody = await request.json();

    // Validate required fields
    if (!body.name || !body.name.trim()) {
      return new Response(JSON.stringify({ error: "Ім'я обов'язкове" }), { status: 400, headers });
    }
    if (!body.phone || !body.phone.trim()) {
      return new Response(JSON.stringify({ error: "Телефон обов'язковий" }), { status: 400, headers });
    }

    // Validate Turnstile
    if (env.TURNSTILE_SECRET_KEY) {
      const turnstileRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret: env.TURNSTILE_SECRET_KEY,
          response: body.turnstileToken || '',
          remoteip: request.headers.get('CF-Connecting-IP') || '',
        }),
      });

      const turnstileData = await turnstileRes.json() as { success: boolean };
      if (!turnstileData.success) {
        return new Response(JSON.stringify({ error: 'Перевірка captcha не пройдена' }), { status: 403, headers });
      }
    }

    // Determine language prefix for Telegram message
    const langPrefix = body.lang === 'en' ? '[EN] ' : '[UA] ';

    // Build Telegram message
    const lines = [
      `📩 *${langPrefix}Нова заявка з сайту AivaVoice*`,
      '',
      `👤 *Ім'я:* ${escapeMarkdown(body.name.trim())}`,
      `📞 *Телефон:* ${escapeMarkdown(body.phone.trim())}`,
    ];

    if (body.message && body.message.trim()) {
      lines.push(`💬 *Повідомлення:* ${escapeMarkdown(body.message.trim())}`);
    }

    if (body.lang) {
      lines.push(`🌐 *Мова сайту:* ${body.lang === 'en' ? 'English' : 'Українська'}`);
    }

    const text = lines.join('\n');

    // Send to Telegram
    const tgRes = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text,
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

// Handle CORS preflight
export const onRequestOptions: PagesFunction = async () => {
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
