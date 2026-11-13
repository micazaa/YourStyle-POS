const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadReport(details) {
  let html;
  const context = vm.createContext({
    assertAppRequest_() {},
    ACCESS_REQUEST_CONTEXT_: {actor:{name:'Bea <Manager>'}},
    SpreadsheetApp: {getActiveSpreadsheet:() => ({})},
    readDeliveryPageRows_:() => [],
    formatInventoryDateForClient:value => value,
    dashboardOverviewDate_:value => String(value || '').slice(0,10),
    getDeliveryDetails: () => details,
    Utilities: {
      newBlob(value) {
        html = value;
        return { getAs: () => ({ getBytes: () => [37, 80, 68, 70] }) };
      },
      base64Encode: bytes => Buffer.from(bytes).toString('base64')
    }
  });
  vm.runInContext(fs.readFileSync('Backend/Constants.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('Backend/DeliveryReceiptReport.js', 'utf8'), context);
  return { context, getHtml: () => html };
}

test('delivery receipt keeps title bold and information above table regular weight', () => {
  const details = {
    id: 'YFD-20261003-742', date: '2026-10-03', yourFinds: true,
    driver: 'Jeffrey <Q>', plate: 'NGO 2724', preparedBy: 'Emerose C. Estrada',
    acceptedBy: 'Mica Tambalong', remarks: 'Checked',
    reportLines: [{ code: 'SNE', description: 'Small non-electronic', quantity: 40, remarks: '' }],
    reportTotal: '40'
  };
  const { context, getHtml } = loadReport(details);
  const result = context.createDeliveryReceiptPdf(details.id);
  const html = getHtml();
  assert.equal(result.success, true);
  assert.equal(result.fileName, 'Delivery_Receipt_YFD-20261003-742.pdf');
  assert.equal(result.base64, 'JVBERg==');
  assert.match(html, /h1\{[^}]*font-weight:700/);
  assert.match(html, /\.header-right\{[^}]*font-weight:400/);
  assert.match(html, /\.detail-value\{[^}]*font-weight:400/);
  assert.match(html, /\.delivery-id\{[^}]*border:1px solid #d8a7a7/);
  assert.match(html, /\.items th\{[^}]*background-color:#f2dede/);
  assert.match(html, /<th bgcolor="#f2dede">Code<\/th>/);
  assert.match(html, /Jeffrey &lt;Q&gt;/);
  assert.match(html, /October 3, 2026/);
  assert.match(html, /<td>SNE<\/td><td>Small non-electronic<\/td><td class="qty">40<\/td>/);
});

test('dashboard return export groups YourFinds by size and shows category totals above the items', () => {
  const {context, getHtml} = loadReport();
  const rows = [
    {id:'RET-1', returnDate:'2026-11-11', category:'YOURFINDS', code:'11000123', name:'YourFinds', size:'MNE', quantity:1},
    {id:'RET-2', returnDate:'2026-11-12', category:'YOURFINDS', code:'11000456', name:'YourFinds', size:'M', quantity:2},
    {id:'RET-2', returnDate:'2026-11-12', category:'YOURFINDS', code:'11000789', name:'YourFinds', size:'SNE', quantity:1},
    {id:'RET-2', returnDate:'2026-11-12', category:'PINS', code:'PIN-1', name:'Pins', quantity:4, reason:'Damaged', driver:'Driver name', receivedBy:'Receiver name'},
    {id:'RET-3', returnDate:'2026-11-12', category:'OTHERS', code:'BAG-1', name:'Bag & pouch', quantity:2},
    {id:'RET-4', returnDate:'2026-11-13', category:'OTHERS', code:'OUTSIDE', name:'Outside range', quantity:7},
  ];
  Object.assign(context, {
    dashboardDate_: date => date,
    dashboardYourFindsReturnSize_: size => size === 'M' ? 'MNE' : size,
    isDevelopmentSpreadsheet_: () => true,
    dashboardReturnRows_: (start, end) => rows.filter(row => row.returnDate >= start && row.returnDate <= end),
    getSupplierReturns: () => rows,
  });
  context.readDeliveryPageRows_ = () => [['YFD-20261111-001','2026-11-11','','Driver & Co.','ABC "123"']];
  const result = context.createDashboardReturnPdf({start:'2026-11-11',end:'2026-11-12',preparedBy:'Forged name',driver:'Wrong driver',plate:'Wrong plate'});
  const summary = getHtml();
  assert.equal(result.fileName,'Return_Report_Summary_2026-11-11_to_2026-11-12.pdf');
  assert.match(summary, /<h1>RETURN REPORT SUMMARY<\/h1>/);
  assert.match(summary, /November 11, 2026 – November 12, 2026/);
  assert.match(summary, /<th>Code<\/th><th>Description<\/th><th class="qty">Qty<\/th>/);
  assert.doesNotMatch(summary, /<th>Size<\/th>/);
  assert.match(summary, /<td>MNE<\/td><td>0123, 0456<\/td><td class="qty">3<\/td>/);
  assert.match(summary, /<td>SNE<\/td><td>0789<\/td><td class="qty">1<\/td>/);
  assert.match(summary, /<td>PIN-1<\/td><td>Pins<\/td><td class="qty">4<\/td>/);
  assert.ok(summary.indexOf('<table class="totals">') < summary.indexOf('<table class="items">'));
  assert.doesNotMatch(summary, /11000123|11000456|11000789/);
  assert.match(summary, /Bag &amp; pouch/);
  assert.match(summary, /<strong>Prepared By<\/strong>Bea &lt;Manager&gt;/);
  assert.match(summary, /<strong>Driver Name<\/strong>Driver &amp; Co\./);
  assert.match(summary, /<strong>Plate No\.<\/strong>ABC &quot;123&quot;/);
  assert.doesNotMatch(summary, /OUTSIDE|Driver name|Receiver name|Prepared by|Damaged|Return Receipt Form|Forged name|Wrong driver|Wrong plate/);
  const totals = Array.from(summary.matchAll(/class="total-value">(\d+)<\/div><div class="total-label">([^<]+)/g),
    ([, value, label]) => [label, Number(value)]);
  assert.deepEqual(totals, [['TOTAL YF', 4], ['TOTAL PIN', 4], ['TOTAL OTHERS', 2]]);
  assert.match(summary, /<tr class="grand-total"><td colspan="2">GRAND TOTAL<\/td><td class="qty">10<\/td><\/tr><\/tbody><\/table><\/body>/);
  assert.equal(context.createSupplierReturnPdf('RET-1').success, true);
  assert.match(getHtml(), /<h1>Return Receipt Form<\/h1>/);
  assert.equal(context.createDashboardReturnPdf({start:'2026-11-10',end:'2026-11-10'}).success,false);
  context.ACCESS_REQUEST_CONTEXT_ = {actor:null};
  assert.throws(() => context.createDashboardReturnPdf({start:'2026-11-11',end:'2026-11-12'}), /unavailable/);
});

test('return PDF uses unique drivers and plates from YFD deliveries inside the inclusive selected range', () => {
  const {context} = loadReport();
  context.readDeliveryPageRows_ = (_ss, sheet, width, display) => {
    assert.equal(sheet,'Delivery Log');assert.equal(width,5);assert.equal(display,false);
    return [
      ['YFD-20261110-001','2026-11-10','','Earlier driver','OLD'],
      ['YFD-20261111-001','2026-11-11','',' Driver One ','ABC 123'],
      ['YFD-20261111-001','2026-11-11','','driver   one','abc 123'],
      ['YSD-20261112-001','2026-11-12','','YourStyle driver','YS 123'],
      ['YFD-20261112-001','2026-11-12','','Driver Two','DEF 456'],
      ['YFD-20261112-002','2026-11-12','','Driver One','DEF 456'],
      ['YFD-20261112-003','2026-11-12','','',''],
      ['YFD-20261113-001','2026-11-13','','Later driver','NEW'],
      ['YFD-UNKNOWN','','','Undated','UNKNOWN'],
    ];
  };
  assert.deepEqual({...context.dashboardReturnReportDetails_('2026-11-11','2026-11-12','Signed-in User')},
    {preparedBy:'Signed-in User',driver:'Driver One, Driver Two',plate:'ABC 123, DEF 456'});
  assert.deepEqual({...context.dashboardReturnReportDetails_('2026-11-09','2026-11-09','Signed-in User')},
    {preparedBy:'Signed-in User',driver:'—',plate:'—'});
});

test('return summary combines matching descriptions across product codes and keeps totals', () => {
  const {context} = loadReport();
  context.dashboardYourFindsReturnSize_ = size => size;
  const rows = [
    {category:'Others',code:'300005',name:'BAG',quantity:1},
    {category:'OTHERS',code:'200017',name:' bag ',size:'L',quantity:1},
    {category:'Others',code:'300005',name:'BAG',quantity:2},
    {category:'Others',code:'500009',name:'BLACK SHOES',quantity:1},
    {category:'PINS',code:'100003',name:'BLUE',quantity:14},
    {category:'PINS',code:'100003',name:'BLUE',quantity:1},
    {category:'PINS',code:'600003',name:'BLUE (NEW)',quantity:2},
    {category:'YourFinds',code:'1016261044',name:'BAG',size:'SNE',quantity:1},
    {category:'YourFinds',code:'1016261041',name:'Other name',size:'SNE',quantity:1},
    {category:'Others',code:'UNKNOWN-1',name:'',quantity:1},
    {category:'Others',code:'UNKNOWN-2',name:'',quantity:1},
  ];
  const report = context.buildDashboardReturnReportHtml_(rows,'2026-11-13','2026-11-13',
    {preparedBy:'Preparer',driver:'Driver',plate:'ABC 123'});
  assert.match(report, /<td>300005, 200017<\/td><td>BAG<\/td><td class="qty">4<\/td>/);
  assert.equal((report.match(/<td>BAG<\/td>/g)||[]).length,1);
  assert.match(report, /<td>100003<\/td><td>BLUE<\/td><td class="qty">15<\/td>/);
  assert.match(report, /<td>600003<\/td><td>BLUE \(NEW\)<\/td><td class="qty">2<\/td>/);
  assert.match(report, /<td>SNE<\/td><td>1044, 1041<\/td><td class="qty">2<\/td>/);
  assert.match(report, /<td>UNKNOWN-1<\/td><td><\/td><td class="qty">1<\/td>/);
  assert.match(report, /<td>UNKNOWN-2<\/td><td><\/td><td class="qty">1<\/td>/);
  assert.match(report, /GRAND TOTAL<\/td><td class="qty">26<\/td>/);
});

test('delivery receipt keeps original items and adds conversion and final-summary tables', () => {
  const details = {
    id: 'YFD-20261013-570', date: '2026-10-13', yourFinds: true,
    driver: 'Driver', plate: 'ABC 123', preparedBy: 'Preparer', acceptedBy: 'Receiver', remarks: '',
    reportLines: [
      { code: 'LNE', description: 'Large non-electronic', quantity: 1, remarks: '' },
      { code: 'ME', description: 'Medium electronic', quantity: 2, remarks: '' }
    ],
    reportTotal: '3',
    adjustmentLines: [{
      referenceId: 'ADJ-1', fromCode: '101326001', fromSize: 'ME', fromQuantity: 1,
      toSize: 'SNE / MNE', toQuantity: 3, targetCodes: ['101321001', '101321002', '101322001'],
      targets: [
        {toSize:'SNE',toQuantity:2,targetCodes:['101321001','101321002']},
        {toSize:'MNE',toQuantity:1,targetCodes:['101322001']}
      ],
      notes: 'Actual contents used mixed sizes.'
    }],
    finalReportLines: [
      { code: 'SNE', description: 'Small non-electronic', quantity: 2, remarks: '' },
      { code: 'MNE', description: 'Medium non-electronic', quantity: 1, remarks: '' },
      { code: 'LNE', description: 'Large non-electronic', quantity: 1, remarks: '' },
      { code: 'ME', description: 'Medium electronic', quantity: 1, remarks: '' }
    ],
    finalReportTotal: '5'
  };
  const { context, getHtml } = loadReport(details);
  assert.equal(context.createDeliveryReceiptPdf(details.id).success, true);
  const html = getHtml();
  assert.match(html, /<h2>Items Received<\/h2>/);
  assert.match(html, /<td>ME<\/td><td>Medium electronic<\/td><td class="qty">2<\/td>/);
  assert.match(html, /<h2>Adjustments<\/h2>/);
  assert.match(html, /<td>ME<\/td><td class="qty">1<\/td><td>SNE × 2<br>MNE × 1<\/td>/);
  assert.doesNotMatch(html, /101326001|101321001|101321002|101322001/);
  assert.match(html, /<h2>Final Items Received<\/h2>/);
  assert.match(html, /Final inventory units<\/td><td class="qty">5<\/td>/);
});
