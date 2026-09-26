/* ==========================================================
   PRODUCT MASTER CATALOG IMAGES

   One-time/idempotent sheet maintenance helper. It creates
   lightweight SVG catalog cards in the same Drive folder used
   by normal POS photo uploads, then writes their thumbnail URLs
   to Product Master and matching stock Inventory rows.
========================================================== */

function catalogXmlEscape_(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function catalogColor_(description) {
  const text = String(description || "").toUpperCase();
  if (text.indexOf("YELLOW") !== -1) return { bg: "#F7D94C", fg: "#2A2512" };
  if (text.indexOf("BLACK") !== -1) return { bg: "#171717", fg: "#FFFFFF" };
  if (text.indexOf("BLUE") !== -1) return { bg: "#3478C8", fg: "#FFFFFF" };
  if (text.indexOf("RED") !== -1) return { bg: "#CF3F4E", fg: "#FFFFFF" };
  if (text.indexOf("GRAY") !== -1 || text.indexOf("GREY") !== -1) return { bg: "#90959C", fg: "#FFFFFF" };
  if (text.indexOf("WHITE") !== -1) return { bg: "#FAFAF7", fg: "#272727" };
  if (text.indexOf("GREEN") !== -1) return { bg: "#438A59", fg: "#FFFFFF" };
  return { bg: "#F8ECEF", fg: "#4F2033" };
}

function catalogTextLines_(description) {
  const words = String(description || "PRODUCT").trim().toUpperCase().split(/\s+/);
  const lines = [];
  let line = "";
  words.forEach(function(word) {
    const next = line ? line + " " + word : word;
    if (next.length > 18 && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

function catalogIconSvg_(description, color) {
  const text = String(description || "").toUpperCase();
  const stroke = color.fg;
  if (text.indexOf("SUNGLASSES") !== -1) {
    return '<g fill="none" stroke="' + stroke + '" stroke-width="22"><circle cx="285" cy="310" r="92"/><circle cx="515" cy="310" r="92"/><path d="M377 305 Q400 275 423 305 M190 275 L95 235 M610 275 L705 235"/></g>';
  }
  if (text.indexOf("BAG") !== -1) {
    return '<g fill="none" stroke="' + stroke + '" stroke-width="22"><rect x="225" y="220" width="350" height="300" rx="34"/><path d="M305 225 Q305 115 400 115 Q495 115 495 225"/></g>';
  }
  if (text.indexOf("SHOE") !== -1 || text.indexOf("HEEL") !== -1 || text.indexOf("BOOT") !== -1 || text.indexOf("RUBBER") !== -1 || text.indexOf("SLIPPER") !== -1) {
    return '<path d="M155 425 Q265 445 355 325 L420 215 L520 250 L500 365 Q590 400 665 430 Q705 448 690 495 L655 535 L210 535 Q130 525 120 480 Z" fill="none" stroke="' + stroke + '" stroke-width="22" stroke-linejoin="round"/>';
  }
  if (text.indexOf("TIES") !== -1) {
    return '<path d="M365 120 L435 120 L475 205 L420 270 L475 520 L400 610 L325 520 L380 270 L325 205 Z" fill="none" stroke="' + stroke + '" stroke-width="22" stroke-linejoin="round"/>';
  }
  if (text.indexOf("FLOWER") !== -1) {
    return '<g fill="none" stroke="' + stroke + '" stroke-width="18"><path d="M400 590 L400 315 M400 450 Q315 390 270 470 M400 410 Q490 340 545 420"/><circle cx="400" cy="250" r="55"/><circle cx="400" cy="160" r="70"/><circle cx="315" cy="225" r="70"/><circle cx="485" cy="225" r="70"/><circle cx="345" cy="320" r="70"/><circle cx="455" cy="320" r="70"/></g>';
  }
  if (text.indexOf("PAPERBAG") !== -1) {
    return '<g fill="none" stroke="' + stroke + '" stroke-width="22"><path d="M235 230 H565 L535 570 H265 Z"/><path d="M320 250 Q320 125 400 125 Q480 125 480 250"/></g>';
  }
  return '<g fill="none" stroke="' + stroke + '" stroke-width="18"><path d="M400 130 L455 280 L615 285 L487 380 L532 535 L400 445 L268 535 L313 380 L185 285 L345 280 Z"/></g>';
}

function buildProductCatalogSvg_(description, category) {
  const clean = String(description || "PRODUCT").trim().toUpperCase();
  const color = catalogColor_(clean);
  const plainColors = ["YELLOW", "BLACK", "BLUE", "RED", "GRAY", "WHITE", "GREEN", "GREEN SPECIAL"];
  const isPlain = String(category || "").toUpperCase() === "PINS" && plainColors.indexOf(clean) !== -1;
  const isSimpleNew = String(category || "").toUpperCase() === "PINS" && /^((GREEN SPECIAL)|YELLOW|BLACK|BLUE|RED|GRAY|WHITE|GREEN) \(NEW\)$/.test(clean);
  let body = '';
  if (isSimpleNew) {
    body = '<text x="400" y="435" text-anchor="middle" font-family="Arial, sans-serif" font-size="150" font-weight="800" fill="' + color.fg + '">NEW</text>';
  } else if (!isPlain) {
    body += catalogIconSvg_(clean, color);
    const lines = catalogTextLines_(clean);
    const startY = 655 - (lines.length - 1) * 34;
    lines.forEach(function(line, index) {
      body += '<text x="400" y="' + (startY + index * 68) + '" text-anchor="middle" font-family="Arial, sans-serif" font-size="48" font-weight="700" fill="' + color.fg + '">' + catalogXmlEscape_(line) + '</text>';
    });
  }
  const border = clean.indexOf("WHITE") !== -1 ? '<rect x="14" y="14" width="772" height="772" rx="30" fill="none" stroke="#D8D2CC" stroke-width="12"/>' : '';
  return '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800"><rect width="800" height="800" rx="36" fill="' + color.bg + '"/>' + border + body + '</svg>';
}

function generateProductMasterCatalogImagesPhase8() {
  // Execution API calls do not have an active container spreadsheet.
  const ss = SpreadsheetApp.openById("1xnHBsGsoMmcBIoRwEjX0paf5R39A-s2Tnc6m1lkoOQU");
  const master = ss.getSheetByName(SHEETS.PRODUCT_MASTER);
  const inventory = ss.getSheetByName(SHEETS.INVENTORY);
  if (!master) throw new Error("Product Master sheet not found.");
  const folder = DriveApp.getFolderById(PHASE8_PRODUCT_IMAGES_FOLDER_ID);
  const lastRow = master.getLastRow();
  if (lastRow < 2) return { success: true, created: 0, skipped: 0 };

  const rows = master.getRange(2, 1, lastRow - 1, PRODUCT_MASTER_COLUMN_COUNT).getDisplayValues();
  const urls = master.getRange(2, PRODUCT_COL.IMAGE, lastRow - 1, 1).getDisplayValues();
  let created = 0;
  let skipped = 0;
  rows.forEach(function(row, index) {
    const code = String(row[PRODUCT_IDX.PRODUCT_CODE] || "").trim();
    const description = String(row[PRODUCT_IDX.DESCRIPTION] || "").trim();
    const category = String(row[PRODUCT_IDX.CATEGORY] || "").trim();
    if (!code || !description) return;
    if (String(urls[index][0] || "").trim()) {
      skipped++;
      return;
    }
    const svg = buildProductCatalogSvg_(description, category);
    const file = folder.createFile(Utilities.newBlob(svg, "image/svg+xml", code + "_row" + (index + 2) + "_catalog.svg"));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    urls[index][0] = "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w1200";
    created++;
  });
  master.getRange(2, PRODUCT_COL.IMAGE, urls.length, 1).setValues(urls);

  if (inventory && inventory.getLastRow() >= 2) {
    const masterByCode = {};
    rows.forEach(function(row, index) {
      const code = String(row[PRODUCT_IDX.PRODUCT_CODE] || "").trim();
      if (code && !masterByCode[code] && urls[index][0]) masterByCode[code] = urls[index][0];
    });
    const invCodes = inventory.getRange(2, INV_COL.CODE, inventory.getLastRow() - 1, 1).getDisplayValues();
    const invImages = inventory.getRange(2, INV_COL.IMAGE, inventory.getLastRow() - 1, 1).getDisplayValues();
    invCodes.forEach(function(row, index) {
      const code = String(row[0] || "").trim();
      if (masterByCode[code]) invImages[index][0] = masterByCode[code];
    });
    inventory.getRange(2, INV_COL.IMAGE, invImages.length, 1).setValues(invImages);
  }

  return { success: true, created: created, skipped: skipped, folderId: PHASE8_PRODUCT_IMAGES_FOLDER_ID };
}
