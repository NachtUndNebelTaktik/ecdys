import {test,expect} from '@playwright/test';
test('browser preview never pretends to have desktop privileges',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Your workspace. Your control.'})).toBeVisible();
  await expect(page.getByText('Desktop bridge unavailable')).toBeVisible();
  await expect(page.getByRole('button',{name:'Create encrypted workspace'})).toBeDisabled();
  await expect(page.getByLabel('Workspace passphrase',{exact:true})).toHaveAttribute('type','password');
});

test('a catalog error from a dismissed dialog cannot enter a reopened dialog for another provider',async({page})=>{
  await page.addInitScript(()=>{
    const profile={id:'11111111-1111-4111-8111-111111111111',name:'Catalog race',tags:[],timezone:'UTC',language:'en-US',screen:'1920 × 1080',vpn:{provider:'mullvad',endpoint:'se-got-wg-001',rotation:'manual',routeLock:true},createdAt:1,updatedAt:1,parentProfileId:null,branchName:null,revision:1};
    (window as any).styg={invoke:async(request:any)=>{
      if(request.action==='vpnCatalog')return new Promise(resolve=>{(window as any).__failDismissedCatalog=()=>resolve({ok:false,error:'Old Mullvad catalog error'});});
      const values:Record<string,unknown>={status:{exists:true,unlocked:true,routing:{status:'blocked',message:'Fixture route blocked'},browserVersion:'fixture',platform:'linux'},profiles:[profile],snapshots:[],vpnCredentials:{mullvad:false,ivpn:false},vpnRegistrationStatus:{provider:request.provider,phase:'not_started',account:'unchecked',checkedAt:null,expiresAt:null,inProgress:false}};
      return {ok:true,value:values[request.action]};
    }};
  });
  await page.goto('/');await page.getByRole('button',{name:'VPN setup',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Load server list'}).click();
  await dialog.getByRole('button',{name:'Close VPN setup'}).click();await page.getByRole('button',{name:'VPN setup',exact:true}).click();
  await dialog.getByLabel('VPN provider').selectOption('ivpn');
  await page.evaluate(async()=>{(window as any).__failDismissedCatalog();await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));});
  await expect(page.getByRole('alert')).toHaveCount(0);await expect(dialog.getByLabel('VPN provider')).toHaveValue('ivpn');
});
