const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {randomUUID,createHash}=require('node:crypto');
function fixture() {
  const headers=['Employee ID','First Name','Last Name','PIN','Role','Access Level','Active','Username',
    'Profile Full Name','Display Name','Email','Birthday','Contact Number','Address','Emergency Contact Name',
    'Emergency Contact Relationship','Emergency Contact Number','Date Hired','Profile Photo','Profile Updated At','Profile Version','Profile Photo File ID'];
  const rows=[headers,['A1','Ana','Cruz','old-password-123','Cashier',3,true,'anacruz3@ys.sys',...Array(14).fill('')],
    ['B2','Bea','Reyes','other-password','Owner',0,true,'beareyes0@ys.sys',...Array(14).fill('')]];
  rows[1][17]='2026-01-10';
  const props=new Map(),cache=new Map(),writes=[],files=new Map(),drive={reads:0,uploads:0,unavailable:false},stats={sheetReads:0};let locked=false;
  const iterator=items=>{let index=0;return {hasNext:()=>index<items.length,next:()=>items[index++]};};
  const folder={getFilesByName:name=>iterator([...files.values()].filter(file=>file.name===name)),createFile(blob){
    if(drive.unavailable)throw Error('Drive unavailable');drive.uploads++;
    const id='profile-file-'+drive.uploads;
    const file={id,name:blob.name,bytes:blob.bytes,parent:'1XiSl0YzkEPBEM4Vp2Q9iibhdmLdX1xkn',
      getId(){return this.id;},getName(){return this.name;},getMimeType:()=> 'image/jpeg',isTrashed:()=>false,
      getSize(){return this.bytes.length;},getParents(){return iterator([{getId:()=>this.parent}]);},getBlob(){return {getBytes:()=>this.bytes};}};
    files.set(id,file);return file;
  }};
  const fingerprint=row=>JSON.stringify(row.slice(0,7))+String(props.get('account-revision:'+row[0]) || '');
  cache.set('dashboard:session-a',JSON.stringify({fingerprint:fingerprint(rows[1]),expiresAt:Date.now()+60000}));
  const sheet={getDataRange:()=>({getValues:()=>{stats.sheetReads++;return rows.map(row=>row.slice());}}),getRange(r,c){return {
    setNumberFormat(){return this;},setValue(value){assert(locked);writes.push([r,c]);rows[r-1][c-1]=String(value).replace(/^'/,'');return this;}
  };}};
  const c=vm.createContext({console,Date,Map,Number,ACCOUNT_SESSION_SECONDS:21600,ACCOUNT_SESSION_EXPIRED_MESSAGE:'Session expired',
    ACCESS_REQUEST_CONTEXT_:{actor:{id:'A1'},sessionToken:'session-a'},SHEETS:{EMPLOYEES:'Employees'},
    assertAppRequest_(){if(!c.ACCESS_REQUEST_CONTEXT_)throw Error('Authentication required');},employeeAuthFingerprint_:fingerprint,
    employeeRoleKey_:account=>String(account.role).toUpperCase(),
    SpreadsheetApp:{getActiveSpreadsheet:()=>({getId:()=> 'test-spreadsheet',getSheetByName:()=>sheet}),flush(){}},
    Utilities:{getUuid:randomUUID,formatDate:date=>new Date(date).toISOString().slice(0,10),base64Decode:s=>Buffer.from(s,'base64'),
      base64Encode:bytes=>Buffer.from(bytes).toString('base64'),base64EncodeWebSafe:bytes=>Buffer.from(bytes).toString('base64url'),
      DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(algorithm,value)=>createHash(algorithm).update(value).digest(),newBlob:(bytes,mime,name)=>({bytes,mime,name})},
    DriveApp:{getFileById:id=>{drive.reads++;if(drive.unavailable)throw Error('Drive unavailable');if(!files.has(id))throw Error('Missing photo');return files.get(id);},getFolderById:()=>{if(drive.unavailable)throw Error('Drive unavailable');return folder;}},
    CacheService:{getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k),setProperty:(k,v)=>props.set(k,v)})},
    LockService:{getScriptLock:()=>({waitLock(){assert(!locked);locked=true;},releaseLock(){locked=false;}})},
    dashboardDate_(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||s<'1900-01-01'||new Date(s).toISOString().slice(0,10)!==s)throw Error('Invalid date');},
    auditLiteral_:s=>/^[=+\-@\s']/.test(s)?"'"+s:s,
    revokeDashboardSession:token=>cache.delete('dashboard:'+token)
  });
  vm.runInContext(fs.readFileSync('Backend/Employee.js','utf8'),c);
  vm.runInContext(fs.readFileSync('Backend/EmployeeProfile.js','utf8'),c);
  vm.runInContext(fs.readFileSync('Backend/EmployeeProfilePhotos.js','utf8'),c);
  const payload=()=>({fullName:'Ana Maria Cruz',displayName:'Ana',email:'ana@example.com',birthday:'1998-04-10',contact:'+639123456789',address:'Sample address',emergencyName:'Luz',relationship:'Mother',emergencyPhone:'09123456789',photo:'',version:c.getMyProfile().profile.version});
  return {c,rows,writes,cache,props,payload,fingerprint,files,drive,stats};
}
test('profile read returns only the signed-in employee, with identity and hire date read-only',()=>{
  const {c}=fixture(),result=c.getMyProfile();
  assert.equal(result.profile.fullName,'Ana Cruz');assert.equal(result.profile.username,'anacruz3@ys.sys');assert.equal(result.profile.dateHired,'2026-01-10');
  assert(!JSON.stringify(result).includes('old-password'));assert(!JSON.stringify(result).includes('Bea'));
  c.ACCESS_REQUEST_CONTEXT_=null;assert.throws(()=>c.getMyProfile(),/Authentication/);
});
test('profile writes preserve login identity, role, access, other accounts, and all historical data',()=>{
  const {c,rows,payload,writes}=fixture(),identity=rows[1].slice(0,8),other=rows[2].slice();
  const data=payload();Object.assign(data,{employeeId:'B2',role:'Owner',dateHired:'2000-01-01',username:'forged'});
  const result=c.saveMyProfile(data);
  assert.deepEqual(rows[1].slice(0,8),identity);assert.deepEqual(rows[2],other);assert.equal(rows[1][17],'2026-01-10');
  assert.equal(result.profile.fullName,'Ana Maria Cruz');assert.equal(result.profile.contact,'+639123456789');
  assert.equal(result.profile.role,'CASHIER');assert(writes.every(([row,col])=>row===2&&col>=9&&col!==18));
  assert.throws(()=>c.saveMyProfile(data),/profile changed/);
});
test('profile fields reject invalid dates, email, oversized content, and remote image URLs',()=>{
  const {c,payload,writes}=fixture();
  for(const change of [{birthday:'2026-02-31'},{birthday:'2099-01-01'},{email:'invalid'},{address:'x'.repeat(301)},{photo:'https://example.com/photo.jpg'},{fullName:''}])assert.throws(()=>c.saveMyProfile({...payload(),...change}));
  assert.equal(writes.length,0);
});
test('sheet text is escaped as literal text instead of executable formulas',()=>{
  const {c,payload,rows}=fixture();c.saveMyProfile({...payload(),address:'=IMPORTXML("bad","bad")'});assert.equal(rows[1][13],'=IMPORTXML("bad","bad")');
});
test('password updates require the current password and a matching new password',()=>{
  const {c,rows,writes}=fixture();
  for(const data of [
    {currentPassword:'wrong',newPassword:'new-password-123',confirmPassword:'new-password-123'},
    {currentPassword:'old-password-123',newPassword:'short',confirmPassword:'short'},
    {currentPassword:'old-password-123',newPassword:'new-password-123',confirmPassword:'different'},
    {currentPassword:'old-password-123',newPassword:'old-password-123',confirmPassword:'old-password-123'}])assert.throws(()=>c.changeMyPassword(data));
  assert.equal(writes.length,0);assert.equal(rows[1][3],'old-password-123');
});
test('password change invalidates all old fingerprints and revokes the current session',()=>{
  const {c,rows,props,cache,fingerprint}=fixture(),before=fingerprint(rows[1]),other=rows[2].slice();
  const result=c.changeMyPassword({currentPassword:'old-password-123',newPassword:'new-password-123',confirmPassword:'new-password-123',employeeId:'B2'});
  assert(result.signInAgain);assert.equal(rows[1][3],'new-password-123');assert.deepEqual(rows[2],other);
  assert(props.has('account-revision:A1'));assert.notEqual(fingerprint(rows[1]),before);assert(!cache.has('dashboard:session-a'));
  assert.throws(()=>c.getMyProfile(),/Session expired/);
});
test('stale or expired sessions and ambiguous/missing schema cannot write',()=>{
  const {c,cache,payload,rows,writes}=fixture();const data=payload();
  cache.set('dashboard:session-a',JSON.stringify({fingerprint:'old',expiresAt:Date.now()+60000}));assert.throws(()=>c.saveMyProfile(data),/Session expired/);
  assert.equal(writes.length,0);
  const fresh=fixture();fresh.rows[0][8]='Unknown';assert.throws(()=>fresh.c.getMyProfile(),/columns need setup/);
  rows[1][6]=false;assert.throws(()=>c.getMyProfile(),/active, unique/);
});
test('profile login summary supplies safe display data without returning personal contacts',()=>{
  const {c,rows,payload}=fixture();c.saveMyProfile(payload());
  const account=c.employeeLoginAccounts_(rows)[0],summary=c.employeeProfileLogin_(account,rows[0]);
  assert.equal(summary.displayName,'Ana');assert.equal(summary.profileFullName,'Ana Maria Cruz');assert(!('birthday' in summary));assert(!('contact' in summary));
  assert.equal(account.username,'anacruz3@ys.sys');
});
const testPhoto='data:image/jpeg;base64,/9j/AA==';
test('photo uploads use the specified folder and store a file ID instead of image bytes in the sheet',()=>{
  const {c,rows,payload,files,drive}=fixture();
  const result=c.saveMyProfile({...payload(),photo:testPhoto,photoChanged:true,photoFileId:'forged-file-123'});
  assert.equal(drive.uploads,1);assert.equal(rows[1][18],'');assert.equal(rows[1][21],'profile-file-1');
  assert.equal(files.get(rows[1][21]).parent,'1XiSl0YzkEPBEM4Vp2Q9iibhdmLdX1xkn');
  assert.equal(result.profile.photo,testPhoto);assert.equal(rows[2][21],'');
});
test('legacy inline photos render during rollout and move to Drive on the next save',()=>{
  const {c,rows,payload,drive}=fixture();rows[1][18]=testPhoto;
  assert.equal(c.getMyProfile().profile.photo,testPhoto);
  c.saveMyProfile({...payload(),photo:'',photoChanged:false});
  assert.equal(rows[1][18],'');assert.equal(rows[1][21],'profile-file-1');assert.equal(drive.uploads,1);
});
test('cached photo reads avoid repeated Drive calls and retries reuse an existing content-addressed file',()=>{
  const {c,cache,drive,payload}=fixture();
  const id=c.employeeProfilePhotoStore_(testPhoto,'A1');assert.equal(drive.uploads,1);
  cache.delete(c.employeeProfilePhotoKey_(id,'A1'));
  assert.equal(c.employeeProfilePhotoRead_(id,'','A1'),testPhoto);const reads=drive.reads;
  assert.equal(c.employeeProfilePhotoRead_(id,'','A1'),testPhoto);assert.equal(drive.reads,reads);
  assert.equal(c.employeeProfilePhotoStore_(testPhoto,'A1'),id);assert.equal(drive.uploads,1);
  c.saveMyProfile({...payload(),photo:testPhoto});assert.equal(drive.uploads,1);
});
test('metadata-only edits retain the current photo ID when the client has not changed the photo',()=>{
  const {c,rows,payload,drive}=fixture();c.saveMyProfile({...payload(),photo:testPhoto,photoChanged:true});
  const id=rows[1][21];drive.unavailable=true;
  const data=payload();c.saveMyProfile({...data,displayName:'Annie',photo:'',photoChanged:false});
  assert.equal(rows[1][21],id);assert.equal(rows[1][9],'Annie');assert.equal(drive.uploads,1);
});
test('removing a photo clears the reference while retaining the original Drive file',()=>{
  const {c,rows,payload,files}=fixture();c.saveMyProfile({...payload(),photo:testPhoto,photoChanged:true});
  const id=rows[1][21];c.saveMyProfile({...payload(),photo:'',photoChanged:true});
  assert.equal(rows[1][21],'');assert.equal(rows[1][18],'');assert(files.has(id));assert.equal(c.getMyProfile().profile.photo,'');
});
test('missing, moved, or another employee photo cannot be served as the current employee photo',()=>{
  const {c,files,cache}=fixture();const id=c.employeeProfilePhotoStore_(testPhoto,'A1');cache.delete(c.employeeProfilePhotoKey_(id,'A1'));
  assert.equal(c.employeeProfilePhotoRead_(id,'','B2'),'');files.get(id).parent='another-folder';
  assert.equal(c.employeeProfilePhotoRead_(id,'','A1'),'');assert.equal(c.employeeProfilePhotoRead_('invalid-url','', 'A1'),'');
});
test('Drive upload failures leave the employee record and photo reference unchanged',()=>{
  const {c,rows,payload,writes,drive}=fixture(),before=JSON.stringify(rows);drive.unavailable=true;
  assert.throws(()=>c.saveMyProfile({...payload(),photo:testPhoto,photoChanged:true}),/Drive unavailable/);
  assert.equal(writes.length,0);assert.equal(JSON.stringify(rows),before);
});
test('a late inline photo from the old release wins over a stale Drive reference during migration',()=>{
  const {c,rows,payload,drive}=fixture();c.saveMyProfile({...payload(),photo:testPhoto,photoChanged:true});
  const oldId=rows[1][21],newer='data:image/jpeg;base64,/9j/AQ==';rows[1][18]=newer;
  assert.equal(c.getMyProfile().profile.photo,newer);
  c.saveMyProfile({...payload(),photo:'',photoChanged:false});
  assert.notEqual(rows[1][21],oldId);assert.equal(rows[1][18],'');assert.equal(drive.uploads,2);assert.equal(c.getMyProfile().profile.photo,newer);
});
test('opt-in login includes the authenticated profile using the existing single employee read',()=>{
  const {c,rows,stats}=fixture();rows[1][12]='09123456789';rows[1][13]='Home address';
  c.createDashboardSession_=()=> 'new-login-token';c.accountPermissions_=()=>({});c.accessOperationPermissions_=()=>({});c.employeeCanAuthorizeManager_=()=>false;
  const result=c.verifyEmployee('anacruz3@ys.sys','old-password-123','',true);
  assert(result.success);assert.equal(stats.sheetReads,1);assert.equal(result.accountProfile.employeeId,'A1');
  assert.equal(result.accountProfile.contact,'09123456789');assert.equal(result.accountProfile.address,'Home address');
  assert(!JSON.stringify(result).includes('old-password-123'));
  const legacy=c.verifyEmployee('anacruz3@ys.sys','old-password-123');assert(!legacy.accountProfile);
  const failed=c.verifyEmployee('anacruz3@ys.sys','wrong','',true);assert.equal(failed.success,false);assert(!failed.accountProfile);
});
test('cashier sign-in passes the profile preload opt-in without starting a second shift or profile read',()=>{
  const {c,stats}=fixture();let starts=0;
  c.createDashboardSession_=()=> 'cashier-token';c.accountPermissions_=()=>({});c.accessOperationPermissions_=()=>({});c.employeeCanAuthorizeManager_=()=>false;
  c.dashboardEmployee_=()=>({id:'A1'});c.attachCashierSession_=()=>{};
  c.startManagedCashierShift_=()=>{starts++;return {success:true,reportId:'CR-1',status:'OPEN'};};
  const result=c.loginAndStartShift('anacruz3@ys.sys','old-password-123',1000,'handover-version',true);
  assert(result.success);assert.equal(result.employee.accountProfile.employeeId,'A1');assert.equal(starts,1);assert.equal(stats.sheetReads,1);
});
