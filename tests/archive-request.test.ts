import {expect,it} from 'vitest';
import {Request} from '../packages/shared/src/model';
const id='11111111-1111-4111-8111-111111111111';
const sessionId='22222222-2222-4222-8222-222222222222';
it('accepts only the selected profile/session/page identity for native page saving',()=>{
  expect(Request.parse({action:'pageArchiveTargets',id,sessionId})).toEqual({action:'pageArchiveTargets',id,sessionId});
  expect(Request.parse({action:'savePageArchive',id,sessionId,targetId:'AB12CD34'})).toEqual({action:'savePageArchive',id,sessionId,targetId:'AB12CD34'});
});
it('rejects renderer-chosen output paths, URLs, arbitrary CDP commands and missing session identity',()=>{
  const request={action:'savePageArchive',id,sessionId,targetId:'AB12CD34'};
  for(const extra of [{path:'/tmp/arbitrary.html'},{url:'https://example.com'},{method:'Runtime.evaluate'},{routeReady:true}])expect(Request.safeParse({...request,...extra}).success).toBe(false);
  expect(Request.safeParse({action:'savePageArchive',id,targetId:'AB12CD34'}).success).toBe(false);
  expect(Request.safeParse({...request,targetId:'../../outside'}).success).toBe(false);
});
