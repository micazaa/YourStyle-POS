const EMPLOYEE_PHOTO_FOLDER_ID_='1XiSl0YzkEPBEM4Vp2Q9iibhdmLdX1xkn';
function employeeProfilePhotoPrefix_(employeeId) {
  return 'YS-'+SpreadsheetApp.getActiveSpreadsheet().getId()+'-'+String(employeeId).replace(/[^a-zA-Z0-9_-]/g,'_')+'-';
}
function employeeProfilePhotoKey_(fileId,employeeId) {
  return 'profile-photo:'+SpreadsheetApp.getActiveSpreadsheet().getId()+':'+String(employeeId)+':'+fileId;
}
function employeeProfilePhotoFile_(fileId,employeeId) {
  if(!/^[a-zA-Z0-9_-]{10,150}$/.test(fileId))throw new Error('Invalid profile photo reference.');
  const file=DriveApp.getFileById(fileId);
  if(file.isTrashed() || file.getMimeType()!=='image/jpeg' || file.getSize()>30000 ||
    !file.getName().startsWith(employeeProfilePhotoPrefix_(employeeId)))throw new Error('Profile photo is unavailable.');
  const parents=file.getParents();let inFolder=false;
  while(parents.hasNext())if(parents.next().getId()===EMPLOYEE_PHOTO_FOLDER_ID_)inFolder=true;
  if(!inFolder)throw new Error('Profile photo is outside the employee folder.');
  return file;
}
function employeeProfilePhotoRead_(fileId,legacy,employeeId) {
  const fallback=employeeProfilePhotoValid_(legacy)?legacy:'';
  // A still-running pre-migration request may have written a newer inline photo.
  if(fallback)return fallback;
  if(!fileId)return fallback;
  const cache=CacheService.getScriptCache(),key=employeeProfilePhotoKey_(fileId,employeeId);
  try {
    const cached=cache.get(key);
    if(cached && employeeProfilePhotoValid_(cached))return cached;
    const file=employeeProfilePhotoFile_(fileId,employeeId);
    const photo='data:image/jpeg;base64,'+Utilities.base64Encode(file.getBlob().getBytes());
    if(!employeeProfilePhotoValid_(photo))return fallback;
    try {cache.put(key,photo,21600);}catch(cacheError){/* A cache outage must not hide a valid photo. */}
    return photo;
  }catch(error){
    console.warn('Profile photo temporarily unavailable; using the account fallback.');
    return fallback;
  }
}
function employeeProfilePhotoStore_(photo,employeeId) {
  if(!photo || !employeeProfilePhotoValid_(photo))throw new Error('Choose a valid small JPG profile photo.');
  const hash=Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,photo)).replace(/=+$/,'');
  const name=employeeProfilePhotoPrefix_(employeeId)+hash+'.jpg';
  const folder=DriveApp.getFolderById(EMPLOYEE_PHOTO_FOLDER_ID_);
  // Content-addressed names make retries safe. Verify bytes before reusing an existing file.
  const matches=folder.getFilesByName(name);
  while(matches.hasNext()) {
    const existing=matches.next();
    try {
      const file=employeeProfilePhotoFile_(existing.getId(),employeeId);
      const bytes='data:image/jpeg;base64,'+Utilities.base64Encode(file.getBlob().getBytes());
      if(bytes===photo)return file.getId();
    }catch(error){/* Ignore an unrelated/invalid file with the same name. */}
  }
  const blob=Utilities.newBlob(Utilities.base64Decode(photo.split(',')[1]),'image/jpeg',name);
  const file=folder.createFile(blob),key=employeeProfilePhotoKey_(file.getId(),employeeId);
  // Keep the folder's existing sharing; never publish or change permissions from a profile save.
  try {CacheService.getScriptCache().put(key,photo,21600);}catch(cacheError){/* Reading Drive remains available. */}
  return file.getId();
}
