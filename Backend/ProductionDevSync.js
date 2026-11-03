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
    "This refreshes Dev data after a Drive backup. Existing tab names and IDs stay unchanged. Enter Manager PIN.",
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
    const backupName = "YourStyle Dev Backup " + stamp;
    // Back up the actual Dev workbook before adding temporary copies or changing data.
    DriveApp.getFileById(DEVELOPMENT_SPREADSHEET_ID).makeCopy(backupName);

    // Create missing names first. Existing tabs retain their IDs, formulas, and links.
    const targets = sourceSheets.map(function(sourceSheet) {
      return destination.getSheetByName(sourceSheet.getName()) || destination.insertSheet(sourceSheet.getName());
    });
    const staged = [];
    try {
      sourceSheets.forEach(function(sourceSheet, index) {
        const copy = sourceSheet.copyTo(destination);
        staged.push(copy);
        copy.setName("__SYNC_STAGE_" + stamp + "_" + index);
      });
      sourceSheets.forEach(function(sourceSheet, index) {
        const target = targets[index], copy = staged[index];
        const sourceRange = sourceSheet.getDataRange();
        const rows = sourceRange.getNumRows(), columns = sourceRange.getNumColumns();
        if (target.getMaxRows() < sourceSheet.getMaxRows()) target.insertRowsAfter(target.getMaxRows(), sourceSheet.getMaxRows() - target.getMaxRows());
        if (target.getMaxColumns() < sourceSheet.getMaxColumns()) target.insertColumnsAfter(target.getMaxColumns(), sourceSheet.getMaxColumns() - target.getMaxColumns());

        // Cross-workbook copy can rebind formula references. Read the original formulas
        // and re-enter them only after all canonical destination names exist.
        const formulas = sourceRange.getFormulas();
        target.getDataRange().breakApart();
        target.clear();
        copy.getRange(1, 1, rows, columns).copyTo(target.getRange(1, 1, rows, columns));
        if (sourceSheet.getName() === SHEETS.INVENTORY && target.getMaxRows() > 1) {
          setInventoryStatusValidation_(target.getRange(2, INV_COL.STATUS, target.getMaxRows() - 1, 1));
        }
        // Restore only entered formulas, never materialize QUERY/ARRAYFORMULA spill cells.
        // Group vertical formula runs so inventory columns use a handful of writes.
        for (let column = 0; column < columns; column++) {
          let start = 0;
          while (start < rows) {
            if (!formulas[start][column]) { start++; continue; }
            let end = start + 1;
            while (end < rows && formulas[end][column]) end++;
            target.getRange(start + 1, column + 1, end - start, 1)
              .setFormulas(formulas.slice(start, end).map(row => [row[column]]));
            start = end;
          }
        }
        target.setFrozenRows(sourceSheet.getFrozenRows());
        target.setFrozenColumns(sourceSheet.getFrozenColumns());
        target.setConditionalFormatRules(copy.getConditionalFormatRules().map(function(rule) {
          return rule.copy().setRanges(rule.getRanges().map(function(range) {
            return target.getRange(range.getA1Notation());
          })).build();
        }));
      });
      // Never delete Dev-only tabs (for example reservation records not yet in Prod).
      const visible = sourceSheets.findIndex(sheet => !sheet.isSheetHidden());
      if (visible >= 0) targets[visible].showSheet();
      sourceSheets.forEach(function(sheet, index) {
        if (sheet.isSheetHidden()) targets[index].hideSheet(); else targets[index].showSheet();
      });
      SpreadsheetApp.flush();
      return { success: true, sheetCount: targets.length, backupName: backupName };
    } catch (error) {
      throw new Error("Dev sync stopped. Tab names and IDs were preserved. Backup: " + backupName + ". " + (error.message || error));
    } finally {
      staged.forEach(function(sheet) {
        try { destination.deleteSheet(sheet); } catch (cleanupError) { console.warn("Sync staging cleanup: " + cleanupError); }
      });
    }
  } finally {
    lock.releaseLock();
  }
}
