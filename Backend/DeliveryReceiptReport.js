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

function buildDeliveryReceiptHtml_(details) {
  const safe=escapeDeliveryReceiptHtml_;
  const lines=(details.reportLines||[]).map(function(line) {
    return '<tr><td>'+safe(line.code)+'</td><td>'+safe(line.description)+'</td><td class="qty">'+safe(line.quantity)+'</td><td>'+safe(line.remarks)+'</td></tr>';
  }).join('');
  const type=details.yourFinds?'YourFinds':'YourStyle';
  return '<!doctype html><html><head><meta charset="utf-8"><style>'+
    '@page{size:A4;margin:8mm 9mm}*{box-sizing:border-box}body{margin:0;color:#333;font:11.5px/1.45 "Segoe UI",Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}'+
    '.page{min-height:276mm;display:flex;flex-direction:column}.header{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;border-bottom:2px solid #d8a7a7;padding-bottom:7px}'+
    'h1{margin:0 0 6px;color:#b76e79;font-size:20px;font-weight:700}.delivery-id{display:inline-block;border:1px solid #d8a7a7;background-color:#fbf2f4;border-radius:10px;padding:3px 9px;color:#65454b;font-size:11.5px;font-weight:400}'+
    '.header-right{text-align:right;line-height:1.5;font-weight:400}.header-right div+div{color:#666}.details{width:100%;border-collapse:collapse;margin:15px 0 19px}'+
    '.details td{width:50%;border:0;padding:4px 14px 4px 0}.detail{display:table;width:100%}.detail-label{display:table-cell;width:76px;color:#666;white-space:nowrap}.detail-value{display:table-cell;border-bottom:1px solid #ccc;padding-bottom:3px;font-weight:400}'+
    'h2{color:#b76e79;border-bottom:1px solid #e3c6c6;font-size:13px;margin:0 0 9px;padding-bottom:5px}'+
    '.items{width:100%;border-collapse:collapse}.items th,.items td{border:1px solid #e3c6c6;padding:6px 7px;text-align:left;font-size:11.5px;font-weight:400}'+
    '.items th{background-color:#f2dede !important;color:#65454b;font-weight:700}.items .qty{text-align:center;width:13%}.items th:first-child{width:18%}.items th:last-child{width:24%}'+
    '.items .total td{background:#fbf6f7;font-weight:700}.items thead{display:table-header-group}.items tr{page-break-inside:avoid}'+
    '.remarks{margin-top:10px}.remarks-label{color:#666;margin-right:12px}.signatures{margin-top:auto;padding-top:20px;page-break-inside:avoid;width:100%;border-collapse:separate;border-spacing:12px 0}'+
    '.signatures td{width:33.33%;text-align:center;vertical-align:bottom;font-size:11px}.sign-space{height:24mm;border-bottom:1px solid #333;margin-bottom:5px}.sign-name{font-weight:700}.sign-role{color:#666;margin-top:2px}'+
    '</style></head><body><div class="page">'+
    '<div class="header"><div><h1>Delivery Receipt Form</h1><div class="delivery-id">'+safe(details.id)+'</div></div><div class="header-right"><div>'+safe(formatDeliveryReceiptDate_(details.date))+'</div><div>'+type+' &bull; Caloocan</div></div></div>'+
    '<table class="details"><tr><td><div class="detail"><span class="detail-label">Driver</span><span class="detail-value">'+safe(details.driver)+'</span></div></td><td><div class="detail"><span class="detail-label">Plate No.</span><span class="detail-value">'+safe(details.plate)+'</span></div></td></tr>'+
    '<tr><td><div class="detail"><span class="detail-label">Prepared By</span><span class="detail-value">'+safe(details.preparedBy)+'</span></div></td><td><div class="detail"><span class="detail-label">Received By</span><span class="detail-value">'+safe(details.acceptedBy)+'</span></div></td></tr></table>'+
    '<div><h2>Items Received</h2><table class="items"><thead><tr bgcolor="#f2dede"><th bgcolor="#f2dede">Code</th><th bgcolor="#f2dede">Description</th><th class="qty" bgcolor="#f2dede">Qty</th><th bgcolor="#f2dede">Remarks</th></tr></thead><tbody>'+lines+'<tr class="total"><td colspan="2">Total received</td><td class="qty">'+safe(details.reportTotal)+'</td><td></td></tr></tbody></table>'+
    '<div class="remarks"><span class="remarks-label">Remarks</span>'+safe(details.remarks||'—')+'</div></div>'+
    '<table class="signatures"><tr><td><div class="sign-space"></div><div class="sign-name">'+safe(details.preparedBy)+'</div><div class="sign-role">Prepared by</div></td><td><div class="sign-space"></div><div class="sign-name">'+safe(details.driver)+'</div><div class="sign-role">Driver</div></td><td><div class="sign-space"></div><div class="sign-name">'+safe(details.acceptedBy)+'</div><div class="sign-role">Received by</div></td></tr></table>'+
    '</div></body></html>';
}

function createDeliveryReceiptPdf(deliveryId) {
  try {
    const details=getDeliveryDetails(deliveryId);
    const fileName='Delivery_Receipt_'+String(details.id).replace(/[^A-Za-z0-9_-]/g,'_')+'.pdf';
    const pdf=Utilities.newBlob(buildDeliveryReceiptHtml_(details),'text/html','delivery-receipt.html').getAs('application/pdf');
    return {success:true,fileName:fileName,base64:Utilities.base64Encode(pdf.getBytes())};
  } catch(error) {
    return {success:false,message:error&&error.message?error.message:String(error)};
  }
}
