import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('provider fixture registration, tunnel preview, removal and canceled authenticated requests remain isolated',async()=>{
  const root=await mkdtemp(join(tmpdir(),'styg-provider-desktop-'));const config=join(root,'config');await mkdir(config);
  let application:Awaited<ReturnType<typeof electron.launch>>|undefined;
  try{
    application=await electron.launch({args:['--no-sandbox','--ozone-platform=headless','--disable-gpu','.'],cwd:process.cwd(),env:{...process.env,XDG_CONFIG_HOME:config}});
    await application.evaluate(({session})=>{
      const state={key:'',mullvadCreates:0,ivpnCreates:0,hang:false,release:undefined as undefined|(()=>void),requests:0,delayRemoval:false,releaseRemoval:undefined as undefined|(()=>void)};(globalThis as any).__stygProviderFixture=state;
      const id='11111111-1111-4111-8111-111111111111';
      session.fromPartition('styg-provider-control').protocol.handle('https',async request=>{
        state.requests++;const path=new URL(request.url).pathname;const body=request.method==='POST'?await request.json():{};
        if(state.hang)return new Promise<Response>(resolve=>{state.release=()=>resolve(Response.json({status:200,token:'late-token'}));});
        if(path==='/auth/v1/token')return Response.json({access_token:'fixture-access-token',expiry:'2027-01-01T00:00:00Z'});
        if(path.endsWith('/accounts/me'))return Response.json({expiry:'2027-01-01T00:00:00Z'});
        if(request.method==='DELETE'){
          if(state.delayRemoval)return new Promise<Response>(resolve=>{state.releaseRemoval=()=>{state.key='';resolve(new Response(null,{status:204}));};});
          return new Response(null,{status:204});
        }
        if(path==='/accounts/v1/devices'&&request.method==='POST'){state.key=body.pubkey;state.mullvadCreates++;return Response.json({id,pubkey:state.key,ipv4_address:'10.64.0.2/32',ipv6_address:'fc00::2/128'},{status:201});}
        if(path.endsWith('/devices'))return Response.json(state.key?[{id,pubkey:state.key}]:[]);
        if(path.endsWith('/devices/'+id))return Response.json({id,pubkey:state.key,ipv4_address:'10.64.0.2/32',ipv6_address:'fc00::2/128'});
        if(path==='/v4/session/new'){state.ivpnCreates++;return Response.json({status:200,token:'fixture-ivpn-token',service_status:{is_active:true,active_until:1798761600},wireguard:{status:200,ip_address:'172.16.0.2'}});}
        if(path==='/v4/session/status')return Response.json({status:200,service_status:{is_active:true,active_until:1798761600}});
        if(path==='/v4/session/delete')return Response.json({status:200});
        return new Response(null,{status:404});
      });
      session.fromPartition('styg-provider-catalog').protocol.handle('https',()=>Response.json({locations:{'se-got':{country:'Sweden',city:'Gothenburg'}},wireguard:{relays:[{hostname:'se-got-wg-001',active:true,location:'se-got',ipv4_addr_in:'198.51.100.10',public_key:'CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk='}]}}));
    });
    const page=await application.firstWindow();await page.getByLabel('Workspace passphrase',{exact:true}).fill('provider fixture workspace passphrase');await page.getByLabel('Confirm passphrase').fill('provider fixture workspace passphrase');await page.getByText('Key derivation settings').click();await page.getByLabel('Argon2id memory').selectOption('64');await page.getByRole('button',{name:'Create encrypted workspace'}).click();
    await page.getByRole('button',{name:'＋ New profile'}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Profile name').fill('Provider fixture');await dialog.getByRole('button',{name:'Create profile'}).click();
    await page.getByRole('button',{name:'VPN setup',exact:true}).click();await dialog.getByLabel('VPN provider').selectOption('mullvad');await dialog.getByLabel('Provider account ID').fill('1234567890123456');await dialog.getByRole('button',{name:'Save account',exact:true}).click();
    await dialog.getByLabel('I allow Ecdys to use a provider device/session slot.').check();await dialog.getByRole('button',{name:'Prepare WireGuard',exact:true}).click();await expect(dialog.getByText('WireGuard registration saved',{exact:true})).toBeVisible();
    await dialog.getByRole('button',{name:'Recheck provider',exact:true}).click();await expect(dialog.getByRole('button',{name:'Recheck provider',exact:true})).toBeEnabled();expect(await application.evaluate(()=>(globalThis as any).__stygProviderFixture.mullvadCreates)).toBe(1);
    await dialog.getByLabel('Endpoint hostname').fill('se-got-wg-001');await dialog.getByRole('button',{name:'Save VPN settings'}).click();
    await page.getByRole('button',{name:'VPN setup',exact:true}).click();await dialog.getByRole('button',{name:'Preview saved endpoint'}).click();await expect(dialog.getByText('Tunnel preparation only · route blocked')).toBeVisible();await expect(dialog.getByText(/198.51.100.10:51820/)).toBeVisible();
    const dto=await page.evaluate(async()=>{const result=await window.styg!.invoke<any[]>({action:'profiles'});if(!result.ok)throw new Error(result.error);return window.styg!.invoke({action:'previewVpnTunnel',id:result.value[0].id});});expect(dto.ok).toBe(true);expect(JSON.stringify(dto)).not.toMatch(/privateKey|fixture-access-token|1234567890123456/);
    await application.evaluate(()=>{(globalThis as any).__stygProviderFixture.delayRemoval=true;});
    await dialog.getByLabel("Remove this workspace's Ecdys registration from the provider.").check();await dialog.getByRole('button',{name:'Remove registration',exact:true}).click();
    await expect.poll(()=>application!.evaluate(()=>!!(globalThis as any).__stygProviderFixture.releaseRemoval)).toBe(true);
    await dialog.getByRole('button',{name:'Close VPN setup'}).click();await page.getByRole('button',{name:'VPN setup',exact:true}).click();
    await application.evaluate(()=>{const state=(globalThis as any).__stygProviderFixture;state.delayRemoval=false;state.releaseRemoval();});
    await expect(dialog.getByText('WireGuard not prepared',{exact:true})).toBeVisible({timeout:2000});
    await expect(dialog.getByLabel('I allow Ecdys to use a provider device/session slot.')).not.toBeChecked();
    const staleRecheck=await page.evaluate(()=>window.styg!.invoke({action:'recheckVpnRegistration',provider:'mullvad'} as any));expect(staleRecheck.ok).toBe(false);
    expect(await application.evaluate(()=>(globalThis as any).__stygProviderFixture.mullvadCreates)).toBe(1);
    await dialog.getByLabel('VPN provider').selectOption('ivpn');await dialog.getByLabel('Provider account ID').fill('i-ABCD-EFGH-IJKL');await dialog.getByRole('button',{name:'Save account',exact:true}).click();
    await dialog.getByLabel('I allow Ecdys to use a provider device/session slot.').check();await dialog.getByRole('button',{name:'Prepare WireGuard',exact:true}).click();await expect(dialog.getByText('WireGuard registration saved',{exact:true})).toBeVisible();
    await dialog.getByLabel("Remove this workspace's Ecdys registration from the provider.").check();await dialog.getByRole('button',{name:'Remove registration',exact:true}).click();await expect(dialog.getByText('WireGuard not prepared',{exact:true})).toBeVisible();
    await expect(dialog.getByLabel('I allow Ecdys to use a provider device/session slot.')).not.toBeChecked();
    await expect(dialog.getByRole('button',{name:'Prepare WireGuard',exact:true})).toBeDisabled();
    await dialog.getByLabel('Endpoint hostname').fill('at1.wg.ivpn.net');await dialog.getByRole('button',{name:'Save VPN settings'}).click();await page.getByRole('button',{name:'VPN setup',exact:true}).click();
    await application.evaluate(()=>{(globalThis as any).__stygProviderFixture.hang=true;});await dialog.getByLabel('I allow Ecdys to use a provider device/session slot.').check();await dialog.getByRole('button',{name:'Prepare WireGuard',exact:true}).click();
    await expect.poll(()=>application!.evaluate(()=>!!(globalThis as any).__stygProviderFixture.release)).toBe(true);
    await dialog.getByRole('button',{name:'Close VPN setup'}).click();await page.getByRole('button',{name:'Lock workspace'}).click();await expect(page.getByRole('heading',{name:'Unlock Ecdys'})).toBeVisible({timeout:1000});
    await application.evaluate(()=>{const state=(globalThis as any).__stygProviderFixture;state.hang=false;state.release();});
    await page.getByLabel('Workspace passphrase',{exact:true}).fill('provider fixture workspace passphrase');await page.getByRole('button',{name:/^Unlock workspace/}).click();await page.getByRole('button',{name:'VPN setup',exact:true}).click();await expect(dialog.getByText('Registration outcome uncertain',{exact:true})).toBeVisible();await expect(dialog.getByRole('button',{name:'Prepare WireGuard',exact:true})).toBeDisabled();
    await dialog.getByRole('button',{name:'Close VPN setup'}).click();await expect(page.getByRole('button',{name:'Launch blocked'})).toBeDisabled();
    expect(await application.evaluate(()=>(globalThis as any).__stygProviderFixture.requests)).toBeGreaterThan(5);
  }finally{await application?.close();await rm(root,{recursive:true,force:true});}
});
