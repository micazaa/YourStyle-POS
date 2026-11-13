/* ==========================================================
   WEB APP
========================================================== */

function doGet() {
  return HtmlService
    .createTemplateFromFile("Frontend/Index")
    .evaluate()
    .setTitle(getYourStyleAppTitle_())
    .addMetaTag(
      "viewport",
      "width=device-width, initial-scale=1"
    )
    .setXFrameOptionsMode(
      HtmlService.XFrameOptionsMode.DEFAULT
    );
}

function getYourStyleAppTitle_() {
  return isDevelopmentSpreadsheet_() ? "YourStyle UAT" : "YourStyle";
}

function isDevelopmentSpreadsheet_() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    return !!spreadsheet && spreadsheet.getId() === DEVELOPMENT_SPREADSHEET_ID;
  } catch (error) {
    return false;
  }
}

function isDashboardEnabled_() {
  if (isDevelopmentSpreadsheet_()) return true;
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    return !!spreadsheet && spreadsheet.getId() === PRODUCTION_SPREADSHEET_ID &&
      /\/dev(?:[?#].*)?$/.test(ScriptApp.getService().getUrl() || '');
  } catch (error) {
    return false;
  }
}


/* ==========================================================
   HTML INCLUDE
========================================================== */

function include(filename) {
  return HtmlService
    .createHtmlOutputFromFile(filename)
    .getContent();
}
