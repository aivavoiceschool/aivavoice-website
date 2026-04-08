/// <reference types="astro/client" />

declare module 'cloudflare:workers' {
  const env: {
    TELEGRAM_BOT_TOKEN?: string;
    TELEGRAM_CHAT_ID?: string;
    TURNSTILE_SECRET_KEY?: string;
    [key: string]: unknown;
  };
  export { env };
}
