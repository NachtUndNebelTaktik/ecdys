import {test, expect, _electron as electron, type ElectronApplication} from '@playwright/test';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

test('OSINT mindmap and tool shelf remain editable, encrypted and recoverable across reload and lock', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ecdys-research-ui-'));
  let app: ElectronApplication | undefined;
  try {
    app = await electron.launch({
      args: [
        '--ozone-platform=headless',
        '--user-data-dir=' + join(directory, 'electron'),
        resolve('packages/desktop/dist/main.cjs'),
      ],
      env: {...process.env, ECDYS_DATA_DIR: directory},
    });
    const page = await app.firstWindow(),
      errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({width: 1440, height: 1250});
    await page.getByLabel('Passphrase', {exact: true}).fill('research UI integration passphrase');
    await page.getByLabel('Confirm passphrase').fill('research UI integration passphrase');
    await page.getByLabel('Key derivation memory').selectOption('1024');
    await page.getByRole('button', {name: 'Create local vault'}).click();
    const nav = page.getByRole('navigation');
    await expect(page.getByRole('heading', {name: 'Profile workspace'})).toBeVisible({
      timeout: 60000,
    });
    await nav.getByRole('button', {name: /^Browser/}).click();
    await page.getByRole('button', {name: 'Customize appearance', exact: false}).click();
    await page.getByLabel('Interface theme', {exact: true}).selectOption('crimson');
    await page.getByRole('button', {name: 'Hide appearance', exact: false}).click();
    await nav.getByRole('button', {name: /^OSINT/}).click();
    await expect(page.getByRole('heading', {name: 'Research workspace'})).toBeVisible();
    await page.getByRole('button', {name: 'Create first node', exact: false}).click();
    await page.getByLabel('Node title', {exact: true}).fill('Infrastructure review');
    await page.getByLabel('Node title', {exact: true}).press('Tab');
    await page
      .getByLabel('Research notes', {exact: true})
      .fill('Operator notes remain private in this vault.');
    await page.getByLabel('Source URL', {exact: true}).fill('https://example.org/source');
    await page.getByLabel('Source URL', {exact: true}).press('Tab');
    await page.getByRole('button', {name: 'Add node', exact: false}).click();
    await page.getByLabel('Node title', {exact: true}).fill('Public sources');
    await page.getByLabel('Node title', {exact: true}).press('Tab');
    await page.getByLabel('Node type', {exact: true}).selectOption('domain');
    await page
      .getByLabel('Research notes', {exact: true})
      .fill('Check the provenance of each source.');
    await page.getByRole('button', {name: 'Fit mindmap', exact: true}).click();
    await page
      .getByRole('button', {name: 'Select node: Infrastructure review', exact: true})
      .click();
    await page.getByRole('button', {name: 'Add node', exact: false}).click();
    await page.getByLabel('Node title', {exact: true}).fill('Archive evidence');
    await page.getByLabel('Node title', {exact: true}).press('Tab');
    await page.getByLabel('Node type', {exact: true}).selectOption('note');
    await page
      .getByLabel('Research notes', {exact: true})
      .fill('Record timestamps and retain source links.');
    await page.getByLabel('Connect to node', {exact: true}).selectOption({label: 'Public sources'});
    await page.getByLabel('Relationship', {exact: true}).fill('cross-reference');
    await page.getByRole('button', {name: 'Connect nodes', exact: false}).click();
    await expect
      .poll(async () => (await page.evaluate(() => window.ecdys!.researchWorkspace())).edges.length)
      .toBe(3);
    await page.getByLabel('Mindmap name', {exact: true}).fill('Infrastructure research');
    await page.getByLabel('Mindmap name', {exact: true}).press('Tab');
    await page.getByRole('button', {name: 'Fit mindmap', exact: true}).click();
    const oldPosition = await page.evaluate(
      async () =>
        (await window.ecdys!.researchWorkspace()).nodes.find(
          (node) => node.title === 'Archive evidence',
        )!,
    );
    const moving = page.getByRole('button', {name: 'Select node: Archive evidence', exact: true});
    await moving.focus();
    await moving.press('ArrowRight');
    await moving.press('ArrowRight');
    await expect(moving).toBeFocused();
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.ecdys!.researchWorkspace())).nodes.find(
            (node) => node.id === oldPosition.id,
          )?.x,
      )
      .toBe(oldPosition.x + 40);
    const bounds = (await moving.boundingBox())!;
    await page.mouse.move(bounds.x + 45, bounds.y + 30);
    await page.mouse.down();
    await page.mouse.move(bounds.x - 10, bounds.y + 115, {steps: 12});
    await page.mouse.up();
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.ecdys!.researchWorkspace())).nodes.find(
            (node) => node.id === oldPosition.id,
          )?.y,
      )
      .not.toBe(oldPosition.y);
    await page.getByRole('button', {name: 'Delete node', exact: true}).click();
    await page.getByRole('dialog').getByRole('button', {name: 'Remove node', exact: true}).click();
    await expect
      .poll(async () => (await page.evaluate(() => window.ecdys!.researchWorkspace())).nodes.length)
      .toBe(2);
    await page.getByRole('button', {name: 'Undo', exact: false}).click();
    await expect
      .poll(async () => (await page.evaluate(() => window.ecdys!.researchWorkspace())).nodes.length)
      .toBe(3);
    await page.getByRole('button', {name: 'Fit mindmap', exact: true}).click();
    await page
      .getByRole('button', {name: 'Select node: Infrastructure review', exact: true})
      .click();
    await expect(page.getByLabel('Research save status')).toHaveText('Saved to encrypted vault');
    await page.getByRole('heading', {name: 'Research workspace'}).scrollIntoViewIfNeeded();
    await page.screenshot({path: 'artifacts/osint-mindmap.png'});

    await page.getByRole('tab', {name: 'OSINT tools', exact: false}).click();
    await page.getByLabel('Search OSINT tools').fill('crt');
    await expect(page.locator('.research-tool')).toHaveCount(1);
    await expect(page.getByRole('heading', {name: 'crt.sh'})).toBeVisible();
    await page.getByLabel('Search OSINT tools').fill('');
    await page.getByRole('button', {name: 'Archives', exact: true}).click();
    await expect(page.locator('.research-tool')).toHaveCount(1);
    await expect(page.getByRole('heading', {name: 'Wayback Machine'})).toBeVisible();
    await page.getByRole('button', {name: 'All', exact: true}).click();
    await page.getByRole('button', {name: 'Add tool', exact: false}).click();
    await page.getByLabel('Tool name', {exact: true}).fill('Operator source');
    await page.getByLabel('Tool website URL', {exact: true}).fill('javascript:alert(1)');
    await page.getByRole('dialog').getByRole('button', {name: 'Save tool'}).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('HTTP or HTTPS');
    await page.getByLabel('Tool website URL', {exact: true}).fill('https://example.org/tool');
    await page
      .getByLabel('Tool description', {exact: true})
      .fill('A saved source for this research workspace.');
    await page.getByRole('dialog').getByRole('button', {name: 'Save tool'}).click();
    await page.getByRole('button', {name: 'Pin Operator source', exact: true}).click();
    await expect(
      page
        .locator('.research-tool')
        .filter({hasText: 'Operator source'})
        .getByRole('button', {name: 'Open', exact: false}),
    ).toBeDisabled();
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.ecdys!.researchWorkspace())).tools.find(
            (tool) => tool.name === 'Operator source',
          )?.pinned,
      )
      .toBe(true);
    await page.getByRole('heading', {name: 'Research workspace'}).scrollIntoViewIfNeeded();
    await page.screenshot({path: 'artifacts/osint-tools.png', fullPage: true});
    const preferences = await page.evaluate(() => JSON.stringify(window.localStorage));
    expect(preferences).not.toContain('Operator notes');
    expect(preferences).not.toContain('Infrastructure research');
    expect(preferences).not.toContain('Operator source');
    await page.reload();
    await nav.getByRole('button', {name: /^OSINT/}).click();
    await expect(page.getByLabel('Mindmap name', {exact: true})).toHaveValue(
      'Infrastructure research',
    );
    await page
      .getByRole('button', {name: 'Select node: Infrastructure review', exact: true})
      .click();
    await expect(page.getByLabel('Research notes', {exact: true})).toHaveValue(
      'Operator notes remain private in this vault.',
    );
    await expect(page.getByLabel('Source URL', {exact: true})).toHaveValue(
      'https://example.org/source',
    );
    const saved = await page.evaluate(async () => {
      const {revision, updatedAt: _updatedAt, ...draft} = await window.ecdys!.researchWorkspace();
      return window.ecdys!.saveResearchWorkspace({
        revision,
        draft: {...draft, title: 'Updated in another window'},
      });
    });
    await page
      .getByLabel('Research notes', {exact: true})
      .fill('Unsaved local edits survive a revision conflict.');
    await expect(page.getByRole('alert')).toContainText('another window');
    await expect(page.getByLabel('Research notes', {exact: true})).toHaveValue(
      'Unsaved local edits survive a revision conflict.',
    );
    expect((await page.evaluate(() => window.ecdys!.researchWorkspace())).revision).toBe(
      saved.revision,
    );
    await page.getByRole('button', {name: 'Reload saved', exact: true}).click();
    await page.getByRole('dialog').getByRole('button', {name: 'Reload saved workspace'}).click();
    await expect(page.getByLabel('Mindmap name', {exact: true})).toHaveValue(
      'Updated in another window',
    );
    await page
      .locator('.sidebar')
      .getByRole('button', {name: 'Lock workspace', exact: false})
      .click();
    await expect(page.getByRole('button', {name: 'Unlock workspace'})).toBeVisible();
    await expect(page.getByLabel('Research notes', {exact: true})).toHaveCount(0);
    await page.getByLabel('Passphrase', {exact: true}).fill('research UI integration passphrase');
    await page.getByRole('button', {name: 'Unlock workspace'}).click();
    await expect(page.getByLabel('Mindmap name', {exact: true})).toHaveValue(
      'Updated in another window',
      {timeout: 60000},
    );
    expect(
      (await page.evaluate(() => window.ecdys!.researchWorkspace())).tools.some(
        (tool) => tool.name === 'Operator source',
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await app?.close();
    await rm(directory, {recursive: true, force: true});
  }
});
