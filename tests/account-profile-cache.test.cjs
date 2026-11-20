const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function client() {
  const calls=[],renders=[],root={style:{display:'none'}},saved=[];
  const source=fs.readFileSync('Frontend/Modals/AccountProfileModal.html','utf8');
  const runner=handlers=>new Proxy({},{get(_target,key){
    if(key==='withSuccessHandler')return success=>runner({...handlers,success});
    if(key==='withFailureHandler')return failure=>runner({...handlers,failure});
    return ()=>calls.push({method:key,...handlers});
  }});
  const c=vm.createContext({console,currentEmployee:{employeeId:'A1',dashboardToken:'token-a',username:'ana3@ys.sys',fullName:'Ana Cruz',role:'CASHIER'},
    accountProfileRoot:root,accountProfileState:{owner:'',profile:null,request:0,mode:'preview',loading:false},secureScriptRun:runner({}),
    clearAccountPasswords(){},fillAccountProfile(){},accountProfileError(){},
    renderAccountProfile(){renders.push({profile:c.accountProfileState.profile,loading:c.accountProfileState.loading});},
    syncAccountIdentity(){saved.push(JSON.stringify(c.currentEmployee));},
    resetAccountProfile(){root.style.display='none';c.accountProfileState={owner:'',profile:null,request:c.accountProfileState.request+1,mode:'preview',loading:false};}
  });
  for(const name of ['preloadAccountProfile','openAccountProfile','closeAccountProfile']) {
    const start=source.indexOf('  function '+name+'('),end=source.indexOf('\n  function ',start+1);
    assert(start>=0 && end>start);vm.runInContext(source.slice(start,end),c);
  }
  return {c,calls,renders,root,saved};
}
const profile={employeeId:'A1',username:'ana3@ys.sys',fullName:'Ana Cruz',displayName:'Ana',contact:'09123456789',address:'Home address',version:'v1'};
test('profile delivered at login opens immediately without an additional API call or persisted personal data',()=>{
  const {c,calls,root}=client();c.currentEmployee.accountProfile={...profile};c.preloadAccountProfile(c.currentEmployee);
  assert(!('accountProfile' in c.currentEmployee));assert.equal(c.accountProfileState.profile.contact,'09123456789');
  c.openAccountProfile();assert.equal(root.style.display,'flex');assert.equal(calls.length,0);assert.equal(c.accountProfileState.loading,false);
  assert(!JSON.stringify(c.currentEmployee).includes('09123456789'));
});
test('restored sessions preload in the background and rapid avatar clicks share the same request',()=>{
  const {c,calls,renders}=client();c.preloadAccountProfile(c.currentEmployee);assert.equal(calls.length,1);
  c.openAccountProfile();c.openAccountProfile();assert.equal(calls.length,1);
  assert.equal(renders.at(-1).profile.fullName,'Ana Cruz');assert(renders.at(-1).profile.partial);
  calls[0].success({success:true,profile:{...profile}});assert.equal(c.accountProfileState.loading,false);
  c.closeAccountProfile();c.openAccountProfile();assert.equal(calls.length,1);assert.equal(c.accountProfileState.profile.version,'v1');
});
test('closing a pending preview does not throw away the background result or repeat the fetch',()=>{
  const {c,calls,root}=client();c.openAccountProfile();c.closeAccountProfile();assert.equal(root.style.display,'none');
  calls[0].success({success:true,profile:{...profile}});c.openAccountProfile();assert.equal(calls.length,1);assert.equal(c.accountProfileState.profile.contact,'09123456789');
});
test('old responses and prefetched identities cannot populate another account preview',()=>{
  const {c,calls}=client();c.openAccountProfile();const old=calls[0];
  c.currentEmployee={employeeId:'B2',dashboardToken:'token-b',username:'bea3@ys.sys',fullName:'Bea Reyes',role:'CASHIER',accountProfile:{...profile}};
  c.preloadAccountProfile(c.currentEmployee);assert.equal(calls.length,2);assert(!('accountProfile' in c.currentEmployee));
  old.success({success:true,profile:{...profile}});assert.equal(c.accountProfileState.profile.employeeId,'B2');assert(!c.accountProfileState.profile.contact);
  calls[1].success({success:true,profile:{...profile,employeeId:'B2',username:'bea3@ys.sys',fullName:'Bea Reyes',displayName:'Bea'}});
  assert.equal(c.accountProfileState.profile.employeeId,'B2');
});
test('a failed preload preserves the known identity and can retry on reopen',()=>{
  const {c,calls}=client();c.openAccountProfile();calls[0].failure(new Error('Offline'));
  assert.equal(c.accountProfileState.profile.fullName,'Ana Cruz');assert.equal(c.accountProfileState.loading,false);
  c.closeAccountProfile();c.openAccountProfile();assert.equal(calls.length,2);assert.equal(c.accountProfileState.loading,true);
});

test('preview photo viewer uses the rendered cached photo and clears its copy when closed',()=>{
  const source=fs.readFileSync('Frontend/Modals/AccountProfileModal.html','utf8');
  const start=source.indexOf('  function openAccountProfilePhoto('),end=source.indexOf('\n  function ',start+1);
  const photo={src:'data:image/jpeg;base64,/9j/test'},viewerImage={style:{},src:'',removeAttribute(key){delete this[key];}},listeners={},calls=[];
  let hasPhoto=true;
  const c=vm.createContext({currentEmployee:{dashboardToken:'token-a'},accountProfileState:{owner:'token-a',mode:'preview',busy:false,profile:{fullName:'Ana Cruz',displayName:'Ana'}},
    accountProfileFind:()=>({querySelector:()=>hasPhoto?photo:null}),
    document:{getElementById:id=>id==='inventoryViewerImage'?viewerImage:{addEventListener:(event,callback)=>listeners[event]=callback}},
    openInventoryImageViewer:item=>{calls.push(item);viewerImage.src=item.imageUrl;}
  });
  vm.runInContext(source.slice(start,end),c);c.openAccountProfilePhoto();
  assert.equal(calls.length,1);assert.equal(calls[0].imageUrl,photo.src);assert.equal(calls[0].name,'Ana Cruz');
  assert.equal(viewerImage.style.width,'min(420px,80vw)');listeners.close();assert.equal(viewerImage.src,undefined);
  c.accountProfileState.mode='edit';c.openAccountProfilePhoto();assert.equal(calls.length,1);
  c.accountProfileState.mode='preview';hasPhoto=false;c.openAccountProfilePhoto();assert.equal(calls.length,1);
  hasPhoto=true;c.currentEmployee.dashboardToken='another-account';c.openAccountProfilePhoto();assert.equal(calls.length,1);
});
