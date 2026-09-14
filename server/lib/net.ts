import net from 'node:net';
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

export const checkHttp = (protocol: string, host: string, port: number, ip: string): Promise<{ status: number | string; isCloudflare: boolean; protocolUsed: string }> => {
  return httpPool.run(() => new Promise((resolve, reject) => {
    const lib = protocol === 'https:' ? https : http;
    const requestObj = lib.request({
      hostname: ip, port, servername: protocol === 'https:' ? host : undefined,
      method: 'HEAD', timeout: 3500, rejectUnauthorized: false,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        Accept: '*/*', Host: host
      }
    }, (response) => {
      const serverHeader = (response.headers.server || '').toString().toLowerCase();
      resolve({ status: response.statusCode || 'Bilinmiyor', isCloudflare: serverHeader.includes('cloudflare'), protocolUsed: protocol });
    });
    requestObj.on('error', reject);
    requestObj.on('timeout', () => {
      requestObj.destroy();
      reject(new Error('timeout'));
    });
    requestObj.end();
  }));
};
