function escapeDeliveryReceiptHtml_(value) {
  return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, function(character) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character];
  });
}

function formatDeliveryReceiptDate_(value) {
  const text=String(value||'').trim();
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if(!match)return text;
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const month=months[Number(match[2])-1];
  return month?month+' '+Number(match[3])+', '+match[1]:text;
}

function buildDeliveryReceiptPage_(details) {
  const safe=escapeDeliveryReceiptHtml_;
  const isReturn=!!details.returnReceipt;
  const returnSizes=new Map();
  if(isReturn&&details.yourFinds)(details.reportLines||[]).forEach(function(line) {
    const size=String(line.size||'Unspecified size').trim();
    returnSizes.set(size,(returnSizes.get(size)||0)+(Number(line.quantity)||0));
  });
  const returnSizeSummary=returnSizes.size
    ? '<div class="report-section return-size-summary"><h2>Size Summary</h2><table class="items"><thead><tr bgcolor="#f2dede"><th bgcolor="#f2dede">Size</th><th class="qty" bgcolor="#f2dede">Qty</th></tr></thead><tbody>'+
      Array.from(returnSizes,([size,quantity])=>'<tr><td>'+safe(size)+'</td><td class="qty">'+safe(quantity)+'</td></tr>').join('')+
      '<tr class="total"><td>Total</td><td class="qty">'+safe(details.reportTotal)+'</td></tr></tbody></table></div>'
    : '';
  const lines=(details.reportLines||[]).map(function(line) {
    return '<tr><td>'+safe(line.code)+'</td><td>'+safe(line.description)+'</td>'+(isReturn?'<td>'+safe(line.size)+'</td>':'')+'<td class="qty">'+safe(line.quantity)+'</td><td>'+safe(line.remarks)+'</td></tr>';
  }).join('');
  const adjustments=(details.adjustmentLines||[]).map(function(line) {
    const from=line.fromSize;
    const targets=Array.isArray(line.targets)&&line.targets.length?line.targets:[{toSize:line.toSize,toQuantity:line.toQuantity,targetCodes:line.targetCodes||[]}];
    const to=targets.map(function(target){
      return safe(target.toSize||target.targetSize)+' × '+safe(target.toQuantity||target.resultQuantity||0);
    }).join('<br>');
    const total=targets.reduce(function(sum,target){return sum+(Number(target.toQuantity||target.resultQuantity)||0);},0);
    return '<tr><td>'+safe(line.referenceId)+'</td><td>'+safe(from)+'</td><td class="qty">'+safe(line.fromQuantity)+'</td><td>'+to+'</td><td class="qty">'+safe(total)+'</td><td>'+safe(line.notes)+'</td></tr>';
  }).join('');
  const finalLines=(details.finalReportLines||[]).map(function(line) {
    return '<tr><td>'+safe(line.code)+'</td><td>'+safe(line.description)+'</td><td class="qty">'+safe(line.quantity)+'</td><td>'+safe(line.remarks)+'</td></tr>';
  }).join('');
  const adjustmentSection=adjustments
    ? '<div class="report-section"><h2>Adjustments</h2><table class="items adjustments"><thead><tr bgcolor="#f2dede"><th bgcolor="#f2dede">Adjustment ID</th><th bgcolor="#f2dede">From Item</th><th class="qty" bgcolor="#f2dede">Qty</th><th bgcolor="#f2dede">Converted To</th><th class="qty" bgcolor="#f2dede">Result Qty</th><th bgcolor="#f2dede">Notes</th></tr></thead><tbody>'+adjustments+'</tbody></table></div>'+
      '<div class="report-section"><h2>Final Items Received</h2><table class="items"><thead><tr bgcolor="#f2dede"><th bgcolor="#f2dede">Code</th><th bgcolor="#f2dede">Description</th><th class="qty" bgcolor="#f2dede">Qty</th><th bgcolor="#f2dede">Remarks</th></tr></thead><tbody>'+finalLines+'<tr class="total"><td colspan="2">Final inventory units</td><td class="qty">'+safe(details.finalReportTotal)+'</td><td></td></tr></tbody></table></div>'
    : '';
  const type=details.yourFinds?'YourFinds':'YourStyle';
  const signatures=(isReturn?[[details.preparedBy,'Prepared by'],[details.checkedBy||details.approvedBy,'Checked by'],[details.receivedBy||details.driver,'Received by']]
    :[[details.preparedBy,'Prepared by'],[details.driver,'Driver'],[details.acceptedBy,'Received by']])
    .map(([name,role])=>'<td><div class="sign-space"></div><div class="sign-name">'+safe(name)+'</div><div class="sign-role">'+role+'</div></td>').join('');
  return '<div class="page">'+
    '<div class="header"><div><h1>'+(isReturn?'Return Receipt Form':'Delivery Receipt Form')+'</h1><div class="delivery-id">'+safe(details.id)+'</div></div><div class="header-right"><div>'+safe(formatDeliveryReceiptDate_(details.date))+'</div><div>'+type+' &bull; Caloocan</div></div></div>'+
    '<table class="details"><tr><td><div class="detail"><span class="detail-label">Driver</span><span class="detail-value">'+safe(details.driver)+'</span></div></td><td><div class="detail"><span class="detail-label">Plate No.</span><span class="detail-value">'+safe(details.plate)+'</span></div></td></tr>'+
    '<tr><td><div class="detail"><span class="detail-label">Prepared By</span><span class="detail-value">'+safe(details.preparedBy)+'</span></div></td><td><div class="detail"><span class="detail-label">'+(isReturn?'Category':'Received By')+'</span><span class="detail-value">'+safe(isReturn?type:details.acceptedBy)+'</span></div></td></tr>'+
    (isReturn?'<tr><td><div class="detail"><span class="detail-label">Checked By</span><span class="detail-value">'+safe(details.checkedBy||details.approvedBy)+'</span></div></td><td><div class="detail"><span class="detail-label">Received By</span><span class="detail-value">'+safe(details.receivedBy||details.driver)+'</span></div></td></tr>':'')+'</table>'+
    '<div><h2>'+(isReturn?'Items Returned':'Items Received')+'</h2><table class="items"><thead><tr bgcolor="#f2dede"><th bgcolor="#f2dede">Code</th><th bgcolor="#f2dede">Description</th>'+(isReturn?'<th bgcolor="#f2dede">Size</th>':'')+'<th class="qty" bgcolor="#f2dede">Qty</th><th bgcolor="#f2dede">'+(isReturn?'Reason':'Remarks')+'</th></tr></thead><tbody>'+lines+'<tr class="total"><td colspan="'+(isReturn?3:2)+'">Total '+(isReturn?'returned':'received')+'</td><td class="qty">'+safe(details.reportTotal)+'</td><td></td></tr></tbody></table>'+adjustmentSection+
    (isReturn?(details.yourFinds?returnSizeSummary:'<div class="remarks">'+safe(details.summary)+'</div>'):'')+
    '<div class="remarks"><span class="remarks-label">Remarks</span>'+safe(details.remarks||'—')+'</div></div>'+
    '<table class="signatures"><tr>'+signatures+'</tr></table>'+
    '</div>';
}

function buildDeliveryReceiptHtml_(details) {
  return buildDeliveryReceiptsHtml_([details]);
}

function buildDeliveryReceiptsHtml_(receipts) {
  return '<!doctype html><html><head><meta charset="utf-8"><style>'+
    '@page{size:A4;margin:8mm 9mm}*{box-sizing:border-box}body{margin:0;color:#333;font:11.5px/1.45 "Segoe UI",Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}'+
    '.page{min-height:276mm;display:flex;flex-direction:column}.page+.page{page-break-before:always}.header{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;border-bottom:2px solid #d8a7a7;padding-bottom:7px}'+
    'h1{margin:0 0 6px;color:#b76e79;font-size:20px;font-weight:700}.delivery-id{display:inline-block;border:1px solid #d8a7a7;background-color:#fbf2f4;border-radius:10px;padding:3px 9px;color:#65454b;font-size:11.5px;font-weight:400}'+
    '.header-right{text-align:right;line-height:1.5;font-weight:400}.header-right div+div{color:#666}.details{width:100%;border-collapse:collapse;margin:15px 0 19px}'+
    '.details td{width:50%;border:0;padding:4px 14px 4px 0}.detail{display:table;width:100%}.detail-label{display:table-cell;width:76px;color:#666;white-space:nowrap}.detail-value{display:table-cell;border-bottom:1px solid #ccc;padding-bottom:3px;font-weight:400}'+
    'h2{color:#b76e79;border-bottom:1px solid #e3c6c6;font-size:13px;margin:0 0 9px;padding-bottom:5px}.report-section{margin-top:15px;page-break-inside:avoid}'+
    '.items{width:100%;border-collapse:collapse}.items th,.items td{border:1px solid #e3c6c6;padding:6px 7px;text-align:left;font-size:11.5px;font-weight:400}'+
    '.items th{background-color:#f2dede !important;color:#65454b;font-weight:700}.items .qty{text-align:center;width:13%}.items th:first-child{width:18%}.items th:last-child{width:24%}'+
    '.items .total td{background:#fbf6f7;font-weight:700}.items thead{display:table-header-group}.items tr{page-break-inside:avoid}'+
    '.return-size-summary{width:45%}.return-size-summary th:first-child{width:65%}.return-size-summary .qty{width:35%}'+
    '.remarks{margin-top:10px}.remarks-label{color:#666;margin-right:12px}.signatures{margin-top:auto;padding-top:20px;page-break-inside:avoid;width:100%;border-collapse:separate;border-spacing:12px 0}'+
    '.signatures td{width:33.33%;text-align:center;vertical-align:bottom;font-size:11px}.sign-space{height:24mm;border-bottom:1px solid #333;margin-bottom:5px}.sign-name{font-weight:700}.sign-role{color:#666;margin-top:2px}'+
    '</style></head><body>'+receipts.map(buildDeliveryReceiptPage_).join('')+'</body></html>';
}

function createDeliveryReceiptPdf(deliveryId) {
  assertAppRequest_();
  try {
    const details=getDeliveryDetails(deliveryId);
    const fileName='Delivery_Receipt_'+String(details.id).replace(/[^A-Za-z0-9_-]/g,'_')+'.pdf';
    const pdf=Utilities.newBlob(buildDeliveryReceiptHtml_(details),'text/html','delivery-receipt.html').getAs('application/pdf');
    return {success:true,fileName:fileName,base64:Utilities.base64Encode(pdf.getBytes())};
  } catch(error) {
    return {success:false,message:error&&error.message?error.message:String(error)};
  }
}

function createSupplierReturnPdf(returnId) {
  assertAppRequest_();
  try {
    const id=String(returnId||'').trim();
    if(!id)throw new Error('Return ID is required.');
    const rows=getSupplierReturns(false).filter(record=>record.id===id);
    if(!rows.length)throw new Error('Return not found.');
    const details=buildSupplierReturnReceiptDetails_(id, rows);
    const pdf=Utilities.newBlob(buildDeliveryReceiptHtml_(details),'text/html','return-receipt.html').getAs('application/pdf');
    return {success:true,fileName:'Return_Receipt_'+id.replace(/[^A-Za-z0-9_-]/g,'_')+'.pdf',base64:Utilities.base64Encode(pdf.getBytes())};
  } catch(error) {return {success:false,message:error.message||String(error)};}
}


function buildSupplierReturnReceiptDetails_(id, rows) {
  const first=rows[0],totals=new Map();
  const yourFinds=rows.every(row=>String(row.category).toUpperCase()==='YOURFINDS');
  rows.forEach(row=>{const key=yourFinds?row.size||'Unspecified size':row.category;totals.set(key,(totals.get(key)||0)+row.quantity);});
  return {returnReceipt:true,id:id,date:first.returnDate||String(first.date).slice(0,10),yourFinds:yourFinds,
    driver:first.driver,plate:first.plate,preparedBy:first.preparedBy,approvedBy:first.approvedBy,checkedBy:first.checkedBy,receivedBy:first.receivedBy||first.driver,
    remarks:first.remarks,reportTotal:rows.reduce((total,row)=>total+row.quantity,0),
    reportLines:rows.map(row=>({code:row.code,description:row.name,size:row.size,quantity:row.quantity,remarks:row.reason})),
    summary:Array.from(totals,([label,quantity])=>label+' '+quantity+' pcs').join(' · ')};
}

function createDashboardReturnPdf(request) {
  assertAppRequest_();
  if (!isDevelopmentSpreadsheet_()) throw new Error('Dashboard return reports are unavailable.');
  const start = dashboardDate_(request.start);
  const end = dashboardDate_(request.end);
  if (start > end) throw new Error('Choose a start date before or equal to the end date.');
  const rows = dashboardReturnRows_(start, end);
  if (!rows.length) return {success:false, message:'No supplier returns in this date range.'};
  const html = buildDashboardReturnReportHtml_(rows, start, end);
  const pdf = Utilities.newBlob(html, 'text/html', 'return-report-summary.html').getAs('application/pdf');
  const period = start === end ? start : start + '_to_' + end;
  return {success:true, fileName:'Return_Report_Summary_' + period + '.pdf', base64:Utilities.base64Encode(pdf.getBytes())};
}

function buildDashboardReturnReportHtml_(rows, start, end) {
  const totals = {'TOTAL YF':0, 'TOTAL PIN':0, 'TOTAL OTHERS':0, 'GRAND TOTAL':0};
  const items = new Map();
  rows.forEach(row => {
    const category = String(row.category || '').trim().toUpperCase();
    const code = String(row.code || '').trim();
    const description = String(row.name || '').trim();
    const yourFinds = category === 'YOURFINDS';
    const size = yourFinds ? dashboardYourFindsReturnSize_(row.size) : String(row.size || '').trim();
    const quantity = Number(row.quantity) || 0;
    const total = yourFinds ? 'TOTAL YF' : category === 'PINS' ? 'TOTAL PIN' : 'TOTAL OTHERS';
    totals[total] += quantity;
    totals['GRAND TOTAL'] += quantity;
    const key = yourFinds ? JSON.stringify(['YOURFINDS', size])
      : JSON.stringify([code, code ? '' : description.toUpperCase(), size.toUpperCase()]);
    if (!items.has(key)) items.set(key, {code:yourFinds ? size : code, description, size, quantity:0, codes:yourFinds ? new Set() : null});
    const item = items.get(key);
    item.quantity += quantity;
    if (yourFinds && code) item.codes.add(code);
  });

  const safe = escapeDeliveryReceiptHtml_;
  const lines = Array.from(items.values()).map(item => {
    const description = item.codes
      ? Array.from(item.codes, code => code.replace(/\D/g, '').slice(-4)).filter(Boolean).join(', ') || '—'
      : item.description;
    return '<tr><td>' + safe(item.code) + '</td><td>' + safe(description) + '</td><td>' + safe(item.size || '—') +
      '</td><td class="qty">' + safe(item.quantity) + '</td></tr>';
  }).join('');
  const totalCells = Object.entries(totals).map(([label, quantity]) =>
    '<td><div class="total-value">' + safe(quantity) + '</div><div class="total-label">' + label + '</div></td>'
  ).join('');
  const date = formatDeliveryReceiptDate_(start) + (start === end ? '' : ' – ' + formatDeliveryReceiptDate_(end));

  return '<!doctype html><html><head><meta charset="utf-8"><style>' +
    '@page{size:A4;margin:12mm}*{box-sizing:border-box}body{margin:0;color:#333;font:11.5px/1.45 Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    'h1{margin:0 0 4px;color:#b76e79;font-size:20px}.report-date{margin:0 0 16px;color:#65454b}' +
    '.items{width:100%;border-collapse:collapse;table-layout:fixed}.items thead{display:table-header-group}.items tr{page-break-inside:avoid}' +
    '.items th,.items td{border:1px solid #e3c6c6;padding:6px 7px;text-align:left;overflow-wrap:break-word}' +
    '.items th{background:#f2dede;color:#65454b}.items .qty{text-align:right}' +
    '.totals{width:100%;margin:0 0 16px;border-collapse:collapse;table-layout:fixed;page-break-inside:avoid}' +
    '.totals td{width:25%;padding:7px 5px;border:1px solid #e3c6c6;text-align:center;background:#fbf2f4}' +
    '.total-value{font-size:15px;font-weight:bold}.total-label{font-size:10px;color:#65454b;font-weight:bold}' +
    '</style></head><body><h1>RETURN REPORT SUMMARY</h1><p class="report-date">' + safe(date) + '</p>' +
    '<table class="totals"><tbody><tr>' + totalCells + '</tr></tbody></table>' +
    '<table class="items"><colgroup><col style="width:22%"><col style="width:48%"><col style="width:18%"><col style="width:12%"></colgroup>' +
    '<thead><tr><th>Code</th><th>Description</th><th>Size</th><th class="qty">Qty</th></tr></thead><tbody>' + lines + '</tbody></table></body></html>';
}
