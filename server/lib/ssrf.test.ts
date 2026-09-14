import test from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateIp } from './ssrf';

test('isPrivateIp blocks every required IPv4 private, special, and boundary range', () => {
  for (const ip of ['10.0.0.0', '10.255.255.255', '172.16.0.0', '172.31.255.255', '192.168.0.0', '192.168.255.255', '127.0.0.1', '169.254.169.254', '0.0.0.0', '100.64.0.0', '100.127.255.255', '192.0.2.0', '198.51.100.0', '203.0.113.255', '224.0.0.0', '255.255.255.255']) assert.equal(isPrivateIp(ip), true, ip);
  for (const ip of ['9.255.255.255', '11.0.0.0', '172.15.255.255', '172.32.0.0', '100.63.255.255', '100.128.0.0', '192.0.1.255', '192.0.3.0', '198.51.99.255', '198.51.101.0', '203.0.112.255', '203.0.114.0', '223.255.255.255']) assert.equal(isPrivateIp(ip), false, ip);
});

test('isPrivateIp blocks required IPv6 ranges and IPv4-mapped addresses', () => {
  for (const ip of ['::1', 'fc00::', 'fdff::', 'fe80::', 'febf::', '::ffff:127.0.0.1']) assert.equal(isPrivateIp(ip), true, ip);
  for (const ip of ['2001:4860:4860::8888', '::ffff:8.8.8.8']) assert.equal(isPrivateIp(ip), false, ip);
});
