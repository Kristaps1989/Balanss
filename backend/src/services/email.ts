import type { FastifyBaseLogger } from 'fastify';

import type { Config } from '../config';

export interface MagicLinkEmail {
  to: string;
  appLink: string;
  webLink: string;
}

export interface EmailSender {
  readonly kind: 'console' | 'resend' | 'fake';
  sendMagicLink(mail: MagicLinkEmail, log: FastifyBaseLogger): Promise<void>;
}

export function magicLinkCopy(mail: MagicLinkEmail) {
  const subject = 'Tava pieslēgšanās saite — Balanss';
  const text = [
    'Sveiki!',
    '',
    'Lai pieslēgtos Balanss, atver šo saiti telefonā, kurā ir lietotne:',
    mail.webLink,
    '',
    'Saite ir derīga 15 minūtes un izmantojama vienu reizi.',
    'Ja tu nepieprasīji pieslēgšanos, vienkārši ignorē šo e-pastu.',
    '',
    'Balanss',
  ].join('\n');
  // Inline light styles for every client; mail apps that honour prefers-color-scheme get the dark palette.
  const html = `<!doctype html><html lang="lv"><head><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<style>@media (prefers-color-scheme:dark){body.b{background:#121513!important;color:#F2F1EC!important}.c{background:#1C201D!important}.t2{color:#B8BCB6!important}.l{color:#7FD3A2!important}.btn{background:#6CCB94!important;color:#0E1A13!important}}</style></head>
<body class="b" style="font-family:Manrope,Arial,sans-serif;background:#F6F2EA;color:#1F2420;padding:24px">
<div class="c" style="max-width:480px;margin:0 auto;background:#FFFFFF;border-radius:24px;padding:28px">
<h1 style="font-family:Fraunces,Georgia,serif;font-size:24px;margin:0 0 12px">Pieslēgšanās Balanss</h1>
<p style="font-size:16px;line-height:1.5;margin:0 0 20px">Atver šo saiti telefonā, lai pieslēgtos.</p>
<p style="margin:0 0 20px"><a class="btn" href="${mail.webLink}" style="display:inline-block;background:#2F6B4F;color:#FFFFFF;text-decoration:none;font-weight:600;padding:14px 24px;border-radius:28px">Pieslēgties</a></p>
<p class="t2" style="font-size:14px;line-height:1.5;color:#525852;margin:0 0 8px">Ja poga nestrādā, atver šo saiti: <a class="l" href="${mail.webLink}" style="color:#2A6148">${mail.webLink}</a></p>
<p class="t2" style="font-size:14px;line-height:1.5;color:#636963;margin:0">Saite ir derīga 15 minūtes un izmantojama vienu reizi. Ja tu nepieprasīji pieslēgšanos, vienkārši ignorē šo e-pastu.</p>
</div></body></html>`;
  return { subject, text, html };
}

/** Dev/test: prints the link to stdout (never to the structured log). */
export const consoleEmailSender: EmailSender = {
  kind: 'console',
  async sendMagicLink(mail) {
    console.log(`[magic-link] ${mail.appLink}  (web: ${mail.webLink})`);
  },
};

export function resendEmailSender(config: Config, fetchImpl: typeof fetch = fetch): EmailSender {
  return {
    kind: 'resend',
    async sendMagicLink(mail, log) {
      const { subject, text, html } = magicLinkCopy(mail);
      const res = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: config.emailFrom, to: [mail.to], subject, text, html }),
      });
      if (!res.ok) {
        log.error({ status: res.status }, 'resend: failed to send magic link');
        throw new Error(`resend responded ${res.status}`);
      }
    },
  };
}

export function createEmailSender(config: Config): EmailSender {
  return config.emailProvider === 'resend' ? resendEmailSender(config) : consoleEmailSender;
}
