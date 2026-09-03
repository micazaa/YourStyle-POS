/* ==========================================================
   YOURFINDS LABEL PDF
   Label size: 30mm wide x 20mm high

   Barcode:
   Code 128-B encoding of the Inventory Code
========================================================== */


/* ==========================================================
   CODE 128 PATTERNS

   Each value represents alternating bar/space widths.
========================================================== */

const CODE128_PATTERNS = [
  "212222","222122","222221","121223","121322","131222",
  "122213","122312","132212","221213","221312","231212",
  "112232","122132","122231","113222","123122","123221",
  "223211","221132","221231","213212","223112","312131",
  "311222","321122","321221","312212","322112","322211",
  "212123","212321","232121","111323","131123","131321",
  "112313","132113","132311","211313","231113","231311",
  "112133","112331","132131","113123","113321","133121",
  "313121","211331","231131","213113","213311","213131",
  "311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124",
  "121421","141122","141221","112214","112412","122114",
  "122411","142112","142211","241211","221114","413111",
  "241112","134111","111242","121142","121241","114212",
  "124112","124211","411212","421112","421211","212141",
  "214121","412121","111143","111341","131141","114113",
  "114311","411113","411311","113141","114131","311141",
  "411131","211412","211214","211232","2331112"
];


/* ==========================================================
   CODE 128-B VALUES
========================================================== */

function getCode128Values(text) {

  text =
    String(text || "");


  if (!text) {
    throw new Error(
      "Cannot generate barcode for an empty code."
    );
  }


  const values = [];

  /*
    Start Code B = 104
  */

  values.push(104);


  for (
    let i = 0;
    i < text.length;
    i++
  ) {

    const charCode =
      text.charCodeAt(i);


    /*
      Code 128-B supports ASCII 32-126.
    */

    if (
      charCode < 32 ||
      charCode > 126
    ) {

      throw new Error(
        "Unsupported barcode character: " +
        text.charAt(i)
      );

    }


    values.push(
      charCode - 32
    );

  }


  /*
    Checksum:

    Start +
    value1 * 1 +
    value2 * 2 ...
  */

  let checksum =
    104;


  for (
    let i = 1;
    i < values.length;
    i++
  ) {

    checksum +=
      values[i] * i;

  }


  checksum =
    checksum % 103;


  values.push(
    checksum
  );


  /*
    Stop = 106
  */

  values.push(
    106
  );


  return values;

}


/* ==========================================================
   BARCODE SVG
========================================================== */

function createCode128Svg(
  text,
  widthMm,
  heightMm
) {

  const values =
    getCode128Values(text);


  let modules = 0;


  values.forEach(
    function(value) {

      const pattern =
        CODE128_PATTERNS[value];

      for (
        let i = 0;
        i < pattern.length;
        i++
      ) {

        modules +=
          parseInt(
            pattern.charAt(i),
            10
          );

      }

    }
  );


  /*
    Quiet zones on both sides.
  */

  const quietModules =
    10;


  const totalModules =
    modules +
    quietModules * 2;


  const svgWidth =
    600;


  const svgHeight =
    160;


  const moduleWidth =
    svgWidth /
    totalModules;


  let x =
    quietModules *
    moduleWidth;


  let bars = "";


  values.forEach(
    function(value) {

      const pattern =
        CODE128_PATTERNS[value];


      for (
        let i = 0;
        i < pattern.length;
        i++
      ) {

        const units =
          parseInt(
            pattern.charAt(i),
            10
          );


        const segmentWidth =
          units *
          moduleWidth;


        /*
          Even positions are bars.
          Odd positions are spaces.
        */

        if (i % 2 === 0) {

          bars +=
            '<rect x="' +
            x.toFixed(2) +
            '" y="0" width="' +
            segmentWidth.toFixed(2) +
            '" height="' +
            svgHeight +
            '" fill="#000"/>';

        }


        x +=
          segmentWidth;

      }

    }
  );


  return (
    '<svg ' +
    'xmlns="http://www.w3.org/2000/svg" ' +
    'width="' + widthMm + 'mm" ' +
    'height="' + heightMm + 'mm" ' +
    'viewBox="0 0 ' +
    svgWidth +
    ' ' +
    svgHeight +
    '" preserveAspectRatio="none">' +
    bars +
    '</svg>'
  );

}


/* ==========================================================
   HTML ESCAPE
========================================================== */

function escapeLabelHtml(value) {

  return String(
    value === null ||
    value === undefined
      ? ""
      : value
  )
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}

/* ==========================================================
   BUILD YOURFINDS LABEL HTML

   One label = one PDF page.

   Input:

   [
     {
       code: "816261001",
       size: "S"
     },
     {
       code: "816262001",
       size: "M"
     }
   ]

   Physical label:
   30mm wide × 20mm high
========================================================== */

function buildYourFindsLabelsHtml(
  labelItems
) {

  if (
    !Array.isArray(labelItems) ||
    labelItems.length === 0
  ) {

    throw new Error(
      "No label items supplied."
    );

  }


  let labels =
    "";


  labelItems.forEach(
    function(item) {

      const code =
        String(
          item &&
          item.code
            ? item.code
            : ""
        ).trim();


      const size =
        String(
          item &&
          item.size
            ? item.size
            : ""
        )
          .trim()
          .toUpperCase();


      if (!code) {

        throw new Error(
          "Label item is missing its Code."
        );

      }


      if (!size) {

        throw new Error(
          "YourFinds item " +
          code +
          " has no Size."
        );

      }


      /*
        Maximum practical barcode area.

        28mm leaves approximately
        1mm on each side of the label.
      */

      const barcodeSvg =
        createCode128Svg(
          code,
          28,
          7.5
        );


      labels += `

        <div class="label">

          <div class="size">
            ${escapeLabelHtml(size)}
          </div>

          <div class="barcode">
            ${barcodeSvg}
          </div>

          <div class="code">
            ${escapeLabelHtml(code)}
          </div>

        </div>

      `;

    }
  );


  return `

    <!DOCTYPE html>

    <html>

    <head>

      <meta charset="UTF-8">

      <style>

        @page {

          size: 30mm 20mm;

          margin: 0;

        }


        * {

          box-sizing: border-box;

        }


        html,
        body {

          margin: 0;
          padding: 0;

          width: 30mm;

        }


        body {

          font-family:
            Arial,
            Helvetica,
            sans-serif;

        }


        .label {

          width: 30mm;
          height: 20mm;

          padding:
            0.6mm
            1mm
            0.5mm;

          overflow: hidden;

          display: flex;

          flex-direction: column;

          align-items: center;

          justify-content: center;

          page-break-after: always;

        }


        .label:last-child {

          page-break-after: auto;

        }


        .size {

          width: 100%;

          font-size: 14pt;

          font-weight: 700;

          line-height: 1;

          text-align: center;

          margin: 0 0 0.5mm 0;

          padding: 0;

          white-space: nowrap;

        }


        .barcode {

          width: 28mm;
          height: 7.5mm;

          margin: 0;
          padding: 0;

          display: flex;

          justify-content: center;

          align-items: center;

          overflow: hidden;

        }


        .barcode svg {

          display: block;

          width: 28mm;

          height: 7.5mm;

          margin: 0;

          padding: 0;

        }


        .code {

          width: 100%;

          margin:
            0.5mm
            0
            0
            0;

          padding: 0;

          font-size: 7pt;

          font-weight: 700;

          letter-spacing: 0.15mm;

          line-height: 1;

          text-align: center;

          white-space: nowrap;

        }

      </style>

    </head>


    <body>

      ${labels}

    </body>

    </html>

  `;

}

/* ==========================================================
   CREATE YOURFINDS LABEL PDF BY CODES

   YourFinds 30mm x 20mm receiving-label generator.

   Used later by:

   - Print after delivery
   - Selective delivery reprint
   - Receiving-label reprint

   Input:

   [
     "816261001",
     "816262001",
     "816264001"
   ]
========================================================== */

function createYourFindsLabelPDFByCodes(
  codes
) {

  /* ========================================================
     VALIDATE INPUT
  ======================================================== */

  if (
    !Array.isArray(codes) ||
    codes.length === 0
  ) {

    throw new Error(
      "Select at least one label to print."
    );

  }


  /* ========================================================
     NORMALIZE + REMOVE DUPLICATES
  ======================================================== */

  const normalizedCodes =
    [];


  const requestedCodeSet =
    {};


  codes.forEach(
    function(value) {

      const code =
        String(
          value || ""
        ).trim();


      if (!code) {

        return;

      }


      if (
        requestedCodeSet[code]
      ) {

        return;

      }


      requestedCodeSet[code] =
        true;


      normalizedCodes.push(
        code
      );

    }
  );


  if (
    normalizedCodes.length === 0
  ) {

    throw new Error(
      "No valid YourFinds Codes were selected."
    );

  }


  /* ========================================================
     INVENTORY
  ======================================================== */

  const inventory =
    getFullInventory();


  const inventoryMap =
    {};


  inventory.forEach(
    function(item) {

      const code =
        String(
          item.code || ""
        ).trim();


      if (code) {

        inventoryMap[code] =
          item;

      }

    }
  );


  /* ========================================================
     BUILD LABEL DATA

     IMPORTANT:
     Preserve the order requested by the user.
  ======================================================== */

  const labelItems =
    [];


  normalizedCodes.forEach(
    function(code) {

      const item =
        inventoryMap[code];


      if (!item) {

        throw new Error(
          "Inventory Code " +
          code +
          " was not found."
        );

      }


      const inventoryType =
        String(
          item.inventoryType || ""
        )
          .trim()
          .toUpperCase();


      const category =
        String(
          item.category || ""
        )
          .trim()
          .toUpperCase();


      /*
        Label printing is only for YourFinds
        unique inventory.
      */

      if (
        inventoryType !==
          INVENTORY_TYPE.UNIQUE ||
        category !==
          "YOURFINDS"
      ) {

        throw new Error(
          "Code " +
          code +
          " is not a YourFinds unique item."
        );

      }


      const size =
        String(
          item.size || ""
        )
          .trim()
          .toUpperCase();


      if (!size) {

        throw new Error(
          "YourFinds Code " +
          code +
          " has no Size."
        );

      }


      labelItems.push({

        code:
          code,

        size:
          size

      });

    }
  );


  /* ========================================================
     BUILD HTML
  ======================================================== */

  const html =
    buildYourFindsLabelsHtml(
      labelItems
    );


  /* ========================================================
     FILE NAME

     Example:
     YourFinds_Labels_20260816_164523.pdf
  ======================================================== */

  const timestamp =
    Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyyMMdd_HHmmss"
    );


  const fileName =
    "YourFinds_Labels_" +
    timestamp;


  /* ========================================================
     HTML → PDF
  ======================================================== */

  const htmlBlob =
    Utilities.newBlob(
      html,
      "text/html",
      fileName +
      ".html"
    );


  const pdfBlob =
    htmlBlob
      .getAs(
        "application/pdf"
      )
      .setName(
        fileName +
        ".pdf"
      );


  /* ========================================================
     DRIVE
  ======================================================== */

  const file =
    DriveApp.createFile(
      pdfBlob
    );


  file.setSharing(
    DriveApp.Access.ANYONE_WITH_LINK,
    DriveApp.Permission.VIEW
  );


  /* ========================================================
     RESULT
  ======================================================== */

  return {

    success:
      true,

    labelCount:
      labelItems.length,

    codes:
      normalizedCodes,

    fileName:
      file.getName(),

    downloadUrl:
      file.getDownloadUrl(),

    fileUrl:
      file.getUrl()

  };

}

/* ==========================================================
   COMPLETED YOURFINDS LABEL

   This is intentionally separate from the 30mm x 20mm
   receiving label above. Completed labels are 40mm x 30mm
   and include the product description.
========================================================== */

function buildCompletedYourFindsLabelHtml(item) {
  const code = String(item && item.code || "").trim();
  const size = String(item && item.size || "").trim().toUpperCase();
  const description = String(item && item.name || "").trim();

  if (!code) throw new Error("Completed label is missing its Code.");
  if (!size) throw new Error("YourFinds item " + code + " has no Size.");
  if (!description) throw new Error("YourFinds item " + code + " has no Description.");

  const barcodeSvg = createCode128Svg(code, 37, 10);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @page { size: 40mm 30mm; margin: 0; }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; width: 40mm; height: 30mm; }
        body { font-family: Arial, Helvetica, sans-serif; }
        .label {
          width: 40mm;
          height: 30mm;
          padding: 1.2mm 1.5mm 0.8mm;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        .top {
          width: 100%;
          height: 8mm;
          display: flex;
          align-items: center;
          gap: 1mm;
          margin-bottom: 0.7mm;
        }
        .description {
          flex: 1;
          max-height: 8mm;
          overflow: hidden;
          font-size: 8.5pt;
          font-weight: 700;
          line-height: 1.08;
          text-align: left;
          overflow-wrap: anywhere;
        }
        .size {
          min-width: 8mm;
          max-width: 12mm;
          padding: 0.8mm 1mm;
          border: 0.35mm solid #000;
          border-radius: 1mm;
          font-size: 10pt;
          font-weight: 700;
          line-height: 1;
          text-align: center;
          white-space: nowrap;
          overflow: hidden;
        }
        .barcode, .barcode svg {
          display: block;
          width: 37mm;
          height: 10mm;
          margin: 0;
          padding: 0;
          overflow: hidden;
        }
        .code {
          width: 100%;
          margin-top: 0.8mm;
          font-size: 8pt;
          font-weight: 700;
          letter-spacing: 0.2mm;
          line-height: 1;
          text-align: center;
          white-space: nowrap;
        }
      </style>
    </head>
    <body>
      <div class="label">
        <div class="top">
          <div class="description">${escapeLabelHtml(description)}</div>
          <div class="size">${escapeLabelHtml(size)}</div>
        </div>
        <div class="barcode">${barcodeSvg}</div>
        <div class="code">${escapeLabelHtml(code)}</div>
      </div>
    </body>
    </html>
  `;
}

function createCompletedYourFindsLabelPDF(code) {
  code = String(code || "").trim();
  if (!code) throw new Error("Inventory Code is required.");

  const result = getYourFindsItemForCompletion(code);
  if (!result || !result.success || !result.item) {
    throw new Error(result && result.message ? result.message : "YourFinds item not found.");
  }

  const item = result.item;
  const status = String(item.status || "").trim().toUpperCase();
  if (status === INVENTORY_STATUS.INCOMPLETE) {
    throw new Error("Complete the YourFinds item before generating its 40 x 30 label.");
  }
  if (status === INVENTORY_STATUS.RETURNED) {
    throw new Error("Returned YourFinds items cannot generate a completed label.");
  }
  if (Number(item.stock) <= 0) {
    throw new Error("Sold YourFinds items cannot generate a completed label.");
  }
  phase8AssertCompletedYourFinds_(item);

  const html = buildCompletedYourFindsLabelHtml(item);
  const timestamp = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyyMMdd_HHmmss"
  );
  const fileName = "YourFinds_Completed_" + code + "_" + timestamp;
  const htmlBlob = Utilities.newBlob(html, "text/html", fileName + ".html");
  const pdfBlob = htmlBlob.getAs("application/pdf").setName(fileName + ".pdf");
  const file = DriveApp.createFile(pdfBlob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    success: true,
    labelCount: 1,
    code: code,
    fileName: file.getName(),
    downloadUrl: file.getDownloadUrl(),
    fileUrl: file.getUrl()
  };
}

/* ==========================================================
   GET YOURFINDS LABEL ITEMS BY DELIVERY ID

   READ-ONLY.

   Returns every YourFinds Inventory item belonging
   to one Delivery ID.

   Used later by:
   - Print after delivery
   - Selective reprint
   - Delivery page
========================================================== */

function getYourFindsLabelItemsByDeliveryId(
  deliveryId
) {

  try {

    deliveryId =
      String(
        deliveryId || ""
      )
        .trim()
        .toUpperCase();


    if (!deliveryId) {

      return {

        success:
          false,

        message:
          "Delivery ID is required."

      };

    }


    const inventory =
      getFullInventory();


    const items =
      [];


    inventory.forEach(
      function(item) {

        const itemDeliveryId =
          String(
            item.deliveryId || ""
          )
            .trim()
            .toUpperCase();


        if (
          itemDeliveryId !==
          deliveryId
        ) {

          return;

        }


        const inventoryType =
          String(
            item.inventoryType || ""
          )
            .trim()
            .toUpperCase();


        const category =
          String(
            item.category || ""
          )
            .trim()
            .toUpperCase();


        /*
          Only YourFinds UNIQUE items belong
          in the YourFinds label system.
        */

        if (
          inventoryType !==
            INVENTORY_TYPE.UNIQUE ||
          category !==
            "YOURFINDS"
        ) {

          return;

        }


        items.push({

          code:
            String(
              item.code || ""
            ).trim(),

          size:
            String(
              item.size || ""
            )
              .trim()
              .toUpperCase(),

          status:
            String(
              item.status || ""
            )
              .trim()
              .toUpperCase(),

          description:
            String(
              item.name || ""
            ).trim(),

          deliveryId:
            String(
              item.deliveryId || ""
            ).trim(),

          dateDelivered:
            item.dateDelivered || ""

        });

      }
    );


    if (
      items.length === 0
    ) {

      return {

        success:
          false,

        message:
          "No YourFinds items found for Delivery ID " +
          deliveryId +
          "."

      };

    }


    /* ========================================================
       SORT

       S → M → L → XL → E
       Then Code ascending.
    ======================================================== */

    const sizeOrder = {

      S: 1,
      M: 2,
      L: 3,
      XL: 4,
      E: 5

    };


    items.sort(
      function(a, b) {

        const sizeA =
          sizeOrder[a.size] ||
          999;


        const sizeB =
          sizeOrder[b.size] ||
          999;


        if (
          sizeA !==
          sizeB
        ) {

          return (
            sizeA -
            sizeB
          );

        }


        return String(
          a.code
        ).localeCompare(
          String(
            b.code
          )
        );

      }
    );


    return {

      success:
        true,

      deliveryId:
        deliveryId,

      totalItems:
        items.length,

      items:
        items

    };


  } catch (err) {

    return {

      success:
        false,

      message:
        err &&
        err.message
          ? err.message
          : String(err)

    };

  }

}

/* ==========================================================
   GET YOURFINDS DELIVERIES FOR LABEL REPRINT

   READ-ONLY.

   Returns accepted deliveries newest first.

   Used by:
   Reprint Labels → Select Delivery
========================================================== */

function buildYourFindsDeliverySummaryFromInventory(deliveryId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.INVENTORY);
  if (!sheet || sheet.getLastRow() < 2) return { quantities: {}, totalQty: 0, firstCode: "", lastCode: "" };

  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, INVENTORY_COLUMN_COUNT).getDisplayValues();
  const items = rows.filter(function(row) {
    return String(row[INV_IDX.DELIVERY_ID] || "").trim().toUpperCase() === String(deliveryId || "").trim().toUpperCase() &&
      (String(row[INV_IDX.CATEGORY] || "").trim().toUpperCase() === "YOURFINDS" || String(row[INV_IDX.INVENTORY_TYPE] || "").trim().toUpperCase() === "UNIQUE");
  });

  const quantities = {};
  const codes = [];
  items.forEach(function(row) {
    const size = String(row[INV_IDX.SIZE] || "UNKNOWN").trim().toUpperCase() || "UNKNOWN";
    quantities[size] = (quantities[size] || 0) + 1;
    const code = String(row[INV_IDX.CODE] || "").trim();
    if (code) codes.push(code);
  });

  return { quantities: quantities, totalQty: items.length, firstCode: codes[0] || "", lastCode: codes[codes.length - 1] || "" };
}

function getGroupedYourFindsDeliveries() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.DELIVERY_LOG);
  if (!sheet) throw new Error("Delivery Log sheet not found.");
  if (sheet.getLastRow() < 2) return [];

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, DELIVERY_LOG_COLUMN_COUNT).getValues();
  const display = sheet.getRange(2, 1, sheet.getLastRow() - 1, DELIVERY_LOG_COLUMN_COUNT).getDisplayValues();
  const grouped = {};

  data.forEach(function(row, i) {
    const d = display[i];
    const deliveryId = String(d[DELIVERY_IDX.DELIVERY_ID] || "").trim();
    const deliveryType = String(d[DELIVERY_IDX.DELIVERY_TYPE] || "").trim().toUpperCase();
    if (!deliveryId || (deliveryType !== "YOURFINDS" && !deliveryId.toUpperCase().startsWith("YFD-"))) return;

    if (!grouped[deliveryId]) {
      grouped[deliveryId] = {
        rowNumber: i + 2, deliveryId: deliveryId,
        deliveryNo: String(d[DELIVERY_IDX.DELIVERY_NO] || "").trim(),
        deliveryDate: String(d[DELIVERY_IDX.DELIVERY_DATE] || "").trim(),
        timestamp: String(d[DELIVERY_IDX.TIMESTAMP] || "").trim(),
        timestampMs: row[DELIVERY_IDX.TIMESTAMP] instanceof Date ? row[DELIVERY_IDX.TIMESTAMP].getTime() : 0,
        driverName: String(d[DELIVERY_IDX.DRIVER_NAME] || "").trim(),
        plateNo: String(d[DELIVERY_IDX.PLATE_NO] || "").trim(),
        acceptedBy: String(d[DELIVERY_IDX.ACCEPTED_BY] || "").trim(),
        status: String(d[DELIVERY_IDX.STATUS] || "").trim(),
        remarks: String(d[DELIVERY_IDX.REMARKS] || "").trim(),
        categories: {}
      };
    }

    const category = String(d[DELIVERY_IDX.CATEGORY] || "").trim().toUpperCase();
    const qty = Number(row[DELIVERY_IDX.ACTUAL_QTY]) || 0;
    if (category && category !== "MULTIPLE") grouped[deliveryId].categories[category] = (grouped[deliveryId].categories[category] || 0) + qty;
  });

  return Object.keys(grouped).map(function(id) {
    const item = grouped[id];
    const summary = buildYourFindsDeliverySummaryFromInventory(id);
    item.quantities = Object.keys(item.categories).length ? item.categories : summary.quantities;
    item.totalQty = summary.totalQty || Object.values(item.quantities).reduce(function(a,b){ return a + Number(b || 0); }, 0);
    item.firstCode = summary.firstCode;
    item.lastCode = summary.lastCode;
    return item;
  }).sort(function(a,b) { return (b.timestampMs || 0) - (a.timestampMs || 0) || b.rowNumber - a.rowNumber; });
}

function getYourFindsDeliveriesForLabelReprint() {
  try { return { success: true, deliveries: getGroupedYourFindsDeliveries() }; }
  catch (err) { return { success: false, message: err && err.message ? err.message : String(err), deliveries: [] }; }
}

/* ==========================================================
   GET YOURFINDS DELIVERY HISTORY

   READ-ONLY.

   Used by:
   Deliveries Page

   Returns all valid delivery records,
   newest first.
========================================================== */

function getYourFindsDeliveryHistory() {
  try {
    const deliveries = getGroupedYourFindsDeliveries();
    return { success: true, count: deliveries.length, deliveries: deliveries };
  } catch (err) {
    return { success: false, message: err && err.message ? err.message : String(err), deliveries: [] };
  }
}

/* ==========================================================
   UNIVERSAL DELIVERY HISTORY
   PHASE 7.9H-D2

   Used by Deliveries Page.

   Groups Delivery Log rows by Delivery ID and returns:
   - YOURFINDS
   - YOURSTYLE DIRECT
   - YOURSTYLE BULK

   Does NOT replace the existing YourFinds label/reprint
   functions.
========================================================== */

function getDeliveryHistory() {
  try {
    const ss =
      SpreadsheetApp.getActiveSpreadsheet();

    const sheet =
      ss.getSheetByName(
        SHEETS.DELIVERY_LOG
      );

    if (!sheet) {
      throw new Error(
        "Delivery Log sheet not found."
      );
    }

    if (sheet.getLastRow() < 2) {
      return {
        success: true,
        count: 0,
        deliveries: []
      };
    }

    const rowCount =
      sheet.getLastRow() - 1;

    const data =
      sheet
        .getRange(
          2,
          1,
          rowCount,
          DELIVERY_LOG_COLUMN_COUNT
        )
        .getValues();

    const display =
      sheet
        .getRange(
          2,
          1,
          rowCount,
          DELIVERY_LOG_COLUMN_COUNT
        )
        .getDisplayValues();

    const grouped = {};


    /* ========================================================
       GROUP DELIVERY LOG ROWS
    ======================================================== */

    data.forEach(
      function(row, index) {
        const d =
          display[index];

        const deliveryId =
          String(
            d[
              DELIVERY_IDX.DELIVERY_ID
            ] || ""
          ).trim();

        if (!deliveryId) {
          return;
        }


        let deliveryType =
          String(
            d[
              DELIVERY_IDX.DELIVERY_TYPE
            ] || ""
          )
            .trim()
            .toUpperCase();


        /*
          Backward compatibility for old YourFinds rows.
        */

        if (
          !deliveryType &&
          deliveryId
            .toUpperCase()
            .startsWith("YFD-")
        ) {
          deliveryType =
            DELIVERY_TYPE.YOURFINDS;
        }


        if (
          deliveryType !==
            DELIVERY_TYPE.YOURFINDS &&
          deliveryType !==
            DELIVERY_TYPE.YOURSTYLE
        ) {
          return;
        }


        /* ====================================================
           CREATE GROUP
        ==================================================== */

        if (!grouped[deliveryId]) {
          grouped[deliveryId] = {
            rowNumber:
              index + 2,

            deliveryId:
              deliveryId,

            deliveryNo:
              String(
                d[
                  DELIVERY_IDX.DELIVERY_NO
                ] || ""
              ).trim(),

            deliveryDate:
              String(
                d[
                  DELIVERY_IDX.DELIVERY_DATE
                ] || ""
              ).trim(),

            timestamp:
              String(
                d[
                  DELIVERY_IDX.TIMESTAMP
                ] || ""
              ).trim(),

            timestampMs:
              row[
                DELIVERY_IDX.TIMESTAMP
              ] instanceof Date
                ? row[
                    DELIVERY_IDX.TIMESTAMP
                  ].getTime()
                : 0,

            driverName:
              String(
                d[
                  DELIVERY_IDX.DRIVER_NAME
                ] || ""
              ).trim(),

            plateNo:
              String(
                d[
                  DELIVERY_IDX.PLATE_NO
                ] || ""
              ).trim(),

            acceptedBy:
              String(
                d[
                  DELIVERY_IDX.ACCEPTED_BY
                ] || ""
              ).trim(),

            deliveryType:
              deliveryType,

            status:
              "",

            remarks:
              String(
                d[
                  DELIVERY_IDX.REMARKS
                ] || ""
              ).trim(),

            quantities: {},

            totalQty: 0,

            hasBulk: false,

            bulkBundleQty: 0,

            bulkEstimatedQuantity: 0,

            bulkActualQuantity: 0,

            bulkRemainingQuantity: 0,

            bulkRemainingBundleQty: 0,

            _statuses: []
          };
        }


        const group =
          grouped[deliveryId];


        /* ====================================================
           ROW VALUES
        ==================================================== */

        const type =
          String(
            d[
              DELIVERY_IDX.TYPE
            ] || ""
          )
            .trim()
            .toUpperCase();


        const category =
          String(
            d[
              DELIVERY_IDX.CATEGORY
            ] || ""
          )
            .trim()
            .toUpperCase();


        const receiveMode =
          String(
            d[
              DELIVERY_IDX.RECEIVE_MODE
            ] || ""
          )
            .trim()
            .toUpperCase();


        const rowStatus =
          String(
            d[
              DELIVERY_IDX.STATUS
            ] || ""
          )
            .trim()
            .toUpperCase();


        const actualQty =
          Number(
            row[
              DELIVERY_IDX.ACTUAL_QTY
            ]
          ) || 0;


        if (rowStatus) {
          group._statuses.push(
            rowStatus
          );
        }


        /* ====================================================
           YOURFINDS
        ==================================================== */

        if (
          deliveryType ===
          DELIVERY_TYPE.YOURFINDS
        ) {
          if (
            category &&
            category !== "MULTIPLE"
          ) {
            group.quantities[
              category
            ] =
              (
                group.quantities[
                  category
                ] || 0
              ) +
              actualQty;
          }

          return;
        }


        /* ====================================================
           YOURSTYLE DIRECT
        ==================================================== */

        if (
          receiveMode ===
          DELIVERY_RECEIVE_MODE.DIRECT
        ) {
          const directKey =
            category ||
            type ||
            "DIRECT";


          group.quantities[
            directKey
          ] =
            (
              group.quantities[
                directKey
              ] || 0
            ) +
            actualQty;


          group.totalQty +=
            actualQty;


          return;
        }


        /* ====================================================
           YOURSTYLE BULK
        ==================================================== */

        if (
          receiveMode ===
          DELIVERY_RECEIVE_MODE.BULK
        ) {
          group.hasBulk =
            true;


          const bulkKey =
            type
              ? "BULK " + type
              : "BULK";


          /*
            Category display shows actual pieces already
            distributed from this holder.
          */

          group.quantities[
            bulkKey
          ] =
            (
              group.quantities[
                bulkKey
              ] || 0
            ) +
            actualQty;


          group.bulkBundleQty +=
            Number(
              row[
                DELIVERY_IDX.BUNDLE_QTY
              ]
            ) || 0;


          group.bulkEstimatedQuantity +=
            Number(
              row[
                DELIVERY_IDX.ESTIMATED_QTY
              ]
            ) || 0;


          group.bulkActualQuantity +=
            actualQty;


          group.bulkRemainingQuantity +=
            Number(
              row[
                DELIVERY_IDX.REMAINING_QTY
              ]
            ) || 0;


          group.bulkRemainingBundleQty +=
            Number(
              row[
                DELIVERY_IDX
                  .REMAINING_BUNDLE_QTY
              ]
            ) || 0;
        }
      }
    );


    /* ========================================================
       FINALIZE GROUPS
    ======================================================== */

    const deliveries =
      Object
        .keys(grouped)
        .map(
          function(deliveryId) {
            const group =
              grouped[deliveryId];


            /* ================================================
               YOURFINDS
            ================================================ */

            if (
              group.deliveryType ===
              DELIVERY_TYPE.YOURFINDS
            ) {
              const summary =
                buildYourFindsDeliverySummaryFromInventory(
                  deliveryId
                );


              /*
                If this is an older YourFinds delivery,
                Inventory remains the source of truth.
              */

              if (
                !Object.keys(
                  group.quantities
                ).length
              ) {
                group.quantities =
                  summary.quantities ||
                  {};
              }


              group.totalQty =
                Number(
                  summary.totalQty
                ) ||
                Object
                  .keys(
                    group.quantities
                  )
                  .reduce(
                    function(
                      total,
                      key
                    ) {
                      return (
                        total +
                        (
                          Number(
                            group.quantities[
                              key
                            ]
                          ) || 0
                        )
                      );
                    },
                    0
                  );


              group.firstCode =
                summary.firstCode ||
                "";


              group.lastCode =
                summary.lastCode ||
                "";


              /*
                YourFinds remains ACCEPTED.
              */

              group.status =
                group._statuses
                  .indexOf(
                    DELIVERY_STATUS.ACCEPTED
                  ) !== -1
                  ? DELIVERY_STATUS.ACCEPTED
                  : (
                      group._statuses[0] ||
                      DELIVERY_STATUS.ACCEPTED
                    );
            }


            /* ================================================
               YOURSTYLE
            ================================================ */

            if (
              group.deliveryType ===
              DELIVERY_TYPE.YOURSTYLE
            ) {
              /*
                Total Pieces Received means actual sellable
                pieces so far:

                DIRECT actual
                +
                BULK pieces actually distributed
              */

              group.totalQty +=
                group.bulkActualQuantity;


              const hasPending =
                group._statuses
                  .indexOf(
                    DELIVERY_STATUS.PENDING
                  ) !== -1;


              const hasPartial =
                group._statuses
                  .indexOf(
                    DELIVERY_STATUS.PARTIAL
                  ) !== -1;


              const hasCompleted =
                group._statuses
                  .indexOf(
                    DELIVERY_STATUS.COMPLETED
                  ) !== -1;


              /*
                STATUS PRIORITY

                PARTIAL takes priority once distribution
                has started.

                PENDING means bulk exists but no bundle has
                been distributed yet.

                COMPLETED means all bulk holders are closed.

                DIRECT-only deliveries remain ACCEPTED.
              */

              if (hasPartial) {
                group.status =
                  DELIVERY_STATUS.PARTIAL;

              } else if (hasPending) {
                group.status =
                  DELIVERY_STATUS.PENDING;

              } else if (
                group.hasBulk &&
                hasCompleted
              ) {
                group.status =
                  DELIVERY_STATUS.COMPLETED;

              } else {
                group.status =
                  DELIVERY_STATUS.ACCEPTED;
              }
            }


            /*
              Internal fields should not be sent to frontend.
            */

            delete group._statuses;


            return group;
          }
        );


    /* ========================================================
       NEWEST FIRST
    ======================================================== */

    deliveries.sort(
      function(a, b) {
        return (
          (
            b.timestampMs || 0
          ) -
          (
            a.timestampMs || 0
          ) ||
          b.rowNumber -
          a.rowNumber
        );
      }
    );


    return {
      success: true,
      count:
        deliveries.length,
      deliveries:
        deliveries
    };


  } catch (err) {
    return {
      success: false,

      message:
        err &&
        err.message
          ? err.message
          : String(err),

      deliveries: []
    };
  }
}

/* ==========================================================
   GET YOURFINDS DELIVERY BY ID

   READ-ONLY.
========================================================== */

function getYourFindsDeliveryById(
  deliveryId
) {

  try {

    deliveryId =
      String(
        deliveryId || ""
      )
        .trim()
        .toUpperCase();


    if (!deliveryId) {

      return {
        success: false,
        message: "Delivery ID is required."
      };

    }


    const historyResult =
      getYourFindsDeliveryHistory();


    if (!historyResult.success) {

      return historyResult;

    }


    const delivery =
      historyResult.deliveries.find(
        function(item) {

          return String(
            item.deliveryId || ""
          )
            .trim()
            .toUpperCase() ===
            deliveryId;

        }
      );


    if (!delivery) {

      return {
        success: false,
        message:
          "Delivery " +
          deliveryId +
          " was not found."
      };

    }


    return {

      success: true,

      delivery:
        delivery

    };


  } catch (err) {

    return {

      success: false,

      message:
        err &&
        err.message
          ? err.message
          : String(err)

    };

  }

}
