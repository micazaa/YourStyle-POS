// Profile fields are additive. The original A:H employee identity and login columns stay intact.
const EMPLOYEE_PROFILE_COLUMNS_ = {
  fullName:'Profile Full Name', displayName:'Display Name', email:'Email', birthday:'Birthday',
  contact:'Contact Number', address:'Address', emergencyName:'Emergency Contact Name',
  relationship:'Emergency Contact Relationship', emergencyPhone:'Emergency Contact Number',
  dateHired:'Date Hired', photo:'Profile Photo', updatedAt:'Profile Updated At', version:'Profile Version',
  photoFileId:'Profile Photo File ID'
};
function employeeProfileRecord_() {
  assertAppRequest_();
  const actor=ACCESS_REQUEST_CONTEXT_.actor;
  if (!actor || !actor.id) throw new Error('Sign in to view your profile.');
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.EMPLOYEES);
  if (!sheet) throw new Error('Employees sheet not found.');
  const data=sheet.getDataRange().getValues();
  const matches=employeeLoginAccounts_(data).map((account,index)=>({account:account,index:index+2})).filter(item=>String(item.account.id)===String(actor.id));
  if (matches.length!==1 || !matches[0].account.active) throw new Error('An active, unique employee account is required.');
  const raw=CacheService.getScriptCache().get('dashboard:'+String(ACCESS_REQUEST_CONTEXT_.sessionToken || ''));
  const session=raw ? JSON.parse(raw) : null;
  if(!session || session.fingerprint!==employeeAuthFingerprint_(matches[0].account.row) || Date.now()>=Number(session.expiresAt || 0))
    throw new Error(ACCOUNT_SESSION_EXPIRED_MESSAGE);
  const columns={};
  Object.entries(EMPLOYEE_PROFILE_COLUMNS_).forEach(([key,label])=>{
    const indexes=data[0].map((header,index)=>String(header).trim().toLowerCase()===label.toLowerCase()?index:-1).filter(index=>index>=0);
    if(indexes.length!==1 || indexes[0]<8) throw new Error('Employee profile columns need setup. Contact an Owner.');
    columns[key]=indexes[0];
  });
  return {sheet:sheet,columns:columns,account:matches[0].account,row:matches[0].index};
}
function employeeProfileValue_(value, dateOnly) {
  if (value instanceof Date) return Utilities.formatDate(value,'Asia/Manila',dateOnly?'yyyy-MM-dd':"yyyy-MM-dd'T'HH:mm:ssXXX");
  return String(value==null?'':value).trim();
}
function employeeProfileResult_(record) {
  return {success:true,profile:employeeProfileData_(record.account,record.columns)};
}
function employeeProfileData_(account,columns) {
  const profile={};
  Object.keys(EMPLOYEE_PROFILE_COLUMNS_).forEach(key=>{
    profile[key]=employeeProfileValue_(account.row[columns[key]],['birthday','dateHired'].includes(key));
  });
  profile.fullName=profile.fullName || account.fullName;
  profile.displayName=profile.displayName || String(account.firstName || account.fullName);
  profile.username=account.username;
  profile.employeeId=String(account.id);
  profile.role=employeeRoleKey_(account);
  profile.photo=employeeProfilePhotoRead_(profile.photoFileId,profile.photo,String(account.id));
  return profile;
}
function employeeProfilePhotoValid_(photo) {
  if (!photo) return true;
  if (photo.length>40000 || !/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/=]+$/.test(photo)) return false;
  try { return Utilities.base64Decode(photo.split(',')[1]).length<=30000; } catch(error) {return false;}
}
function getMyProfile() { return employeeProfileResult_(employeeProfileRecord_()); }
function employeeProfileLogin_(account, headers, includeProfile) {
  if(includeProfile===true) {
    const columns={};
    Object.entries(EMPLOYEE_PROFILE_COLUMNS_).forEach(([key,label])=>{
      columns[key]=headers.findIndex(header=>String(header).trim().toLowerCase()===label.toLowerCase());
    });
    if(Object.values(columns).every(index=>index>=8)) {
      // Reuse the authenticated login row. No additional Sheets request is needed for preview.
      const profile=employeeProfileData_(account,columns);
      return {displayName:profile.displayName,profileFullName:profile.fullName,photo:profile.photo,accountProfile:profile};
    }
  }
  const read=label=>{
    const index=headers.findIndex(header=>String(header).trim().toLowerCase()===label.toLowerCase());
    return index>=8 ? employeeProfileValue_(account.row[index]) : '';
  };
  const photo=employeeProfilePhotoRead_(read(EMPLOYEE_PROFILE_COLUMNS_.photoFileId),read(EMPLOYEE_PROFILE_COLUMNS_.photo),String(account.id));
  return {displayName:read(EMPLOYEE_PROFILE_COLUMNS_.displayName),profileFullName:read(EMPLOYEE_PROFILE_COLUMNS_.fullName),
    photo:photo};
}
function saveMyProfile(payload) {
  assertAppRequest_();
  payload=payload || {};
  const limits={fullName:100,displayName:60,email:120,birthday:10,contact:30,address:300,emergencyName:100,relationship:40,emergencyPhone:30,photo:40000};
  const clean={};
  Object.keys(limits).forEach(key=>{
    if(typeof payload[key]!=='string') throw new Error('Complete the profile fields before saving.');
    clean[key]=payload[key].trim();
    if(clean[key].length>limits[key] || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(clean[key])) throw new Error('Check the length and format of your '+key+'.');
  });
  if(!clean.fullName || !clean.displayName) throw new Error('Full name and display name are required.');
  if(clean.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email)) throw new Error('Enter a valid email address.');
  if(clean.birthday) {
    dashboardDate_(clean.birthday);
    if(clean.birthday>Utilities.formatDate(new Date(),'Asia/Manila','yyyy-MM-dd')) throw new Error('Birthday cannot be in the future.');
  }
  if(!employeeProfilePhotoValid_(clean.photo)) throw new Error('Choose a smaller JPG profile photo.');
  const lock=LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const record=employeeProfileRecord_();
    if(String(payload.version || '')!==employeeProfileValue_(record.account.row[record.columns.version])) throw new Error('Your profile changed. Close and reopen it before saving.');
    const previousId=employeeProfileValue_(record.account.row[record.columns.photoFileId]);
    const previousInline=employeeProfileValue_(record.account.row[record.columns.photo]);
    if(payload.photoChanged===false) {
      clean.photoFileId=previousId;
      if(employeeProfilePhotoValid_(previousInline) && previousInline)
        clean.photoFileId=employeeProfilePhotoStore_(previousInline,String(record.account.id));
    } else if(clean.photo) {
      const previous=previousId ? employeeProfilePhotoRead_(previousId,'',String(record.account.id)) : '';
      clean.photoFileId=previousId && previous===clean.photo ? previousId : employeeProfilePhotoStore_(clean.photo,String(record.account.id));
    } else {
      if(previousId && payload.photoChanged!==true && !employeeProfilePhotoRead_(previousId,'',String(record.account.id)))
        throw new Error('Your photo could not be loaded. Reopen your profile before saving.');
      clean.photoFileId='';
    }
    // Drive owns image bytes. The old cell remains a read fallback for pre-migration records only.
    clean.photo='';
    clean.updatedAt=new Date().toISOString(); clean.version=Utilities.getUuid();
    // Write only allowlisted profile cells; never accept a target employee ID, role, hire date or username.
    Object.keys(clean).forEach(key=>{
      record.sheet.getRange(record.row,record.columns[key]+1).setNumberFormat('@').setValue(auditLiteral_(clean[key]));
      record.account.row[record.columns[key]]=clean[key];
    });
    SpreadsheetApp.flush();
    return employeeProfileResult_(record);
  } finally {lock.releaseLock();}
}
function changeMyPassword(payload) {
  assertAppRequest_();
  payload=payload || {};
  const current=String(payload.currentPassword || ''), next=String(payload.newPassword || '');
  if(!current || next.length<12 || next.length>128 || next!==next.trim()) throw new Error('Use a new password of 12–128 characters without leading or trailing spaces.');
  if(next!==payload.confirmPassword) throw new Error('The new passwords do not match.');
  if(next===current) throw new Error('Choose a password different from the current password.');
  const lock=LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const record=employeeProfileRecord_();
    if(String(record.account.row[3] || '').trim()!==current) throw new Error('Current password is incorrect.');
    record.sheet.getRange(record.row,4).setNumberFormat('@').setValue(auditLiteral_(next));
    PropertiesService.getScriptProperties().setProperty('account-revision:'+String(record.account.id),Utilities.getUuid());
    SpreadsheetApp.flush();
    // End all existing sessions. The cashier shift itself remains open for normal sign-in recovery.
    revokeDashboardSession(ACCESS_REQUEST_CONTEXT_.sessionToken);
    return {success:true,signInAgain:true};
  } finally {lock.releaseLock();}
}
