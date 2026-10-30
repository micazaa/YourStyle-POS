const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {randomUUID}=require('node:crypto');

function accounts(extra=[]) {
  const rows=[['Employee ID','First Name','Last Name','Password','Role','Access Level','Active'],
    ['M1','Mica','Tambalong','secret','Manager',1,true],
    ['B2','Bea','Alcozero','cash-pass','Cashier',2,true],...extra];
  const cache=new Map(),issued=[],writes=[];
  const sheet={getDataRange:()=>({getValues:()=>rows.map(row=>row.slice())}),getMaxColumns:()=>20,
    getRange(r,c,h,w){return {setValues(values){writes.push({r,c,h,w});for(let i=0;i<h;i++)for(let j=0;j<w;j++)rows[r-1+i][c-1+j]=values[i][j];}};}};
  const c=vm.createContext({console,Map,Number,
    SHEETS:{EMPLOYEES:'Employees'},
    SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>sheet}),flush(){}},
    Utilities:{getUuid:randomUUID},
    CacheService:{getScriptCache:()=>({put:(k,v)=>cache.set(k,v),get:k=>cache.get(k),remove:k=>cache.delete(k)})},
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
    createDashboardSession_(id,name){issued.push({id,name});return 'session-'+id;},
    getLatestPettyHandover:()=>({success:true,received:1000}),
  });
  vm.runInContext(fs.readFileSync('Backend/Employee.js','utf8'),c);
  return {c,rows,issued,writes};
}

test('usernames authenticate case-insensitively while preserving employee identity, passwords and legacy reauthentication',()=>{
  const {c,rows,issued,writes}=accounts(),before=JSON.stringify(rows);
  const list=c.getEmployees();
  assert.equal(list[0].username,'micatambalong1@ys.sys');
  assert.equal(list[1].username,'beaalcozero2@ys.sys');
  assert.equal('row' in list[0],false);assert.equal('password' in list[0],false);
  const result=c.verifyEmployee(' MICATAMBALONG1@YS.SYS ','secret');
  assert.equal(result.success,true);assert.equal(result.fullName,'Mica Tambalong');
  assert.equal(result.employeeId,'M1');assert.equal(result.accessLevel,1);
  assert.ok(result.inventoryManagerToken);
  assert.equal(c.verifyEmployee('Mica Tambalong','secret').success,true);
  assert.equal(issued[0].name,'Mica Tambalong');
  assert.equal(c.getLoginSetup().employees[0].username,'micatambalong1@ys.sys');
  assert.equal(writes.length,0);assert.equal(JSON.stringify(rows),before);
});

test('typing a different access suffix cannot grant a role; access changes invalidate the old username',()=>{
  const {c,rows,issued}=accounts();
  for(const name of ['micatambalong0@ys.sys','beaalcozero1@ys.sys'])
    assert.equal(c.verifyEmployee(name,'cash-pass').success,false);
  assert.equal(c.verifyEmployee('micatambalong1@ys.sys','wrong').success,false);
  assert.equal(c.verifyEmployee('micatambalong1@ys.sys','').success,false);
  assert.equal(issued.length,0);
  rows[1][5]=2;
  assert.equal(c.verifyEmployee('micatambalong1@ys.sys','secret').success,false);
  const changed=c.verifyEmployee('micatambalong2@ys.sys','secret');
  assert.equal(changed.success,true);assert.equal(changed.accessLevel,2);assert.equal(changed.inventoryManagerToken,'');
  rows[1][6]=false;
  assert.equal(c.verifyEmployee('micatambalong2@ys.sys','secret').success,false);
});

test('name punctuation and accents normalize, duplicates use middle initials or stable employee IDs',()=>{
  const {c,rows}=accounts([
    ['M2','Míca','Tambalong','other-pass','Manager',1,true],
    ['J1','José Luis','Dela-Cruz', 'pw','Cashier',2,true],
  ]);
  let list=c.getEmployees();
  assert.equal(list[0].username,'micatambalong.m11@ys.sys');
  assert.equal(list[2].username,'micatambalong.m21@ys.sys');
  assert.equal(list[3].username,'joseluisdelacruz2@ys.sys');
  assert.equal(c.verifyEmployee(list[2].username,'secret').success,false);
  assert.equal(c.verifyEmployee(list[2].username,'other-pass').employeeId,'M2');
  rows[0][7]='Middle Name';rows[1][7]='Anne';rows[3][7]='Rose';
  list=c.getEmployees();assert.equal(list[0].username,'micaatambalong1@ys.sys');assert.equal(list[2].username,'micartambalong1@ys.sys');
  rows[3][7]='Amy';list=c.getEmployees();
  assert.equal(list[0].username,'micatambalong.m11@ys.sys');assert.equal(list[2].username,'micatambalong.m21@ys.sys');
});

test('ambiguous identities and invalid access levels never authenticate or issue sessions',()=>{
  const {c,rows,issued}=accounts([['M1','Mica','Tambalong','secret','Manager',1,true]]);
  assert.equal(c.getEmployees()[0].username,'');
  assert.equal(c.verifyEmployee('Mica Tambalong','secret').success,false);
  assert.equal(c.verifyEmployee('micatambalong.m11@ys.sys','secret').success,false);
  for(const level of ['',null,-1,1.5,'manager']) {
    rows[2][5]=level;
    assert.equal(c.verifyEmployee('Bea Alcozero','cash-pass').success,false);
  }
  assert.equal(issued.length,0);
});

test('sheet menu writes a refreshable Username projection without changing credentials or employee identity',()=>{
  const {c,rows,writes}=accounts(),before=rows.map(row=>row.slice(0,7));
  c.refreshEmployeeUsernames_();
  assert.equal(rows[0][7],'Username');assert.equal(rows[1][7],'micatambalong1@ys.sys');
  assert.deepEqual(rows.map(row=>row.slice(0,7)),before);
  rows[1][5]=2;c.refreshEmployeeUsernames_();assert.equal(rows[1][7],'micatambalong2@ys.sys');
  rows[1][7]='beaalcozero1@ys.sys';
  assert.equal(c.verifyEmployee('beaalcozero1@ys.sys','secret').success,false);
  assert.equal(c.verifyEmployee('micatambalong2@ys.sys','secret').success,true);
  assert.ok(writes.every(write=>write.c===8));
});

test('username projection refuses occupied or unlabelled columns, and uses a separate existing Username header',()=>{
  const {c,rows,writes}=accounts();rows[0][7]='Other business data';rows[1][7]='Keep me';
  assert.throws(()=>c.refreshEmployeeUsernames_(),/contains other data/);assert.equal(writes.length,0);
  rows[0][7]='';assert.throws(()=>c.refreshEmployeeUsernames_(),/contains other data/);assert.equal(writes.length,0);
  rows[0][8]='Username';c.refreshEmployeeUsernames_();
  assert.equal(rows[1][7],'Keep me');assert.equal(rows[1][8],'micatambalong1@ys.sys');
  assert.ok(writes.every(write=>write.c===9));
});
