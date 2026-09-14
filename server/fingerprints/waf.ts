export function detectWaf(headers: Record<string, string | string[] | undefined>) {
  const serverHdr = (headers.server || '').toString().toLowerCase();
  if (serverHdr.includes('cloudflare') || headers['cf-ray']) return 'Cloudflare';
  if (headers['x-sucuri-id']) return 'Sucuri';
  if (headers['x-iinfo']) return 'Imperva';
  if (headers['x-fastly-request-id']) return 'Fastly';
  if (headers['x-azure-ref']) return 'Azure';
  if (headers['x-akamai-transformed']) return 'Akamai';
  return null;
}
