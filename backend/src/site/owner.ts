/**
 * Who publishes ZestWell (the GDPR data controller). Shown on the privacy policy, terms and footer.
 * The company is being registered: once the Enterprise Register (Uzņēmumu reģistrs) entry exists,
 * fill in the legal form in `company` (e.g. 'SIA "Zestwell"'), `regNo` and `address`. Until then the
 * pages say "reģistrācija procesā" and leave the number and address out.
 */
export const OWNER: { company: string; regNo: string | null; address: string | null; email: string } = {
  company: 'Zestwell',
  regNo: null,
  address: null,
  /** Real inbox for support and privacy requests (Cloudflare Email Routing → own mailbox). */
  email: 'support@zestwell.app',
};

/** "Zestwell, reģ. nr. …, address" or "Zestwell (reģistrācija procesā)". */
export function ownerLine(): string {
  if (!OWNER.regNo) return `${OWNER.company} (reģistrācija procesā)`;
  return [OWNER.company, `reģ. nr. ${OWNER.regNo}`, OWNER.address].filter(Boolean).join(', ');
}

/** Date the current privacy policy and terms take effect (shown on both pages). */
export const POLICY_DATE = '2026. gada 11. novembris';
