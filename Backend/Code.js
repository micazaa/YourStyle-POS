/* ==========================================================
   WEB APP
========================================================== */

function doGet() {
  return HtmlService
    .createTemplateFromFile("Frontend/Index")
    .evaluate()
    .setTitle("YourStyle Caloocan POS")
    .addMetaTag(
      "viewport",
      "width=device-width, initial-scale=1"
    )
    .setXFrameOptionsMode(
      HtmlService.XFrameOptionsMode.ALLOWALL
    );
}


/* ==========================================================
   HTML INCLUDE
========================================================== */

function include(filename) {
  return HtmlService
    .createHtmlOutputFromFile(filename)
    .getContent();
}