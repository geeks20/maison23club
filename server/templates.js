// Branded MAISON 23 emails. Table layout + inline styles for email-client compatibility.

const C = { ink: '#171016', night: '#0f0a0e', ivory: '#F2E8D8', gold: '#BE9A68', burgundy: '#64283D' };
const SERIF = "'Bodoni Moda', Didot, 'Bodoni 72', 'Times New Roman', Georgia, serif";
const SANS = "'Instrument Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif";

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const INVITE_SUBJECT = 'You’re Invited — MAISON 23 | Dubai · 23 October';

function layout({ preheader, bodyHtml, ctaUrl, ctaLabel }) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light">
<title>MAISON 23</title>
<link href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400;1,6..96,400&family=Instrument+Sans:wght@400;600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${C.night};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.night};">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.night};">
<tr><td align="center" style="padding:32px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${C.ink};border:1px solid rgba(190,154,104,.35);">
    <tr><td style="padding:28px 32px 0;font-family:${SANS};font-size:10px;letter-spacing:4px;color:${C.gold};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-family:${SANS};font-size:10px;letter-spacing:4px;color:${C.gold};">N° 23</td>
        <td align="right" style="font-family:${SANS};font-size:10px;letter-spacing:4px;color:${C.gold};">PRIVATE SOCIETY</td>
      </tr></table>
    </td></tr>
    <tr><td align="center" style="padding:36px 32px 8px;font-family:${SERIF};font-size:46px;line-height:1;color:${C.ivory};letter-spacing:1px;">
      MAISON <em style="color:${C.gold};">23</em>
    </td></tr>
    <tr><td align="center" style="padding:0 32px 28px;font-family:${SANS};font-size:11px;letter-spacing:4px;color:${C.ivory};opacity:.8;">
      DUBAI — FRIDAY 23 OCTOBER 2026
    </td></tr>
    <tr><td style="padding:0 32px;"><div style="height:1px;background:rgba(190,154,104,.35);line-height:1px;">&nbsp;</div></td></tr>
    <tr><td style="padding:28px 36px 8px;font-family:${SERIF};font-size:19px;line-height:1.55;color:${C.ivory};">
      ${bodyHtml}
    </td></tr>
    ${ctaUrl ? `<tr><td align="center" style="padding:20px 32px 36px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td align="center" bgcolor="${C.ivory}" style="background:${C.ivory};">
          <a href="${esc(ctaUrl)}" style="display:inline-block;padding:17px 30px;font-family:${SANS};font-size:12px;font-weight:600;letter-spacing:4px;color:${C.ink};text-decoration:none;">${esc(ctaLabel)}</a>
        </td>
      </tr></table>
      <p style="margin:16px 0 0;font-family:${SANS};font-size:11px;line-height:1.6;color:rgba(242,232,216,.6);">Or open: <a href="${esc(ctaUrl)}" style="color:${C.gold};word-break:break-all;">${esc(ctaUrl)}</a></p>
    </td></tr>` : ''}
    <tr><td align="center" style="padding:0 32px 30px;font-family:${SERIF};font-style:italic;font-size:22px;color:${C.gold};">La nuit est à nous.</td></tr>
    <tr><td style="padding:18px 32px 26px;border-top:1px solid rgba(190,154,104,.25);font-family:${SANS};font-size:10px;line-height:1.7;letter-spacing:2px;color:rgba(242,232,216,.55);" align="center">
      PARIS · KINSHASA · PORT-AU-PRINCE · DUBAI<br>
      <a href="https://maison23.club" style="color:rgba(242,232,216,.55);text-decoration:none;">MAISON23.CLUB</a> &nbsp;·&nbsp;
      <a href="https://instagram.com/lamaison.society" style="color:rgba(242,232,216,.55);text-decoration:none;">@LAMAISON.SOCIETY</a><br>
      This invitation is personal — please don’t forward your link.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

const paras = lines => lines.map(l => l === '' ? '' : `<p style="margin:0 0 16px;">${l}</p>`).join('');

export function invitationEmail({ firstName, url }) {
  const hey = firstName ? `Hey ${firstName},` : 'Hey,';
  const lines = [
    hey,
    'I’m doing something a little different for my birthday this year.',
    'A night built around the music I love, the people I love, and a few cultures that inspire me.',
    'Paris. Kinshasa. Port-au-Prince. Dubai.',
    'I’d love for you to be part of it.',
    'Welcome to MAISON 23.'
  ];
  return {
    subject: INVITE_SUBJECT,
    html: layout({
      preheader: 'A private night in Dubai — Friday 23 October. Your personal invitation is inside.',
      bodyHtml: paras(lines.map(esc)),
      ctaUrl: url, ctaLabel: 'RÉPONDRE — RSVP'
    }),
    text: [...lines, '', 'La nuit est à nous.', '', `RSVP with your personal link: ${url}`, '',
      'MAISON 23 · Dubai · Friday 23 October 2026', 'maison23.club · @lamaison.society',
      'This invitation is personal — please don’t forward your link.'].join('\n')
  };
}

export function reminderEmail({ firstName, url, deadlineText }) {
  const lines = [
    firstName ? `Hey ${firstName},` : 'Hey,',
    'A gentle reminder — I’d love to know if you can make it to MAISON 23.',
    'Friday 23 October, Dubai.',
    deadlineText ? `Kindly reply by ${deadlineText}.` : 'It only takes a moment.'
  ];
  return {
    subject: 'A gentle reminder — MAISON 23 | Dubai · 23 October',
    html: layout({ preheader: 'Your RSVP for MAISON 23 is still open.', bodyHtml: paras(lines.map(esc)), ctaUrl: url, ctaLabel: 'RÉPONDRE — RSVP' }),
    text: [...lines, '', `Your personal link: ${url}`, '', 'La nuit est à nous.'].join('\n')
  };
}

export function updateEmail({ firstName, url, subject, body }) {
  const bodyLines = String(body).split(/\n{2,}/).map(p => esc(p).replace(/\n/g, '<br>'));
  return {
    subject: `${subject} — MAISON 23`,
    html: layout({
      preheader: subject,
      bodyHtml: paras([esc(firstName ? `Hey ${firstName},` : 'Hey,'), ...bodyLines]),
      ctaUrl: url, ctaLabel: 'VOTRE INVITATION'
    }),
    text: [firstName ? `Hey ${firstName},` : 'Hey,', '', body, '', `Your invitation: ${url}`, '', 'La nuit est à nous.'].join('\n')
  };
}

export function whatsappMessage({ firstName, url }) {
  return [
    `Hey ${firstName || 'you'}! 😂`,
    '',
    'I’m doing something different for my birthday this year.',
    '',
    'It’s called MAISON 23 — a private night in Dubai inspired by French, Congolese, and Haitian music.',
    '',
    'Friday, October 23.',
    '',
    'I’d love for you to come!',
    '',
    'Here’s your personal invitation:',
    '',
    url,
    '',
    'La nuit est à nous. 🥀'
  ].join('\n');
}
