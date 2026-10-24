import {test,expect,type Page} from '@playwright/test';
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

async function installRecoveryFixture(page:Page) {
  await page.addInitScript(()=>{
    const profiles=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'].map((id,index)=>({id,name:index?'Other profile':'Recovery fixture',tags:[],timezone:'UTC',language:'en-US',screen:'1920 × 1080',vpn:{provider:'none',endpoint:'',rotation:'manual',routeLock:true},createdAt:1,updatedAt:1,parentProfileId:null,branchName:null,revision:1}));
    const history=profiles.map(profile=>[
      {id:'33333333-3333-4333-8333-333333333333',profileId:profile.id,timestamp:2,trigger:'manual',pinned:false,size:512,hasBrowserState:true,fileCount:2,stateBytes:4096,browserVersion:'Fixture browser 123'},
      {id:'44444444-4444-4444-8444-444444444444',profileId:profile.id,timestamp:1,trigger:'baseline',pinned:false,size:128,hasBrowserState:false,fileCount:0,stateBytes:0,browserVersion:null},
    ]);
    const pending:{request:any;snapshot:any;resolve:(value:any)=>void}[]=[];let unlocked=true;
    (window as any).__finishRehearsal=(index:number,outcome:'success'|'failure')=>{
      const {request,snapshot,resolve}=pending[index];
      resolve(outcome==='failure'?{ok:false,error:'Unable to check recovery.'}:{ok:true,value:{profileId:request.id,snapshotId:snapshot.id,checkedAt:1792800000000,coverage:snapshot.hasBrowserState?'configuration_and_browser_state':'configuration_only',fileCount:snapshot.fileCount,directoryCount:snapshot.hasBrowserState?3:0,stateBytes:snapshot.stateBytes,browserVersion:snapshot.browserVersion}});
    };
    (window as any).styg={invoke:async(request:any)=>{
      if(request.action==='rehearseSnapshot'){
        if(Object.keys(request).sort().join(',')!=='action,id,snapshotId'||!history.some(items=>items.some(item=>item.id===request.snapshotId&&item.profileId===request.id)))return {ok:false,error:'Invalid recovery request'};
        const snapshot=history[profiles.findIndex(profile=>profile.id===request.id)].find(item=>item.id===request.snapshotId)!;
        return new Promise(resolve=>pending.push({request,snapshot,resolve}));
      }
      if(request.action==='saveStateSnapshot'){
        const index=profiles.findIndex(profile=>profile.id===request.id),items=history[index];
        const saved={...items[0],id:'55555555-5555-4555-8555-555555555555',timestamp:3};
        history[index]=[saved,items[1]];return {ok:true,value:saved};
      }
      if(request.action==='lock'){unlocked=false;return {ok:true,value:{incompleteSnapshots:0}};}
      if(request.action==='status')return {ok:true,value:{exists:true,unlocked,routing:{status:'blocked',message:'Fixture route blocked'},browserVersion:'fixture',platform:'linux'}};
      if(request.action==='profiles')return {ok:true,value:profiles};
      if(request.action==='snapshots')return {ok:true,value:history[profiles.findIndex(profile=>profile.id===request.id)]};
      return {ok:false,error:'Unexpected fixture request'};
    }};
  });
}

test('recovery reports distinguish configuration from browser archives and clear before another check',async({page})=>{
  await installRecoveryFixture(page);await page.goto('/');
  const baseline=page.locator('.timeline-item').filter({has:page.getByText('baseline',{exact:true})});
  const full=page.locator('.timeline-item').filter({has:page.getByText('manual',{exact:true})});
  const report=page.getByRole('status',{name:'Recovery check report'});
  await baseline.getByRole('button',{name:'Check recovery',exact:true}).click();
  await expect(page.getByText('Checking saved contents…',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Lock workspace'})).toBeEnabled();
  await page.evaluate(()=>(window as any).__finishRehearsal(0,'success'));
  await expect(report).toContainText('Configuration only · no browser files');
  await expect(report).toContainText('Snapshot: baseline');
  await expect(report).toContainText('0 files · 0 directories · 0 bytes');
  await expect(report.locator('time')).toHaveAttribute('datetime','2026-10-24T00:00:00.000Z');
  await expect(report).toContainText('Saved contents authenticated and readable.');
  await expect(report).toContainText('No browser was launched and no files were extracted to disk.');
  await expect(report).toContainText('Browser and OS compatibility, protected cookies and routing were not tested.');
  await full.getByRole('button',{name:'Check recovery',exact:true}).click();
  await expect(report).toHaveCount(0);
  await page.evaluate(()=>(window as any).__finishRehearsal(1,'success'));
  await expect(report).toContainText('Configuration + browser state');
  await expect(report).toContainText('Snapshot: manual');
  await expect(report).toContainText('2 files · 3 directories · 4096 bytes');
  await expect(report).toContainText('Saved browser: Fixture browser 123');
  await full.getByRole('button',{name:'Check recovery',exact:true}).click();
  await expect(report).toHaveCount(0);
  await page.evaluate(()=>(window as any).__finishRehearsal(2,'failure'));
  await expect(page.getByRole('alert')).toContainText('Unable to check recovery.');
  await expect(report).toHaveCount(0);
});

test('a snapshot removed during a history refresh clears its check and ignores the late result',async({page})=>{
  await installRecoveryFixture(page);await page.goto('/');
  await page.getByRole('button',{name:'Check recovery',exact:true}).first().click();
  await expect(page.getByText('Checking saved contents…',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Save browser state'}).click();
  await expect(page.getByText('Encrypted browser-state snapshot saved (2 files).',{exact:true})).toBeVisible();
  await expect(page.getByText('Checking saved contents…',{exact:true})).toHaveCount(0);
  await page.evaluate(async()=>{(window as any).__finishRehearsal(0,'success');await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));});
  await expect(page.getByRole('status',{name:'Recovery check report'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Check recovery',exact:true}).first()).toBeEnabled();
});

for(const destination of ['profile switch','lock'] as const)for(const outcome of ['success','failure'] as const)test(`a late recovery ${outcome} cannot appear after ${destination}`,async({page})=>{
  await installRecoveryFixture(page);await page.goto('/');
  await page.getByRole('button',{name:'Check recovery',exact:true}).first().click();
  if(destination==='profile switch'){
    await page.locator('.profile-card').filter({has:page.getByRole('heading',{name:'Other profile',exact:true})}).locator('.profile-main').click();
    await expect(page.locator('.detail-panel h2')).toHaveText('Other profile');
  }else{
    await expect(page.getByRole('button',{name:'Lock workspace'})).toBeEnabled();
    await page.getByRole('button',{name:'Lock workspace'}).click();
    await expect(page.getByRole('heading',{name:'Unlock Ecdys'})).toBeVisible();
  }
  await page.evaluate(async(outcome)=>{(window as any).__finishRehearsal(0,outcome);await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));},outcome);
  await expect(page.getByRole('status',{name:'Recovery check report'})).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('Checking saved contents…',{exact:true})).toHaveCount(0);
});
