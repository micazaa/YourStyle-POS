// One grouped movement scan feeds inventory totals. Existing formulas are backed up before migration.
const POS_SUMMARY_SHEET = '_POS Inventory Summary';
function inventoryMovementQuery_() {
  return '=IFNA(QUERY(ARRAYFORMULA({TO_TEXT(\'Inventory Movement Log\'!F2:F),IF((\'Inventory Movement Log\'!C2:C="DELIVERY")+((\'Inventory Movement Log\'!C2:C="DISTRIBUTION")*(\'Inventory Movement Log\'!I2:I>0)),\'Inventory Movement Log\'!I2:I,0),IF(\'Inventory Movement Log\'!C2:C="SALE",-\'Inventory Movement Log\'!I2:I,0),IF(\'Inventory Movement Log\'!C2:C="SUPPLIER_RETURN",-\'Inventory Movement Log\'!I2:I,0),IF(\'Inventory Movement Log\'!C2:C="ADJUSTMENT",\'Inventory Movement Log\'!I2:I,0),N(\'Inventory Movement Log\'!I2:I)}),"select Col1,sum(Col2),sum(Col3),sum(Col4),sum(Col5),sum(Col6) where Col1 is not null and Col1 <> \'\' group by Col1 label Col1 \'Code\',sum(Col2) \'Delivered\',sum(Col3) \'Sold\',sum(Col4) \'Returned\',sum(Col5) \'Adjustment\',sum(Col6) \'Stock\'",0),{"Code","Delivered","Sold","Returned","Adjustment","Stock"})';
}
function inventorySummaryLookup_(row, column) {
  return '=IF(A'+row+'="","",IFNA(XLOOKUP(TO_TEXT(A'+row+'),\''+POS_SUMMARY_SHEET+'\'!$A$2:$A,\''+POS_SUMMARY_SHEET+'\'!$'+column+'$2:$'+column+'),0))';
}
function prepareSummaryQueries(managerToken) {
  requireManager_('', managerToken);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const properties = PropertiesService.getScriptProperties();
    const key = 'inventory-query-v2:' + ss.getId();
    if (properties.getProperty(key) === 'ready' && ss.getSheetByName(POS_SUMMARY_SHEET)) return {success:true};
    const inventory = ss.getSheetByName(SHEETS.INVENTORY);
    if (!inventory || !ss.getSheetByName(SHEETS.INVENTORY_MOVEMENT_LOG)) return {success:false,message:'Inventory sheets are not ready.'};
    let summary = ss.getSheetByName(POS_SUMMARY_SHEET);
    if (!summary) summary = ss.insertSheet(POS_SUMMARY_SHEET);
    else if (['POS managed summary v1','POS managed summary v2'].indexOf(String(summary.getRange('G1').getValue())) === -1) throw new Error('Summary sheet name is already in use.');
    const requiredRows = Math.max(inventory.getMaxRows(), ss.getSheetByName(SHEETS.INVENTORY_MOVEMENT_LOG).getMaxRows()) + 1000;
    if(summary.getMaxRows()<requiredRows)summary.insertRowsAfter(summary.getMaxRows(),requiredRows-summary.getMaxRows());
    summary.getRange('G1').setValue('POS managed summary v2');
    summary.getRange('A1').setFormula(inventoryMovementQuery_());
    SpreadsheetApp.flush();
    const queryHeader = String(summary.getRange('A1').getDisplayValue());
    if (queryHeader !== 'Code') throw new Error('Inventory summary query failed: '+queryHeader);
    const count = inventory.getLastRow() - 1;
    if (count > 0) {
      const range = inventory.getRange(2, INV_COL.TOTAL_DELIVERED, count, 5);
      const backupName = '_POS Inventory Formula Backup';
      if (!ss.getSheetByName(backupName)) {
        const backup = ss.insertSheet(backupName);
        if (backup.getMaxRows() < count+1) backup.insertRowsAfter(backup.getMaxRows(),count+1-backup.getMaxRows());
        backup.getRange(1,1,1,6).setValues([['Inventory row','Delivered formula','Sold formula','Returned formula','Adjustment formula','Stock formula']]);
        const formulas=range.getFormulas(), values=range.getValues();
        backup.getRange(2,1,count,6).setValues(formulas.map((row,i)=>[i+2,...row.map((formula,j)=>formula ? "'"+formula : values[i][j])]));
        backup.hideSheet();
      }
      range.setFormulas(Array.from({length:count},(_,i)=>['B','C','D','E','F'].map(column=>inventorySummaryLookup_(i+2,column))));
    }
    summary.getRange("H1").setFormula("=IFNA(QUERY(ARRAYFORMULA({UPPER(TRIM(Inventory!D2:D)),UPPER(TRIM(IF(UPPER(Inventory!D2:D)=\"YOURFINDS\",IF(Inventory!C2:C=\"\",\"Unspecified size\",Inventory!C2:C),IF(Inventory!B2:B=\"\",\"Unnamed item\",Inventory!B2:B)))),IF(UPPER(Inventory!F2:F)=\"RETURNED\",0,IF(Inventory!K2:K<0,0,N(Inventory!K2:K))),IFNA(VLOOKUP(TO_TEXT(Inventory!A2:A),{TO_TEXT('Product Master'!A2:A),'Product Master'!G2:G},2,FALSE),0),IF((UPPER(Inventory!D2:D)=\"YOURFINDS\")*(UPPER(Inventory!F2:F)=\"INCOMPLETE\"),1,0)}),\"select Col1,Col2,sum(Col3),max(Col4),sum(Col5) where Col1 is not null and Col1 <> '' group by Col1,Col2 label Col1 'Category',Col2 'Product',sum(Col3) 'Stock',max(Col4) 'Threshold',sum(Col5) 'Incomplete'\",0),{\"Category\",\"Product\",\"Stock\",\"Threshold\",\"Incomplete\"})");
    summary.hideSheet();
    SpreadsheetApp.flush();
    const error = String(summary.getRange('A1').getDisplayValue());
    if (error.startsWith('#')) throw new Error('Inventory summary query failed: '+error);
    properties.setProperty(key,'ready');
    return {success:true};
  } finally { lock.releaseLock(); }
}
