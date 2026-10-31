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
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    return spreadsheet && spreadsheet.getId() === DEVELOPMENT_SPREADSHEET_ID
      ? "YourStyle UAT"
      : "YourStyle";
  } catch (error) {
    return "YourStyle";
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
