import type { APIRoute } from 'astro';

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

    // Telegram bot config from env
    const botToken = import.meta.env.TELEGRAM_BOT_TOKEN;
    const chatId = import.meta.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      // No Telegram configured — just log and return success for dev
      console.log('--- Contact Form Submission ---');
      console.log('Name:', body.name);
      console.log('Phone:', body.phone);
      console.log('Message:', body.message || '(empty)');
      console.log('Lang:', body.lang || 'uk');
      console.log('------------------------------');
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
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
      console.error('Telegram API error:', await tgRes.text());
      return new Response(JSON.stringify({ error: 'Помилка надсилання' }), { status: 500, headers });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (err) {
    console.error('Contact form error:', err);
    return new Response(JSON.stringify({ error: 'Внутрішня помилка сервера' }), { status: 500, headers });
  }
};

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}
