const names = ['activeUsers','sessions','engagedSessions','engagementRate','keyEvents','itemViewEvents','addToCarts','checkouts','ecommercePurchases','transactions','purchaseRevenue'];
const context = () => ({ dataset_type:'GA4_CONTENT_PERFORMANCE', property_id:'123456789', start_date:'2026-09-01', end_date:'2026-09-28' });
const page = (records = [{ landing_page:'/synthetic?campaign=observed', metrics:['7','0','3','0.625','2','0','0','0','0','0','0'] }]) => ({
  dimensionHeaders:[{name:'landingPage'}],
  metricHeaders:names.map((name) => ({name,type:name==='engagementRate'||name==='keyEvents'?'TYPE_FLOAT':name==='purchaseRevenue'?'TYPE_CURRENCY':'TYPE_INTEGER'})),
  rows:records.map((row)=>({dimensionValues:[{value:row.landing_page}],metricValues:row.metrics.map((value)=>({value}))})),
  rowCount:records.length, metadata:{currencyCode:'TRY',timeZone:'Europe/Istanbul'},
});
const bundle = (body=page()) => ({ bundle_schema_version:1,dataset_type:'GA4_CONTENT_PERFORMANCE',
  request:{property_id:'123456789',start_date:'2026-09-01',end_date:'2026-09-28',limit:250000},pages:[{offset:0,raw_body_text:JSON.stringify(body)}] });
const metricBundle = (options = {}) => {
  const { users, duration, sessions } = { users: '17', duration: '125.5', sessions: '5', ...options };
  const body = page();
  body.rows[0].metricValues[1] = { value: sessions };
  body.metricHeaders.push({ name: 'totalUsers', type: 'TYPE_INTEGER' }, { name: 'userEngagementDuration', type: 'TYPE_SECONDS' });
  body.rows[0].metricValues.push({ value: users }, { value: duration });
  return { ...bundle(body), bundle_schema_version: 2 };
};
module.exports={context,page,bundle,names,metricBundle};
