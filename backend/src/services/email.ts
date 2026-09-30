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
  const html = `<!doctype html><html lang="lv"><body style="font-family:Figtree,Arial,sans-serif;background:#F7F3EE;color:#26231F;padding:24px">
<div style="max-width:480px;margin:0 auto;background:#FFFFFF;border:1px solid #EFE8DE;border-radius:24px;padding:28px">
<h1 style="font-size:22px;margin:0 0 12px">Pieslēgšanās Balanss</h1>
<p style="font-size:16px;line-height:1.5;margin:0 0 20px">Atver šo saiti telefonā, lai pieslēgtos.</p>
<p style="margin:0 0 20px"><a href="${mail.webLink}" style="display:inline-block;background:#B9532A;color:#FFFFFF;text-decoration:none;font-weight:600;padding:14px 24px;border-radius:28px">Pieslēgties</a></p>
<p style="font-size:14px;line-height:1.5;color:#5E5850;margin:0 0 8px">Ja poga nestrādā, atver šo saiti: <a href="${mail.webLink}" style="color:#A9502A">${mail.webLink}</a></p>
<p style="font-size:14px;line-height:1.5;color:#6F685E;margin:0">Saite ir derīga 15 minūtes un izmantojama vienu reizi. Ja tu nepieprasīji pieslēgšanos, vienkārši ignorē šo e-pastu.</p>
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
