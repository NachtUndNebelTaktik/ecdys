import {z} from 'zod';
import type {Vault} from '../vault';
import type {RegistrationStatus,TunnelPreview,VpnProviderType} from '../../../shared/src/vpn';
import {VpnProvider} from '../../../shared/src/vpn';
import {ProviderClient,ProviderError,type AccountCheck} from './provider-client';
import {ProviderCatalog} from './catalog';
import type {RegistrationData,RemoteData} from './registration';
class SetupError extends Error {}
const uncertain=()=>new SetupError('Registration outcome is uncertain. Review Styg devices/sessions in your provider account before resetting local setup.');
export class ProviderSetup {
  private operations=new Map<VpnProviderType,AbortController>();
  private closed=false;
  constructor(private vault:Vault,private client:ProviderClient,private catalog:ProviderCatalog,private now=Date.now){}
  assertIdle(provider:VpnProviderType):void {VpnProvider.parse(provider);if(this.closed)throw new ProviderError('cancelled');if(this.operations.has(provider))throw new Error('A provider operation is already in progress');}
  status(provider:VpnProviderType):RegistrationStatus {VpnProvider.parse(provider);return {...this.vault.vpnRegistrationStatus(provider,this.now()),inProgress:this.operations.has(provider)};}
  cancel():void {this.closed=true;for(const controller of this.operations.values())controller.abort();this.catalog.cancelPending();}
  private async run<T>(provider:VpnProviderType,work:(signal:AbortSignal)=>Promise<T>):Promise<T> {
    this.assertIdle(provider);const controller=new AbortController();this.operations.set(provider,controller);
    try{return await work(controller.signal);}catch(error){if(controller.signal.aborted)throw new ProviderError('cancelled');if(error instanceof ProviderError||error instanceof SetupError)throw error;throw new Error('Provider setup could not complete. Preserve saved setup and review the provider account before retrying.');}
    finally{this.operations.delete(provider);}
  }
  private commit(data:RegistrationData,signal:AbortSignal):void {if(signal.aborted||this.closed)throw new ProviderError('cancelled');this.vault.putVpnRegistration(data.provider,data);}
  private saved(data:RegistrationData,remote:RemoteData,account:AccountCheck,signal:AbortSignal):RegistrationStatus {
    this.commit({...data,phase:'registered',remote,active:account.active,expiresAt:account.expiresAt,checkedAt:this.now()},signal);
    return this.vault.vpnRegistrationStatus(data.provider,this.now());
  }
  private unverified(data:RegistrationData,signal:AbortSignal):RegistrationData {
    const next={...data,checkedAt:null,active:false};this.commit(next,signal);return next;
  }
  async prepare(provider:VpnProviderType):Promise<RegistrationStatus> {return this.check(provider,true);}
  async recheck(provider:VpnProviderType):Promise<RegistrationStatus> {return this.check(provider,false);}
  private async check(provider:VpnProviderType,allowCreate:boolean):Promise<RegistrationStatus> {
    return this.run(provider,async signal=>{
      let data=this.vault.readVpnRegistration(provider);
      if(!allowCreate&&data?.phase!=='registered')throw new SetupError('Provider registration changed. Reload setup and explicitly prepare a new registration if needed.');
      // Retain recovery material, but never keep an old approval through a failed or canceled recheck.
      if(data?.phase==='registered')data=this.unverified(data,signal);
      if(provider==='mullvad'){
        const auth=await this.client.mullvadAuthenticate(this.vault.readVpnAccount(provider),signal);
        if(!auth.active){if(data)this.commit({...data,checkedAt:this.now(),expiresAt:auth.expiresAt,active:false},signal);throw new ProviderError('expired',true);}
        if(signal.aborted)throw new ProviderError('cancelled');data??=this.vault.draftVpnRegistration(provider);
        if(data.remote?.kind==='mullvad')return this.saved(data,await this.client.mullvadGet(auth.token,data.remote.id,data.publicKey,signal),auth,signal);
        const devices=await this.client.mullvadDevices(auth.token,signal);
        const matches=devices.filter(device=>device.pubkey===data!.publicKey);
        if(matches.length>1)throw new ProviderError('conflict');
        if(matches.length)return this.saved(data,await this.client.mullvadGet(auth.token,matches[0].id,data.publicKey,signal),auth,signal);
        const alreadyUncertain=data.phase==='pending';data={...data,phase:'pending'};this.commit(data,signal);
        try{return this.saved(data,await this.client.mullvadCreate(auth.token,data.publicKey,signal),auth,signal);}
        catch(error){if(error instanceof ProviderError&&error.safeToRetry&&!alreadyUncertain&&!signal.aborted)this.commit({...data,phase:'draft'},signal);throw error;}
      }
      if(data?.phase==='pending')throw uncertain();
      if(data?.remote?.kind==='ivpn')return this.saved(data,data.remote,await this.client.ivpnStatus(data.remote.token,signal),signal);
      data??=this.vault.draftVpnRegistration(provider);data={...data,phase:'pending'};this.commit(data,signal);
      try{const result=await this.client.ivpnCreate(this.vault.readVpnAccount(provider),data.publicKey,signal);return this.saved(data,result.remote,result,signal);}
      catch(error){if(error instanceof ProviderError&&error.safeToRetry&&!signal.aborted)this.commit({...data,phase:'draft'},signal);throw error;}
    });
  }
  async remove(provider:VpnProviderType):Promise<RegistrationStatus> {
    return this.run(provider,async signal=>{
      let data=this.vault.readVpnRegistration(provider);if(!data)return this.vault.vpnRegistrationStatus(provider,this.now());
      if(data.phase==='pending')throw uncertain();
      // The remote deletion may succeed even if its reply is lost.
      if(data.phase==='registered')data=this.unverified(data,signal);
      if(data.remote?.kind==='mullvad'){
        const auth=await this.client.mullvadAuthenticate(this.vault.readVpnAccount(provider),signal);
        try{await this.client.mullvadGet(auth.token,data.remote.id,data.publicKey,signal);await this.client.mullvadRemove(auth.token,data.remote.id,signal);}
        catch(error){if(!(error instanceof ProviderError&&error.code==='not_found'))throw error;}
      }else if(data.remote?.kind==='ivpn')await this.client.ivpnRemove(data.remote.token,signal);
      if(signal.aborted||this.closed)throw new ProviderError('cancelled');this.vault.clearVpnRegistration(provider);return this.vault.vpnRegistrationStatus(provider,this.now());
    });
  }
  resetUncertain(provider:VpnProviderType,reviewed:boolean):RegistrationStatus {
    this.assertIdle(provider);z.literal(true).parse(reviewed);const data=this.vault.readVpnRegistration(provider);
    if(data?.phase!=='pending')throw new Error('Only uncertain registrations can be reset');this.vault.clearVpnRegistration(provider);return this.vault.vpnRegistrationStatus(provider,this.now());
  }
  private verified(provider:VpnProviderType) {
    const data=this.vault.readVpnRegistration(provider);
    if(!data?.remote||data.phase!=='registered'||!data.active||data.checkedAt===null||data.checkedAt>this.now()+5000||this.now()-data.checkedAt>=3600000||data.expiresAt===null||data.expiresAt<=this.now())throw new SetupError('Recheck the provider account and registration before preparing a tunnel preview');
    return {...data,remote:data.remote,checkedAt:data.checkedAt};
  }
  async preview(profileId:string):Promise<TunnelPreview> {
    const profile=this.vault.profiles().find(p=>p.id===profileId);if(!profile||profile.vpn.provider==='none'||!profile.vpn.endpoint)throw new Error('Save a provider and endpoint before preparing a tunnel preview');
    const provider=profile.vpn.provider;
    return this.run(provider,async signal=>{
      this.verified(provider);
      const catalog=await this.catalog.get(provider);if(signal.aborted||this.closed)throw new ProviderError('cancelled');
      const data=this.verified(provider);
      if(catalog.stale||this.now()-catalog.checkedAt>=3600000)throw new SetupError('A fresh provider catalog is required for tunnel preparation');
      const current=this.vault.profiles().find(p=>p.id===profileId);if(current?.revision!==profile.revision)throw new SetupError('Profile changed during tunnel preparation. Review its saved settings again.');
      const relay=catalog.relays.find(r=>r.hostname===profile.vpn.endpoint);if(!relay)throw new SetupError('Selected endpoint is absent from the current provider catalog');
      return {provider,hostname:relay.hostname,port:provider==='mullvad'?51820:2049,peerIp:relay.ipv4,interfaceAddresses:[...data.remote.addresses],checkedAt:data.checkedAt,route:'blocked'};
    });
  }
}
