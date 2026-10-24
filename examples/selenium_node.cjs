'use strict';

/*
 * ecdys WebDriver transport example.
 * Requires a supported selenium-webdriver release and a running gateway.
 * It visits ECDYS_TARGET_URL (https://example.com by default).
 * Authorization authenticates control requests; it never enters page headers.
 */

const fs = require('node:fs/promises');
const {performance} = require('node:perf_hooks');
const {setTimeout: wait} = require('node:timers/promises');
const {By, WebDriver} = require('selenium-webdriver');
const {Executor, HttpClient} = require('selenium-webdriver/http');

class BearerClient extends HttpClient {
  #token;
  #pending = Promise.resolve();
  #nextAllowedAt = 0;

  constructor(endpoint, token) {
    super(endpoint);
    this.#token = token;
  }

  send(request) {
    const result = this.#pending.then(async () => {
      const delay = this.#nextAllowedAt - performance.now();
      if (delay > 0) await wait(delay);
      request.headers.set('Authorization', 'Bearer ' + this.#token);
      try {
        return await super.send(request);
      } finally {
        this.#nextAllowedAt = performance.now() + 250;
      }
    });
    this.#pending = result.then(() => undefined, () => undefined);
    return result;
  }
}

async function main() {
  const endpoint = process.env.ECDYS_WEBDRIVER_URL || 'http://127.0.0.1:9300';
  const parsed = new URL(endpoint);
  if (
    parsed.protocol !== 'http:' ||
    !['127.0.0.1', '[::1]'].includes(parsed.hostname) ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.port === '' ||
    parsed.port === '0' ||
    parsed.pathname !== '/' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    throw new Error('Use the numeric-loopback gateway URL from ecdys.');
  }

  const token = process.env.ECDYS_WEBDRIVER_TOKEN || '';
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(token)) {
    throw new Error('Provide the session token in ECDYS_WEBDRIVER_TOKEN.');
  }

  const executor = new Executor(new BearerClient(endpoint, token));
  const driver = WebDriver.createSession(executor, {browserName: 'chrome'});
  try {
    await driver.get(process.env.ECDYS_TARGET_URL || 'https://example.com');
    console.log('Title:', await driver.getTitle());
    console.log('Heading:', await driver.findElement(By.css('h1')).getText());
    const image = await driver.takeScreenshot();
    await fs.writeFile(
      process.env.ECDYS_SCREENSHOT_PATH || 'ecdys-example.png',
      Buffer.from(image, 'base64'),
    );
  } finally {
    // The gateway delegates this to the authorized Save & Close lifecycle.
    await driver.quit();
  }
}

main().catch(() => {
  // Avoid printing serialized transport errors that might include headers.
  console.error('Automation failed. Check gateway status, token, and session diagnostics.');
  process.exitCode = 1;
});
