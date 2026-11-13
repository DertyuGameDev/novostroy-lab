// Prices belong to published apartments. Never extrapolate a project minimum.
export const AREA_TOLERANCE = .10;
export const AREA_BANDS = [
  {id:'under-35',label:'До 35 м²',min:0,max:35},
  {id:'35-50',label:'35–50 м²',min:35,max:50},
  {id:'50-70',label:'50–70 м²',min:50,max:70},
  {id:'70-100',label:'70–100 м²',min:70,max:100},
  {id:'100-plus',label:'От 100 м²',min:100,max:Infinity},
];
export const areaBand = area => AREA_BANDS.find(band=>area>=band.min&&area<band.max);
export const usableLot = lot => lot.eligibility==='included'&&Number.isFinite(lot.area)&&lot.area>0&&Number.isSafeInteger(lot.price)&&lot.price>0;
export function nearbyLots(lots,projectId,area) {
  return lots.filter(lot=>lot.projectId===projectId&&usableLot(lot)
    &&(area===null||area===undefined||Math.abs(lot.area-area)<=area*AREA_TOLERANCE+1e-9));
}
export function selectApartment(lots,projectId,area,budget=null,priceFrom=null) {
  return nearbyLots(lots,projectId,area).filter(lot=>(budget===null||lot.price<=budget)&&(priceFrom===null||lot.price>=priceFrom))
    .sort((a,b)=>(area==null?0:Math.abs(a.area-area)-Math.abs(b.area-area))||a.price-b.price||a.id.localeCompare(b.id))[0]||null;
}
export function summarizeAreaPrices(records,catalog) {
  return records.flatMap(record=>AREA_BANDS.map(band=>{
    const observed=catalog.lots.filter(lot=>lot.projectId===record.id&&lot.area>=band.min&&lot.area<band.max);
    const lots=observed.filter(usableLot),units=lots.map(lot=>lot.price/lot.area),prices=lots.map(lot=>lot.price);
    const minLot=lots.reduce((best,lot)=>!best||lot.price/lot.area<best.price/best.area?lot:best,null);
    return {projectId:record.id,city:record.city,name:record.name,band:band.id,bandLabel:band.label,
      count:lots.length,excluded:observed.length-lots.length,minUnit:lots.length?Math.min(...units):null,maxUnit:lots.length?Math.max(...units):null,
      minPrice:lots.length?Math.min(...prices):null,maxPrice:lots.length?Math.max(...prices):null,
      minLotId:minLot?.id||null,sourceUrl:minLot?.sourceUrl||catalog.projects.find(p=>p.projectId===record.id)?.sourceUrl,
      floors:[...new Set(lots.map(lot=>lot.floor).filter(Number.isFinite))].sort((a,b)=>a-b),
      finishes:[...new Set(lots.map(lot=>lot.finish).filter(Boolean))],
      buildings:[...new Set(lots.map(lot=>lot.building).filter(Boolean))],
    };
  }));
}
