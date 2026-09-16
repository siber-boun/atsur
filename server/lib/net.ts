import net from 'node:net';
import dgram from 'node:dgram';
import { socketPool } from './pool';
import { collectRenderEvidence } from './evidence';

export const checkPort = (port: number, ip: string): Promise<boolean> => socketPool.run(() => new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1500);

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => resolve(false));
    socket.connect(port, ip);
  }));

// SQL Server Browser, tek baytlık CLNT_UCAST_INST isteğine UDP yanıtı verir.
// UDP'de yanıtsızlık "kapalı" kanıtı değildir; yalnızca yanıt alınan servisler gösterilir.
export const checkSqlBrowser = (ip: string): Promise<boolean> => socketPool.run(() => new Promise((resolve) => {
  const socket = dgram.createSocket('udp4');
  let settled = false;
  const finish = (open: boolean) => {
    if (settled) return;
    settled = true;
    socket.close();
    resolve(open);
  };

  socket.once('message', () => finish(true));
  socket.once('error', () => finish(false));
  socket.send(Buffer.from([0x02]), 1434, ip, (error) => {
    if (error) finish(false);
  });
  setTimeout(() => finish(false), 1500);
}));

export const checkHttp = async (protocol: string, host: string, port: number, ip: string): Promise<{ status: number | string; isCloudflare: boolean; protocolUsed: string; evidenceSource: 'render-live' }> => {
  const evidence = await collectRenderEvidence(protocol as 'http:' | 'https:', host, port, ip);
  if (!evidence.ok) throw Object.assign(new Error(evidence.error || 'http-failed'), { code: evidence.error || 'HTTP_FAILED' });
  return {
    status: evidence.status || 'Bilinmiyor',
    isCloudflare: evidence.waf?.name === 'Cloudflare' || /cloudflare/i.test(evidence.server || ''),
    protocolUsed: protocol,
    evidenceSource: 'render-live'
  };
};
