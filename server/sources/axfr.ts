import dns from 'node:dns';
import net from 'node:net';

// AXFR Node'un DNS API'sinde yer almaz. Bu yardımcı, yalnız ?axfr=1 ile çağrılacak
// TCP DNS sorgusunu üretir; normal kaynak taramasına kasten dahil edilmez.
const AXFR_TYPE = 252;
const TIMEOUT_MS = 5000;

function encodeName(name: string): Buffer {
  const labels = name.split('.').map((part) => Buffer.concat([Buffer.from([part.length]), Buffer.from(part)]));
  return Buffer.concat([...labels, Buffer.from([0])]);
}

function query(domain: string): Buffer {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(Math.floor(Math.random() * 0xffff), 0);
  header.writeUInt16BE(0x0100, 2);
  header.writeUInt16BE(1, 4);
  const question = Buffer.concat([encodeName(domain), Buffer.from([0, AXFR_TYPE, 0, 1])]);
  const message = Buffer.concat([header, question]);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(message.length, 0);
  return Buffer.concat([length, message]);
}

function namesInPacket(packet: Buffer, domain: string): string[] {
  // AXFR yanıtlarının tamamını çözümlemek yerine DNS label dizilerindeki, zone altında
  // bulunan adları ayıklarız. DNS name compression işaretçileri güvenle atlanır.
  const found = new Set<string>();
  for (let start = 12; start < packet.length; start += 1) {
    const labels: string[] = [];
    let cursor = start;
    while (cursor < packet.length) {
      const length = packet[cursor];
      if (length === 0) {
        if (labels.length) {
          const name = labels.join('.').toLowerCase();
          if (name === domain || name.endsWith(`.${domain}`)) found.add(name);
        }
        break;
      }
      if (length > 63 || cursor + length >= packet.length) break;
      const label = packet.subarray(cursor + 1, cursor + 1 + length).toString('ascii');
      if (!/^[a-zA-Z0-9_-]+$/.test(label)) break;
      labels.push(label);
      cursor += length + 1;
    }
  }
  return [...found];
}

function transfer(ns: string, domain: string): Promise<string[]> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: ns, port: 53 });
    const packets: Buffer[] = [];
    let received = Buffer.alloc(0);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      socket.destroy();
      resolve([...new Set(packets.flatMap((packet) => namesInPacket(packet, domain)))]);
    };
    socket.setTimeout(TIMEOUT_MS, finish);
    socket.once('error', finish);
    socket.once('connect', () => socket.write(query(domain)));
    socket.on('data', (chunk: Buffer) => {
      received = Buffer.concat([received, chunk]);
      while (received.length >= 2) {
        const length = received.readUInt16BE(0);
        if (received.length < length + 2) break;
        packets.push(received.subarray(2, length + 2));
        received = received.subarray(length + 2);
      }
    });
    socket.once('end', finish);
  });
}

export async function fetchAxfr(domain: string): Promise<string[]> {
  try {
    const nameservers = (await dns.promises.resolveNs(domain)).slice(0, 4);
    const results = await Promise.all(nameservers.map((ns) => transfer(ns, domain)));
    return [...new Set(results.flat())];
  } catch {
    return [];
  }
}
