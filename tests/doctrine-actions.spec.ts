import {expect,test,type Page} from '@playwright/test';

const parentId='11111111-1111-4111-8111-111111111111';
const branchId='22222222-2222-4222-8222-222222222222';

async function installBranchFixture(page:Page){
  await page.addInitScript(({parentId,branchId})=>{
    const config={tags:[],timezone:'UTC',language:'en-US',screen:'1920 × 1080',vpn:{provider:'none',endpoint:'',rotation:'manual',routeLock:true},createdAt:1,updatedAt:1};
    let profiles=[{...config,id:parentId,name:'Parent research',parentProfileId:null,branchName:null,revision:1},{...config,id:branchId,name:'Experiment to discard',parentProfileId:parentId,branchName:'experiment',revision:3}];
    const mutations:unknown[]=[];
    (window as any).__branchMutations=mutations;
    (window as any).styg={invoke:async(request:any)=>{
      if(request.action==='status')return {ok:true,value:{exists:true,unlocked:true,routing:{status:'blocked',message:'Fixture route blocked'},browserVersion:'fixture',platform:'linux'}};
      if(request.action==='profiles')return {ok:true,value:profiles.map(profile=>({...profile}))};
      if(request.action==='snapshots')return {ok:true,value:[]};
      if(request.action==='discardBranch'){
        mutations.push({...request});
        return new Promise(resolve=>{
          (window as any).__finishBranchDiscard=()=>{
            if(request.id!==branchId||request.expectedRevision!==3){resolve({ok:false,error:'Incorrect branch selection'});return;}
            profiles=profiles.filter(profile=>profile.id!==request.id);
            resolve({ok:true,value:undefined});
          };
        });
      }
      return {ok:false,error:'Unexpected branch fixture request'};
    }};
  },{parentId,branchId});
}

async function openDiscard(page:Page){
  await page.locator('.profile-card').filter({has:page.getByRole('heading',{name:'Experiment to discard',exact:true})}).locator('.profile-main').click();
  await page.getByRole('button',{name:'Discard branch',exact:true}).click();
  return page.getByRole('dialog',{name:'Discard this branch?',exact:true});
}

test('discard identifies its target and starts on Cancel with contained keyboard navigation',async({page})=>{
  await installBranchFixture(page);await page.goto('/');
  let dialog=await openDiscard(page);
  await expect(dialog).toContainText('Experiment to discard');
  await expect(dialog).toContainText(branchId);
  await expect(dialog).toContainText('No in-app Undo');
  await expect(dialog).toContainText('External backups are not removed');
  await expect(dialog).toContainText('not secure erasure');
  expect(await dialog.evaluate(element=>element.matches(':modal'))).toBe(true);
  await expect(dialog.getByRole('button',{name:'Cancel',exact:true})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(()=>(window as any).__branchMutations)).toEqual([]);
  dialog=await openDiscard(page);
  for(const key of ['Shift+Tab','Tab','Tab','Tab']){
    await page.keyboard.press(key);
    expect(await dialog.evaluate(element=>element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button',{name:'Discard branch',exact:true})).toBeFocused();
  expect(await page.evaluate(()=>(window as any).__branchMutations)).toEqual([]);
  await expect(page.locator('.profile-card h2')).toHaveText(['Parent research','Experiment to discard']);
});

test('discard cannot be dismissed while running and only the explicitly confirmed branch is removed',async({page})=>{
  await installBranchFixture(page);await page.goto('/');
  const dialog=await openDiscard(page);
  await dialog.getByRole('button',{name:'Discard branch',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'Cancel',exact:true})).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(page.locator('.profile-card h2')).toHaveText(['Parent research','Experiment to discard']);
  expect(await page.evaluate(()=>(window as any).__branchMutations)).toEqual([{action:'discardBranch',id:branchId,expectedRevision:3}]);
  await page.evaluate(()=>(window as any).__finishBranchDiscard());
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.profile-card h2')).toHaveText(['Parent research']);
});
