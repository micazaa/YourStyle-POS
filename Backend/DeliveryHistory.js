/* ==========================================================
   UNIVERSAL DELIVERY HISTORY - FAST READER

   Reads:
   - Delivery Log ONCE
   - Inventory ONCE

   Used by Deliveries Page only.
========================================================== */

function getDeliveryHistoryFast() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const deliverySheet = ss.getSheetByName(SHEETS.DELIVERY_LOG);
    const inventorySheet = ss.getSheetByName(SHEETS.INVENTORY);

    if (!deliverySheet) {
      throw new Error("Delivery Log sheet not found.");
    }

    if (deliverySheet.getLastRow() < 2) {
      return {
        success: true,
        count: 0,
        deliveries: []
      };
    }

    /* ========================================================
       INVENTORY - ONE READ

       Build all YourFinds summaries in memory.
    ======================================================== */

    const yourFindsInventory = {};

    if (
      inventorySheet &&
      inventorySheet.getLastRow() >= 2
    ) {
      const inventoryRows =
        inventorySheet
          .getRange(
            2,
            1,
            inventorySheet.getLastRow() - 1,
            INVENTORY_COLUMN_COUNT
          )
          .getDisplayValues();

      inventoryRows.forEach(function(row) {
        const deliveryId =
          String(
            row[INV_IDX.DELIVERY_ID] || ""
          ).trim();

        if (!deliveryId) return;

        const category =
          String(
            row[INV_IDX.CATEGORY] || ""
          )
            .trim()
            .toUpperCase();

        const inventoryType =
          String(
            row[INV_IDX.INVENTORY_TYPE] || ""
          )
            .trim()
            .toUpperCase();

        if (
          category !== "YOURFINDS" &&
          inventoryType !== INVENTORY_TYPE.UNIQUE
        ) {
          return;
        }

        if (!yourFindsInventory[deliveryId]) {
          yourFindsInventory[deliveryId] = {
            quantities: {},
            totalQty: 0,
            codes: []
          };
        }

        const summary =
          yourFindsInventory[deliveryId];

        const size =
          String(
            row[INV_IDX.SIZE] || "UNKNOWN"
          )
            .trim()
            .toUpperCase() ||
          "UNKNOWN";

        const code =
          String(
            row[INV_IDX.CODE] || ""
          ).trim();

        summary.quantities[size] =
          (summary.quantities[size] || 0) + 1;

        summary.totalQty++;

        if (code) {
          summary.codes.push(code);
        }
      });
    }

    /* ========================================================
       DELIVERY LOG - ONE READ
    ======================================================== */

    const rowCount =
      deliverySheet.getLastRow() - 1;

    const values =
      deliverySheet
        .getRange(
          2,
          1,
          rowCount,
          DELIVERY_LOG_COLUMN_COUNT
        )
        .getValues();

    const display =
      deliverySheet
        .getRange(
          2,
          1,
          rowCount,
          DELIVERY_LOG_COLUMN_COUNT
        )
        .getDisplayValues();

    const grouped = {};

    values.forEach(function(row, index) {
      const d = display[index];

      const deliveryId =
        String(
          d[DELIVERY_IDX.DELIVERY_ID] || ""
        ).trim();

      if (!deliveryId) return;

      let deliveryType =
        String(
          d[DELIVERY_IDX.DELIVERY_TYPE] || ""
        )
          .trim()
          .toUpperCase();

      /*
        Backward compatibility for older YourFinds rows.
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
        deliveryType !== DELIVERY_TYPE.YOURFINDS &&
        deliveryType !== DELIVERY_TYPE.YOURSTYLE
      ) {
        return;
      }

      /* ======================================================
         CREATE DELIVERY GROUP
      ====================================================== */

      if (!grouped[deliveryId]) {
        grouped[deliveryId] = {
          rowNumber:
            index + 2,

          deliveryId:
            deliveryId,

          deliveryNo:
            String(
              d[DELIVERY_IDX.DELIVERY_NO] || ""
            ).trim(),

          deliveryDate:
            String(
              d[DELIVERY_IDX.DELIVERY_DATE] || ""
            ).trim(),

          timestamp:
            String(
              d[DELIVERY_IDX.TIMESTAMP] || ""
            ).trim(),

          timestampMs:
            row[DELIVERY_IDX.TIMESTAMP] instanceof Date
              ? row[
                  DELIVERY_IDX.TIMESTAMP
                ].getTime()
              : 0,

          driverName:
            String(
              d[DELIVERY_IDX.DRIVER_NAME] || ""
            ).trim(),

          plateNo:
            String(
              d[DELIVERY_IDX.PLATE_NO] || ""
            ).trim(),

          acceptedBy:
            String(
              d[DELIVERY_IDX.ACCEPTED_BY] || ""
            ).trim(),

          deliveryType:
            deliveryType,

          status:
            "",

          remarks:
            String(
              d[DELIVERY_IDX.REMARKS] || ""
            ).trim(),

          quantities: {},

          totalQty: 0,

          firstCode: "",
          lastCode: "",

          hasBulk: false,

          bulkTypes: [],

          bulkBundleQty: 0,

          bulkEstimatedQuantity: 0,

          bulkActualQuantity: 0,

          bulkRemainingQuantity: 0,

          bulkRemainingBundleQty: 0,

          openBulkHolderCount: 0,

          _statuses: []
        };
      }

      const group =
        grouped[deliveryId];

      const type =
        String(
          d[DELIVERY_IDX.TYPE] || ""
        )
          .trim()
          .toUpperCase();

      const category =
        String(
          d[DELIVERY_IDX.CATEGORY] || ""
        )
          .trim()
          .toUpperCase();

      const receiveMode =
        String(
          d[DELIVERY_IDX.RECEIVE_MODE] || ""
        )
          .trim()
          .toUpperCase();

      const rowStatus =
        String(
          d[DELIVERY_IDX.STATUS] || ""
        )
          .trim()
          .toUpperCase();

      const actualQty =
        Number(
          row[DELIVERY_IDX.ACTUAL_QTY]
        ) || 0;

      if (rowStatus) {
        group._statuses.push(rowStatus);
      }

      /* ======================================================
         YOURFINDS
      ====================================================== */

      if (
        deliveryType ===
        DELIVERY_TYPE.YOURFINDS
      ) {
        if (
          category &&
          category !== "MULTIPLE"
        ) {
          group.quantities[category] =
            (
              group.quantities[category] ||
              0
            ) +
            actualQty;
        }

        return;
      }

      /* ======================================================
         YOURSTYLE DIRECT
      ====================================================== */

      if (
        receiveMode ===
        DELIVERY_RECEIVE_MODE.DIRECT
      ) {
        const key =
          category ||
          type ||
          "DIRECT";

        group.quantities[key] =
          (
            group.quantities[key] ||
            0
          ) +
          actualQty;

        group.totalQty +=
          actualQty;

        return;
      }

      /* ======================================================
         YOURSTYLE BULK
      ====================================================== */

      if (
        receiveMode ===
        DELIVERY_RECEIVE_MODE.BULK
      ) {
        group.hasBulk =
          true;

        if (
          type &&
          group.bulkTypes.indexOf(type) === -1
        ) {
          group.bulkTypes.push(type);
        }

        group.bulkBundleQty +=
          Number(
            row[DELIVERY_IDX.BUNDLE_QTY]
          ) || 0;

        group.bulkEstimatedQuantity +=
          Number(
            row[DELIVERY_IDX.ESTIMATED_QTY]
          ) || 0;

        group.bulkActualQuantity +=
          actualQty;

        group.bulkRemainingQuantity +=
          Math.max(
            0,
            (Number(row[DELIVERY_IDX.ESTIMATED_QTY]) || 0) - actualQty
          );

        group.bulkRemainingBundleQty = 0;

        if (
          rowStatus === DELIVERY_STATUS.PENDING ||
          rowStatus === DELIVERY_STATUS.PARTIAL
        ) {
          group.openBulkHolderCount++;
        }
      }
    });

    /* ========================================================
       FINALIZE
    ======================================================== */

    const deliveries =
      Object
        .keys(grouped)
        .map(function(deliveryId) {
          const group =
            grouped[deliveryId];

          /* ================= YOURFINDS ================= */

          if (
            group.deliveryType ===
            DELIVERY_TYPE.YOURFINDS
          ) {
            const inventorySummary =
              yourFindsInventory[
                deliveryId
              ];

            if (inventorySummary) {
              group.quantities =
                inventorySummary.quantities;

              group.totalQty =
                inventorySummary.totalQty;

              group.firstCode =
                inventorySummary.codes[0] ||
                "";

              group.lastCode =
                inventorySummary.codes[
                  inventorySummary.codes.length -
                    1
                ] ||
                "";

            } else {
              group.totalQty =
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
            }

            group.status =
              group._statuses.indexOf(
                DELIVERY_STATUS.ACCEPTED
              ) !== -1
                ? DELIVERY_STATUS.ACCEPTED
                : (
                    group._statuses[0] ||
                    DELIVERY_STATUS.ACCEPTED
                  );
          }

          /* ================= YOURSTYLE ================= */

          if (
            group.deliveryType ===
            DELIVERY_TYPE.YOURSTYLE
          ) {
            /*
              Actual sellable pieces received so far:

              DIRECT
              +
              BULK already distributed
            */

            group.totalQty +=
              group.bulkActualQuantity;

            const hasPartial =
              group._statuses.indexOf(
                DELIVERY_STATUS.PARTIAL
              ) !== -1;

            const hasPending =
              group._statuses.indexOf(
                DELIVERY_STATUS.PENDING
              ) !== -1;

            const hasCompleted =
              group._statuses.indexOf(
                DELIVERY_STATUS.COMPLETED
              ) !== -1;

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

          delete group._statuses;

          return group;
        });

    /* ========================================================
       NEWEST FIRST
    ======================================================== */

    deliveries.sort(function(a, b) {
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
    });

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