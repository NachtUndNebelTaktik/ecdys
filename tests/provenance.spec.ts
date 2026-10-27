import {test,expect,type Page} from '@playwright/test';

test.use({viewport:{width:1440,height:1000}});

async function installFixture(page:Page,mode:'ready'|'pending_status'|'failed_status'|'pending_profiles'|'failed_profiles'|'pending_initial_history'='ready') {
  await page.addInitScript(({mode})=>{
    const profiles=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'].map((id,index)=>({id,name:index?'Beta':'Alpha',tags:[],timezone:'UTC',language:'en-US',screen:'1920 × 1080',vpn:{provider:'none',endpoint:null,rotation:'manual',routeLock:true},createdAt:1,updatedAt:1,parentProfileId:null,branchName:null,revision:1}));
    const histories=profiles.map((profile,index)=>[{id:index?'44444444-4444-4444-8444-444444444444':'33333333-3333-4333-8333-333333333333',profileId:profile.id,timestamp:index?2:1,trigger:index?'baseline':'manual',pinned:false,size:1024,hasBrowserState:!index,fileCount:index?0:7,stateBytes:index?0:2048,browserVersion:index?null:'Fixture browser'}]);
    let unlocked=true,firstStatus=true,firstProfiles=true,firstHistory=true;
    const pending:((value:unknown)=>void)[]=[];
    const observed=()=>({exists:true,unlocked,routing:{status:'blocked',message:'Fixture route blocked'},browserVersion:'fixture',platform:'linux'});
    (window as any).__finishHistory=(index:number,outcome:'success'|'failure'|'wrong_profile')=>pending[index](outcome==='failure'?{ok:false,error:'Fixture history read failed'}:{ok:true,value:histories[outcome==='wrong_profile'?0:1]});
    (window as any).styg={invoke:async(request:any)=>{
      if(request.action==='status'){
        if(firstStatus){
          firstStatus=false;
          if(mode==='pending_status')return new Promise(resolve=>{(window as any).__finishStatus=()=>{unlocked=false;resolve({ok:true,value:observed()});};});
          if(mode==='failed_status')return {ok:false,error:'Fixture status read failed'};
        }
        return {ok:true,value:observed()};
      }
      if(request.action==='profiles'){
        if(firstProfiles){firstProfiles=false;if(mode==='failed_profiles')return {ok:false,error:'Fixture profile list read failed'};}
        if(mode==='pending_profiles')return new Promise(resolve=>{(window as any).__finishProfiles=()=>resolve({ok:true,value:profiles});});
        return {ok:true,value:profiles};
      }
      if(request.action==='snapshots'){
        if(firstHistory){
          firstHistory=false;
          if(mode==='pending_initial_history')return new Promise(resolve=>{(window as any).__finishInitialHistory=()=>resolve({ok:true,value:histories[0]});});
        }
        if(request.id===profiles[1].id)return new Promise(resolve=>pending.push(resolve));
        return {ok:true,value:histories[0]};
      }
      if(request.action==='lock'){unlocked=false;return {ok:true,value:{incompleteSnapshots:0}};}
      if(request.action==='unlock'){unlocked=true;return {ok:true,value:undefined};}
      return {ok:false,error:'Unexpected provenance fixture action'};
    }};
  },{mode});
}

const vault=(page:Page)=>page.getByRole('group',{name:'Vault state',exact:true});
const profile=(page:Page,name:string)=>page.getByRole('region',{name:'Profiles',exact:true}).getByRole('button').filter({has:page.getByRole('heading',{name,exact:true})});
const timeline=(page:Page)=>page.locator('.detail-panel .timeline-item');
const historyHeading=(page:Page)=>page.locator('.detail-panel h3').filter({hasText:'Snapshot history'});

test('pending or failed workspace reads stay unknown and do not offer workspace creation',async({page})=>{
  await installFixture(page,'pending_status');await page.goto('/');
  await expect(vault(page)).toContainText('Vault unknown');
  await expect(page.locator('.sidebar .count')).toHaveText('Unknown');
  await expect(page.getByRole('button',{name:'Create encrypted workspace',exact:false})).toHaveCount(0);
  await page.getByRole('button',{name:'Open settings',exact:true}).click();
  const settings=page.getByRole('dialog',{name:'Settings',exact:true});
  await expect(settings.getByRole('complementary',{name:'Current state'})).toContainText(/Vault\s*Unknown/);
  await settings.getByRole('button',{name:'Close settings',exact:true}).click();
  await page.evaluate(()=>(window as any).__finishStatus());
  await expect(vault(page)).toContainText('Vault locked');
  await expect(page.getByRole('heading',{name:'Unlock Ecdys',exact:true})).toBeVisible();
  await expect(page.locator('.sidebar .count')).toHaveText('Unknown');
});

test('failed workspace status can be retried without pretending the vault is empty',async({page})=>{
  await installFixture(page,'failed_status');await page.goto('/');
  await expect(vault(page)).toContainText('Vault unknown');
  await expect(page.getByRole('button',{name:'Create encrypted workspace',exact:false})).toHaveCount(0);
  await page.getByRole('button',{name:'Retry workspace check',exact:true}).click();
  await expect(vault(page)).toContainText('Vault unlocked');
  await expect(page.locator('.sidebar .count')).toHaveText('2');
});

test('an unread profile list reports an unknown count until the records arrive',async({page})=>{
  await installFixture(page,'pending_profiles');await page.goto('/');
  await expect(vault(page)).toContainText('Vault unlocked');
  await expect(page.locator('.sidebar .count')).toHaveText('Unknown');
  await expect(page.locator('.stats > div').first()).toContainText('Unknown');
  await expect(page.getByRole('heading',{name:'A clean slate',exact:true})).toHaveCount(0);
  await page.evaluate(()=>(window as any).__finishProfiles());
  await expect(page.locator('.sidebar .count')).toHaveText('2');
  await expect(timeline(page)).toHaveCount(1);
});

test('a failed profile list stays unknown and can be retried without creating a workspace',async({page})=>{
  await installFixture(page,'failed_profiles');await page.goto('/');
  await expect(vault(page)).toContainText('Vault unlocked');
  await expect(page.locator('.sidebar .count')).toHaveText('Unknown');
  await expect(page.getByRole('heading',{name:'A clean slate',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'New profile',exact:false})).toBeDisabled();
  await page.getByRole('button',{name:'Retry profile list',exact:true}).click();
  await expect(page.locator('.sidebar .count')).toHaveText('2');
  await expect(page.locator('.detail-panel h2')).toHaveText('Alpha');
  await expect(timeline(page)).toContainText('manual');
});

test('an initial history read cannot prevent locking or republish data after lock',async({page})=>{
  await installFixture(page,'pending_initial_history');await page.goto('/');
  await expect(page.getByText('Loading snapshot history.',{exact:true})).toBeVisible();
  const lock=page.getByRole('button',{name:'Lock workspace ↗',exact:true});
  await expect(lock).toBeEnabled();
  await lock.click();
  await expect(vault(page)).toContainText('Vault locked');
  await page.evaluate(()=>(window as any).__finishInitialHistory());
  await expect(page.locator('.detail-panel')).toHaveCount(0);
  await expect(page.locator('.profile-card')).toHaveCount(0);
  await expect(page.locator('.sidebar .count')).toHaveText('Unknown');
  await expect(page.getByRole('heading',{name:'Unlock Ecdys',exact:true})).toBeVisible();
});

test('an initial history read cannot prevent switching profiles or replace the new selection',async({page})=>{
  await installFixture(page,'pending_initial_history');await page.goto('/');
  await expect(page.getByText('Loading snapshot history.',{exact:true})).toBeVisible();
  await expect(profile(page,'Beta')).toBeEnabled();
  await profile(page,'Beta').click();
  await page.evaluate(()=>(window as any).__finishHistory(0,'success'));
  await expect(page.locator('.detail-panel h2')).toHaveText('Beta');
  await expect(timeline(page)).toContainText('baseline');
  await page.evaluate(()=>(window as any).__finishInitialHistory());
  await expect(page.locator('.detail-panel h2')).toHaveText('Beta');
  await expect(timeline(page)).toContainText('baseline');
  await expect(timeline(page)).not.toContainText('manual');
});

test('browser-only preview exposes unavailable vault state and plaintext storage boundary',async({page})=>{
  await page.goto('/');
  await expect(vault(page)).toContainText('Vault unavailable — browser preview');
  await expect(page.locator('.sidebar .count')).toHaveText('Unknown');
  await expect(page.getByText('Browser working files: plaintext on this device',{exact:true})).toBeVisible();
});

test('history disappears on selection, failed reads stay unknown and retry reads the selected profile',async({page})=>{
  await installFixture(page);await page.goto('/');
  await expect(timeline(page)).toContainText('manual');
  await profile(page,'Beta').click();
  await expect(page.locator('.detail-panel h2')).toHaveText('Beta');
  await expect(timeline(page)).toHaveCount(0);
  await expect(historyHeading(page)).toContainText('Unknown');
  await expect(page.getByText('Loading snapshot history.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Open settings',exact:true}).click();
  const settings=page.getByRole('dialog',{name:'Settings',exact:true});
  await settings.getByRole('button',{name:'Storage',exact:true}).click();
  await expect(settings.locator('.settings-facts > div').filter({has:page.getByText('Snapshots in selected profile',{exact:true})})).toContainText('Unknown');
  await settings.getByRole('button',{name:'Close settings',exact:true}).click();
  await page.evaluate(()=>(window as any).__finishHistory(0,'failure'));
  await expect(page.getByRole('alert')).toContainText('Snapshot history could not be read');
  await expect(timeline(page)).toHaveCount(0);
  await expect(historyHeading(page)).toContainText('Unknown');
  await page.getByRole('button',{name:'Retry snapshot history',exact:true}).click();
  await page.evaluate(()=>(window as any).__finishHistory(1,'success'));
  await expect(timeline(page)).toContainText('baseline');
  await expect(historyHeading(page)).toHaveText('Snapshot history 1');
});

for(const outcome of ['success','failure'] as const)test(`a late history ${outcome} cannot replace a subsequently selected profile`,async({page})=>{
  await installFixture(page);await page.goto('/');
  await expect(timeline(page)).toContainText('manual');
  await profile(page,'Beta').click();
  await expect(timeline(page)).toHaveCount(0);
  await profile(page,'Alpha').click();
  await expect(timeline(page)).toContainText('manual');
  await page.evaluate(outcome=>(window as any).__finishHistory(0,outcome),outcome);
  await expect(page.locator('.detail-panel h2')).toHaveText('Alpha');
  await expect(timeline(page)).toContainText('manual');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a history result arriving after lock cannot restore cleared profile data',async({page})=>{
  await installFixture(page);await page.goto('/');
  await expect(timeline(page)).toContainText('manual');
  await profile(page,'Beta').click();
  await expect(page.getByText('Loading snapshot history.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Lock workspace ↗',exact:true}).click();
  await expect(vault(page)).toContainText('Vault locked');
  await page.evaluate(()=>(window as any).__finishHistory(0,'success'));
  await expect(page.locator('.detail-panel')).toHaveCount(0);
  await expect(page.locator('.sidebar .count')).toHaveText('Unknown');
  await page.getByLabel('Workspace passphrase',{exact:true}).fill('fixture passphrase');
  await page.getByRole('button',{name:'Unlock workspace',exact:false}).click();
  await expect(page.locator('.detail-panel h2')).toHaveText('Alpha');
  await expect(timeline(page)).toContainText('manual');
});

test('history with another profile ID is rejected rather than displayed as an empty or trusted history',async({page})=>{
  await installFixture(page);await page.goto('/');
  await expect(timeline(page)).toContainText('manual');
  await profile(page,'Beta').click();
  await page.evaluate(()=>(window as any).__finishHistory(0,'wrong_profile'));
  await expect(page.getByRole('alert')).toContainText('Snapshot history could not be read');
  await expect(timeline(page)).toHaveCount(0);
  await expect(historyHeading(page)).toContainText('Unknown');
});

test('the observed vault boundary remains visible while the workspace scrolls',async({page})=>{
  await installFixture(page);await page.goto('/');
  await expect(timeline(page)).toContainText('manual');
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  expect(await page.evaluate(()=>window.scrollY)).toBeGreaterThan(0);
  await expect(vault(page)).toBeInViewport();
  await expect(vault(page)).toContainText('Vault unlocked');
});
