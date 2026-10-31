/* ==========================================================
   PRODUCTION → DEVELOPMENT SHEET MIRROR

   One-way copy. Development is backed up before replacement.
========================================================== */

const PRODUCTION_SPREADSHEET_ID = "1PXY61BjpfR9cuubzPOKCBOSj2DgAfkiXCqbFIrIw_9c";
const DEVELOPMENT_SPREADSHEET_ID = "1xnHBsGsoMmcBIoRwEjX0paf5R39A-s2Tnc6m1lkoOQU";

function syncProductionToDevelopmentFromMenu() {
  const ui = SpreadsheetApp.getUi();
  const prompt = ui.prompt(
    "Sync Production to Dev",
    "This replaces every Dev sheet after a Drive backup. Enter Manager PIN.",
    ui.ButtonSet.OK_CANCEL
  );
  if (prompt.getSelectedButton() !== ui.Button.OK) return;

  const auth = verifyManagerPin(prompt.getResponseText());
  if (!auth || !auth.success) {
    ui.alert(auth && auth.message ? auth.message : "Manager authorization failed.");
    return;
  }

  const result = syncProductionToDevelopment_();
  ui.alert(
    "Dev synchronized. " + result.sheetCount + " sheets copied.\n" +
    "Backup: " + result.backupName
  );
}

function syncProductionToDevelopment_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const source = SpreadsheetApp.getActiveSpreadsheet();
    if (source.getId() !== PRODUCTION_SPREADSHEET_ID) {
      throw new Error("Run Production to Dev sync from Production spreadsheet only.");
    }

    const destination = SpreadsheetApp.openById(DEVELOPMENT_SPREADSHEET_ID);
    const sourceSheets = source.getSheets();
    if (!sourceSheets.length) throw new Error("Production has no sheets to copy.");

    const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd-HHmmss");
    const copied = sourceSheets.map(function(sourceSheet, index) {
      const copy = sourceSheet.copyTo(destination);
      copy.setName("__SYNC_TMP_" + stamp + "_" + index);
      return { sheet: copy, name: sourceSheet.getName() };
    });

    const backupName = "YourStyle Dev Backup " + stamp;
    DriveApp.getFileById(DEVELOPMENT_SPREADSHEET_ID).makeCopy(backupName);

    destination.getSheets().forEach(function(sheet) {
      if (copied.some(function(copy) { return copy.sheet.getSheetId() === sheet.getSheetId(); })) return;
      destination.deleteSheet(sheet);
    });

    copied.forEach(function(copy, index) {
      copy.sheet.setName(copy.name);
      destination.setActiveSheet(copy.sheet);
      destination.moveActiveSheet(index + 1);
    });
    SpreadsheetApp.flush();

    return { success: true, sheetCount: copied.length, backupName: backupName };
  } finally {
    lock.releaseLock();
  }
}
