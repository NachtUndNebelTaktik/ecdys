import type {Profile,ProfileConfig,ConfigChange} from '../../shared/src/model';
export const ENVIRONMENT_FIELDS=['timezone','language','screen','vpn'] as const;
export function profileConfiguration(profile:Profile):ProfileConfig {
  return {name:profile.name,tags:[...profile.tags],timezone:profile.timezone,language:profile.language,screen:profile.screen,vpn:{...profile.vpn}};
}
export function configurationDiff(before:ProfileConfig,after:ProfileConfig,fields:readonly (keyof ProfileConfig)[]=['name','tags','timezone','language','screen','vpn']):ConfigChange[] {
  const changes:ConfigChange[]=[];
  for(const field of fields) {
    if(field==='tags') {
      for(const tag of new Set(before.tags))if(!after.tags.includes(tag))changes.push({field,kind:'removed',before:tag,after:null});
      for(const tag of new Set(after.tags))if(!before.tags.includes(tag))changes.push({field,kind:'added',before:null,after:tag});
    }else if(field==='vpn') {
      if(JSON.stringify(before.vpn)!==JSON.stringify(after.vpn))changes.push({field,kind:'modified',before:JSON.stringify(before.vpn),after:JSON.stringify(after.vpn)});
    }else if(before[field]!==after[field])changes.push({field,kind:'modified',before:before[field],after:after[field]});
  }
  return changes;
}
