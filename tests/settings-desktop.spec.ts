import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('Electron settings persist across restart and the lock shortcut closes the real workspace',async()=>{
  const root=await mkdtemp(join(tmpdir(),'ecdys-settings-desktop-'));
  let application:Awaited<ReturnType<typeof electron.launch>>|undefined;
  const launch=()=>electron.launch({args:['--no-sandbox','--ozone-platform=headless','--disable-gpu','.'],cwd:process.cwd(),env:{...process.env,XDG_CONFIG_HOME:root}});
  try {
    application=await launch();let page=await application.firstWindow();
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.getByRole('button',{name:'Open settings',exact:true}).click();
    let settings=page.getByRole('dialog',{name:'Settings',exact:true});
    await settings.getByRole('combobox',{name:'Appearance',exact:true}).selectOption('light');
    await settings.getByRole('combobox',{name:'Accent colour',exact:true}).selectOption('indigo');
    await settings.getByRole('button',{name:'Personalization',exact:true}).click();
    await settings.getByRole('combobox',{name:'Density',exact:true}).selectOption('compact');
    await settings.getByRole('checkbox',{name:'Reduce motion',exact:true}).check();
    await settings.getByRole('button',{name:'Close settings',exact:true}).click();
    await page.getByLabel('Workspace passphrase',{exact:true}).fill('settings fixture passphrase only');
    await page.getByLabel('Confirm passphrase').fill('settings fixture passphrase only');
    await page.getByText('Key derivation settings').click();
    await page.getByLabel('Argon2id memory').selectOption('64');
    await page.getByRole('button',{name:'Create encrypted workspace',exact:false}).click();
    await expect(page.getByRole('button',{name:'＋ New profile'})).toBeVisible();
    await page.keyboard.press('Control+Shift+L');
    await expect(page.getByRole('heading',{name:'Unlock Ecdys',exact:true})).toBeVisible();
    const state=await page.evaluate(()=>window.styg!.invoke<{unlocked:boolean}>({action:'status'}));
    expect(state.ok&&state.value.unlocked).toBe(false);
    await application.close();application=undefined;
    application=await launch();page=await application.firstWindow();
    page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await expect(page.locator('html')).toHaveAttribute('data-appearance','light');
    await expect(page.locator('html')).toHaveAttribute('data-accent','indigo');
    await expect(page.locator('html')).toHaveAttribute('data-density','compact');
    await expect(page.locator('html')).toHaveAttribute('data-reduce-motion','true');
    await page.getByRole('button',{name:'Open settings',exact:true}).click();
    settings=page.getByRole('dialog',{name:'Settings',exact:true});
    await settings.getByRole('combobox',{name:'Appearance',exact:true}).selectOption('dark');
    await settings.getByRole('combobox',{name:'Accent colour',exact:true}).selectOption('crimson');
    await settings.screenshot({path:'test-results/settings-electron.png'});
    await settings.getByRole('button',{name:/^Security/}).click();
    await expect(settings.getByRole('button',{name:'Lock workspace',exact:true})).toBeDisabled();
    await page.keyboard.press('Escape');await page.keyboard.press('Escape');
    await expect(page.getByRole('button',{name:'Open settings',exact:true})).toBeFocused();
    expect(errors).toEqual([]);
  }finally{await application?.close();await rm(root,{recursive:true,force:true});}
});
