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
========================================================== */

const INV_IDX = {

  IMAGE: 0,
  DESCRIPTION: 1,
  SIZE: 2,
  ORIG_PRICE: 3,
  YS_PRICE: 4,
  STATUS: 5,
  CODE: 6,
  STOCK: 7,
  CATEGORY: 8,
  INVENTORY_TYPE: 9,
  LOW_STOCK_AT: 10,
  DATE_DELIVERED: 11,
  DELIVERY_ID: 12,
  CREATED_AT: 13,
  UPDATED_AT: 14

};

const INV_COL = {

  IMAGE: 1,
  DESCRIPTION: 2,
  SIZE: 3,
  ORIG_PRICE: 4,
  YS_PRICE: 5,
  STATUS: 6,
  CODE: 7,
  STOCK: 8,
  CATEGORY: 9,
  INVENTORY_TYPE: 10,
  LOW_STOCK_AT: 11,
  DATE_DELIVERED: 12,
  DELIVERY_ID: 13,
  CREATED_AT: 14,
  UPDATED_AT: 15

};

const INVENTORY_COLUMN_COUNT = 15;


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
  ORIGINAL_RECEIPT_ID: 20

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
  ORIGINAL_RECEIPT_ID: 21

};


const SALES_LOG_COLUMN_COUNT = 21;


/* ==========================================================
   INVENTORY MOVEMENT LOG

   A  Timestamp
   B  Code
   C  Type
   D  Qty Change
   E  Stock Before
   F  Stock After
   G  Reference ID
   H  Employee
   I  Item
   J  Reason
   K  Source
   L  Notes
========================================================== */


const MOVE_IDX = {
  TIMESTAMP: 0,
  CODE: 1,
  TYPE: 2,
  QTY_CHANGE: 3,
  STOCK_BEFORE: 4,
  STOCK_AFTER: 5,
  REFERENCE_ID: 6,
  EMPLOYEE: 7,
  ITEM: 8,
  REASON: 9,
  SOURCE: 10,
  BUNDLE_NO: 11,
  REMAINING_BUNDLE_QTY: 12,
  NOTES: 13
};

const MOVE_COL = {
  TIMESTAMP: 1,
  CODE: 2,
  TYPE: 3,
  QTY_CHANGE: 4,
  STOCK_BEFORE: 5,
  STOCK_AFTER: 6,
  REFERENCE_ID: 7,
  EMPLOYEE: 8,
  ITEM: 9,
  REASON: 10,
  SOURCE: 11,
  BUNDLE_NO: 12,
  REMAINING_BUNDLE_QTY: 13,
  NOTES: 14
};

const MOVEMENT_LOG_COLUMN_COUNT = 14;


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
   D  Default Price
   E  Original Price
   F  Inventory Type
   G  Low Stock At
   H  Active
   I  Created At
   J  Updated At
========================================================== */

const PRODUCT_IDX = {

  PRODUCT_CODE: 0,
  DESCRIPTION: 1,
  CATEGORY: 2,
  DEFAULT_PRICE: 3,
  ORIGINAL_PRICE: 4,
  INVENTORY_TYPE: 5,
  LOW_STOCK_AT: 6,
  ACTIVE: 7,
  CREATED_AT: 8,
  UPDATED_AT: 9

};


const PRODUCT_COL = {

  PRODUCT_CODE: 1,
  DESCRIPTION: 2,
  CATEGORY: 3,
  DEFAULT_PRICE: 4,
  ORIGINAL_PRICE: 5,
  INVENTORY_TYPE: 6,
  LOW_STOCK_AT: 7,
  ACTIVE: 8,
  CREATED_AT: 9,
  UPDATED_AT: 10

};


const PRODUCT_MASTER_COLUMN_COUNT = 10;

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
