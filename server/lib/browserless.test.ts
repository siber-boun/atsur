import test from 'node:test';
import assert from 'node:assert/strict';
import { allowBrowserlessNavigation } from './browserless';

const targetPorts = [
  { protocol: 'https:', port: 443 },
  { protocol: 'https:', port: 8443 },
  { protocol: 'http:', port: 8080 }
];

test('Browserless allows only top-level navigation to the validated hostname and web ports', () => {
  assert.equal(allowBrowserlessNavigation('https://app.example.com/', 'app.example.com', targetPorts, true), true);
  assert.equal(allowBrowserlessNavigation('https://app.example.com:8443/next', 'app.example.com', targetPorts, true), true);
  assert.equal(allowBrowserlessNavigation('http://app.example.com:8080/', 'app.example.com', targetPorts, true), true);
  assert.equal(allowBrowserlessNavigation('http://app.example.com:8080/', 'app.example.com', targetPorts, false), false);
});

test('Browserless blocks cross-host, credential, and unapproved port navigations', () => {
  assert.equal(allowBrowserlessNavigation('https://127.0.0.1/', 'app.example.com', targetPorts, true), false);
  assert.equal(allowBrowserlessNavigation('https://attacker.example/app', 'app.example.com', targetPorts, true), false);
  assert.equal(allowBrowserlessNavigation('https://user@app.example.com/', 'app.example.com', targetPorts, true), false);
  assert.equal(allowBrowserlessNavigation('https://app.example.com:9000/', 'app.example.com', targetPorts, true), false);
});
