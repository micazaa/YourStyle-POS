/* ==========================================================
   YOURSTYLE POS
   CENTRAL CONSTANTS / COLUMN MAPPINGS

   IMPORTANT:

   *_IDX = JavaScript array index
            Used with getValues() / getDisplayValues()
            Starts at 0.

   *_COL = Google Sheets column number
            Used with getRange()
            Starts at 1.
========================================================== */


/* ==========================================================
   SHEET NAMES
========================================================== */

const SHEETS = {
  INVENTORY: "Inventory",
  SALES_LOG: "Sales Log",
  INVENTORY_MOVEMENT_LOG: "Inventory Movement Log",
  DELIVERY_LOG: "Delivery Log",
  CASH_REPORT_LOG: "Cash Report Log",
  EMPLOYEES: "Employees",
  PRODUCT_MASTER: "Product Master"
};  


/* ==========================================================
   INVENTORY

   A  Product Code
   B  Description
   C  Size
   D  Category
   E  Inventory Type
   F  Status
   G  Current Stock
   H  Stock Status
   I  Selling Price
   J  Original Price
   K  Image
   L  Created At
   M  Updated At
========================================================== */

const INV_IDX = {

  CODE: 0,
  DESCRIPTION: 1,
  SIZE: 2,
  CATEGORY: 3,
  INVENTORY_TYPE: 4,
  STATUS: 5,
  STOCK: 6,
  STOCK_STATUS: 7,
  YS_PRICE: 8,
  ORIG_PRICE: 9,
  IMAGE: 10,
  CREATED_AT: 11,
  UPDATED_AT: 12

};

const INV_COL = {

  CODE: 1,
  DESCRIPTION: 2,
  SIZE: 3,
  CATEGORY: 4,
  INVENTORY_TYPE: 5,
  STATUS: 6,
  STOCK: 7,
  STOCK_STATUS: 8,
  YS_PRICE: 9,
  ORIG_PRICE: 10,
  IMAGE: 11,
  CREATED_AT: 12,
  UPDATED_AT: 13

};

const INVENTORY_COLUMN_COUNT = 13;


/* ==========================================================
   SALES LOG

   A  Timestamp
   B  Receipt ID
   C  Cashier
   D  Code
   E  Item Name
   F  Size
   G  Category
   H  Quantity
   I  Price
   J  Discount
   K  Fee Charged
   L  Fee Absorbed
   M  Net Total
   N  Payment Method
   O  Reference
   P  Status
   Q  Cash Received
   R  Change
   S  Authorized By
   T  Reason / Void Reason
   U  Original Receipt ID
   V  Sales Line ID
   W  Entry Source
   X  Sync Status
   Y  Processed At
   Z  Sync Error
========================================================== */


const SALES_IDX = {

  TIMESTAMP: 0,
  RECEIPT_ID: 1,
  CASHIER: 2,
  CODE: 3,
  ITEM_NAME: 4,
  SIZE: 5,
  CATEGORY: 6,
  QUANTITY: 7,
  PRICE: 8,
  DISCOUNT: 9,
  FEE_CHARGED: 10,
  FEE_ABSORBED: 11,
  NET_TOTAL: 12,
  PAYMENT_METHOD: 13,
  REFERENCE: 14,
  STATUS: 15,
  CASH_RECEIVED: 16,
  CHANGE: 17,
  AUTHORIZED_BY: 18,

  VOID_REASON: 19,
  REASON: 19,
  ORIGINAL_RECEIPT_ID: 20,
  SALES_LINE_ID: 21,
  ENTRY_SOURCE: 22,
  SYNC_STATUS: 23,
  PROCESSED_AT: 24,
  SYNC_ERROR: 25

};


const SALES_COL = {

  TIMESTAMP: 1,
  RECEIPT_ID: 2,
  CASHIER: 3,
  CODE: 4,
  ITEM_NAME: 5,
  SIZE: 6,
  CATEGORY: 7,
  QUANTITY: 8,
  PRICE: 9,
  DISCOUNT: 10,
  FEE_CHARGED: 11,
  FEE_ABSORBED: 12,
  NET_TOTAL: 13,
  PAYMENT_METHOD: 14,
  REFERENCE: 15,
  STATUS: 16,
  CASH_RECEIVED: 17,
  CHANGE: 18,
  AUTHORIZED_BY: 19,

  VOID_REASON: 20,
  REASON: 20,
  ORIGINAL_RECEIPT_ID: 21,
  SALES_LINE_ID: 22,
  ENTRY_SOURCE: 23,
  SYNC_STATUS: 24,
  PROCESSED_AT: 25,
  SYNC_ERROR: 26

};


const SALES_LOG_COLUMN_COUNT = 26;


/* ==========================================================
   INVENTORY MOVEMENT LOG

   A  Movement ID
   B  Timestamp
   C  Source
   D  Reference ID
   E  Source Line ID
   F  Product Code
   G  Item Name
   H  Inventory Type
   I  Quantity Change
   J  Stock Before
   K  Stock After
   L  Employee
   M  Reason
   N  Bundle No.
   O  Remaining Bundle Qty
   P  Notes
========================================================== */


const MOVE_IDX = {
  MOVEMENT_ID: 0,
  TIMESTAMP: 1,
  SOURCE: 2,
  REFERENCE_ID: 3,
  SOURCE_LINE_ID: 4,
  CODE: 5,
  ITEM: 6,
  TYPE: 7,
  QTY_CHANGE: 8,
  STOCK_BEFORE: 9,
  STOCK_AFTER: 10,
  EMPLOYEE: 11,
  REASON: 12,
  BUNDLE_NO: 13,
  REMAINING_BUNDLE_QTY: 14,
  NOTES: 15
};

const MOVE_COL = {
  MOVEMENT_ID: 1,
  TIMESTAMP: 2,
  SOURCE: 3,
  REFERENCE_ID: 4,
  SOURCE_LINE_ID: 5,
  CODE: 6,
  ITEM: 7,
  TYPE: 8,
  QTY_CHANGE: 9,
  STOCK_BEFORE: 10,
  STOCK_AFTER: 11,
  EMPLOYEE: 12,
  REASON: 13,
  BUNDLE_NO: 14,
  REMAINING_BUNDLE_QTY: 15,
  NOTES: 16
};

const MOVEMENT_LOG_COLUMN_COUNT = 16;


/* ==========================================================
   G
========================================================== */

const DELIVERY_IDX = {
  DELIVERY_ID: 0,
  DELIVERY_NO: 1,
  DELIVERY_DATE: 2,
  TIMESTAMP: 3,
  DRIVER_NAME: 4,
  PLATE_NO: 5,
  ACCEPTED_BY: 6,
  DELIVERY_TYPE: 7,
  TYPE: 8,
  CATEGORY: 9,
  RECEIVE_MODE: 10,
  DESCRIPTION: 11,
  BUNDLE_QTY: 12,
  ESTIMATED_QTY: 13,
  ACTUAL_QTY: 14,
  REMAINING_QTY: 15,
  REMAINING_BUNDLE_QTY: 16,
  VARIANCE: 17,
  STATUS: 18,
  REMARKS: 19
};

const DELIVERY_COL = {
  DELIVERY_ID: 1,
  DELIVERY_NO: 2,
  DELIVERY_DATE: 3,
  TIMESTAMP: 4,
  DRIVER_NAME: 5,
  PLATE_NO: 6,
  ACCEPTED_BY: 7,
  DELIVERY_TYPE: 8,
  TYPE: 9,
  CATEGORY: 10,
  RECEIVE_MODE: 11,
  DESCRIPTION: 12,
  BUNDLE_QTY: 13,
  ESTIMATED_QTY: 14,
  ACTUAL_QTY: 15,
  REMAINING_QTY: 16,
  REMAINING_BUNDLE_QTY: 17,
  VARIANCE: 18,
  STATUS: 19,
  REMARKS: 20
};

const DELIVERY_LOG_COLUMN_COUNT = 20;


/* ==========================================================
   SHARED INVENTORY VALUES

   Centralize frequently-used stored values so we don't
   scatter spelling variations throughout the project.
========================================================== */

const INVENTORY_STATUS = {

  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  INCOMPLETE: "INCOMPLETE",
  RETURNED: "RETURNED"

};

const INVENTORY_TYPE = {

  STOCK: "STOCK",
  UNIQUE: "UNIQUE"

};


/* ==========================================================
   YOURFINDS SIZE VALUES
========================================================== */

const YOURFINDS_SIZE_CODE = {
  SNE: "1",
  MNE: "2",
  LNE: "3",
  XLNE: "4",
  SE: "5",
  ME: "6",
  LE: "7",
  XLE: "8",
  CUSTOM: "9"
};

const YOURFINDS_SIZE_ORDER = [
  "SNE", "MNE", "LNE", "XLNE",
  "SE", "ME", "LE", "XLE",
  "CUSTOM"
];

/* ==========================================================
   CASH REPORT LOG
========================================================== */

const CASH_REPORT_IDX = {

  REPORT_ID: 0,
  TIMESTAMP: 1,
  REPORT_TYPE: 2,
  REPORT_DATE: 3,
  EMPLOYEE: 4,
  MANAGER: 5,
  SHIFT_START: 6,
  SHIFT_END: 7,
  EXPECTED_CASH: 8,

  CASH_1000: 9,
  CASH_500: 10,
  CASH_200: 11,
  CASH_100: 12,
  CASH_50: 13,
  CASH_20: 14,
  CASH_10: 15,
  CASH_5: 16,
  CASH_1: 17,

  CASH_COUNTED: 18,
  CASH_VARIANCE: 19,
  CASH_REMARK: 20,

  PETTY_RECEIVED: 21,

  PETTY_1000: 22,
  PETTY_500: 23,
  PETTY_200: 24,
  PETTY_100: 25,
  PETTY_50: 26,
  PETTY_20: 27,
  PETTY_10: 28,
  PETTY_5: 29,
  PETTY_1: 30,

  PETTY_RETURNED: 31,
  PETTY_VARIANCE: 32,
  PETTY_VOUCHER_NO: 33,
  PETTY_REMARK: 34,

  STATUS: 35,
  UPDATED_AT: 36

};


const CASH_REPORT_COL = {

  REPORT_ID: 1,
  TIMESTAMP: 2,
  REPORT_TYPE: 3,
  REPORT_DATE: 4,
  EMPLOYEE: 5,
  MANAGER: 6,
  SHIFT_START: 7,
  SHIFT_END: 8,
  EXPECTED_CASH: 9,

  CASH_1000: 10,
  CASH_500: 11,
  CASH_200: 12,
  CASH_100: 13,
  CASH_50: 14,
  CASH_20: 15,
  CASH_10: 16,
  CASH_5: 17,
  CASH_1: 18,

  CASH_COUNTED: 19,
  CASH_VARIANCE: 20,
  CASH_REMARK: 21,

  PETTY_RECEIVED: 22,

  PETTY_1000: 23,
  PETTY_500: 24,
  PETTY_200: 25,
  PETTY_100: 26,
  PETTY_50: 27,
  PETTY_20: 28,
  PETTY_10: 29,
  PETTY_5: 30,
  PETTY_1: 31,

  PETTY_RETURNED: 32,
  PETTY_VARIANCE: 33,
  PETTY_VOUCHER_NO: 34,
  PETTY_REMARK: 35,

  STATUS: 36,
  UPDATED_AT: 37

};

const CASH_REPORT_COLUMN_COUNT = 37;

const INVENTORY_MOVEMENT_TYPE = {
  YOURFINDS: "YOURFINDS",
  PINS: "PINS",
  OTHERS: "OTHERS",
  BULK_PINS: "BULK_PINS",
  BULK_OTHERS: "BULK_OTHERS"
};

const INVENTORY_MOVEMENT_SOURCE = {
  SALE: "SALE",
  VOID: "VOID",
  DELIVERY: "DELIVERY",
  DISTRIBUTION: "DISTRIBUTION",
  SUPPLIER_RETURN: "SUPPLIER_RETURN",
  ADJUSTMENT: "ADJUSTMENT",

  EXCHANGE: "EXCHANGE"
};

/* ==========================================================
   PRODUCT MASTER

   A  Product Code
   B  Description
   C  Category
   D  Inventory Type
   E  Selling Price
   F  Cost Price
   G  Low Stock At
   H  Active
   I  Image
   J  Created At
   K  Updated At
========================================================== */

const PRODUCT_IDX = {

  PRODUCT_CODE: 0,
  DESCRIPTION: 1,
  CATEGORY: 2,
  INVENTORY_TYPE: 3,
  SELLING_PRICE: 4,
  DEFAULT_PRICE: 4,
  COST_PRICE: 5,
  LOW_STOCK_AT: 6,
  ACTIVE: 7,
  IMAGE: 8,
  CREATED_AT: 9,
  UPDATED_AT: 10

};


const PRODUCT_COL = {

  PRODUCT_CODE: 1,
  DESCRIPTION: 2,
  CATEGORY: 3,
  INVENTORY_TYPE: 4,
  SELLING_PRICE: 5,
  DEFAULT_PRICE: 5,
  COST_PRICE: 6,
  LOW_STOCK_AT: 7,
  ACTIVE: 8,
  IMAGE: 9,
  CREATED_AT: 10,
  UPDATED_AT: 11

};


const PRODUCT_MASTER_COLUMN_COUNT = 11;

/* ==========================================================
   DELIVERY VALUES
========================================================== */

const DELIVERY_TYPE = {
  YOURFINDS: "YOURFINDS",
  YOURSTYLE: "YOURSTYLE"
};

const DELIVERY_RECEIVE_MODE = {
  DIRECT: "DIRECT",
  BULK: "BULK"
};

const DELIVERY_STATUS = {
  ACCEPTED: "ACCEPTED",
  PENDING: "PENDING",
  PARTIAL: "PARTIAL",
  COMPLETED: "COMPLETED"
};
