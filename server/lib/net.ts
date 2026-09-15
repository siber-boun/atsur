import net from 'node:net';
import dgram from 'node:dgram';
import https from 'node:https';
import http from 'node:http';
import { httpPool, socketPool } from './pool';

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

export const checkHttp = (protocol: string, host: string, port: number, ip: string): Promise<{ status: number | string; isCloudflare: boolean; protocolUsed: string }> => {
  return httpPool.run(() => new Promise((resolve, reject) => {
    const lib = protocol === 'https:' ? https : http;
    const requestObj = lib.request({
      hostname: ip, port, servername: protocol === 'https:' ? host : undefined,
      // Bazı uygulamalar HEAD'i 404/405 ile reddedip GET / isteğine 200 döndürür.
      // Gövde indirilmez: Range sınırı istenir ve header alındıktan sonra akış kapatılır.
      method: 'GET', timeout: 8000, rejectUnauthorized: false,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8', Range: 'bytes=0-4095', Host: host
      }
    }, (response) => {
      const serverHeader = (response.headers.server || '').toString().toLowerCase();
      resolve({ status: response.statusCode || 'Bilinmiyor', isCloudflare: serverHeader.includes('cloudflare'), protocolUsed: protocol });
      response.destroy();
    });
    requestObj.on('error', reject);
    requestObj.on('timeout', () => {
      requestObj.destroy();
      reject(new Error('timeout'));
    });
    requestObj.end();
  }));
};
