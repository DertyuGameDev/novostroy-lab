// One plain schema shared by CSV and XLSX.
export const tableHeaders=['Город','Название ЖК','Застройщик','Район','Класс','Цена от, ₽/м²','Статус строительства','Период ввода','Тип срока','Источники цены и срока','Дата цены в источнике','Проверено','К каким корпусам относится срок'];
export function tableRows(records) {
  return records.map(r=>[r.city,r.name,r.developer,r.district,r.class,r.priceFrom,r.constructionStatus,r.delivery,r.deliveryKind==='fact'?'Факт':'План',
    `${r.verification==='search-index'?'Цена (поисковый индекс)':'Цена'}: ${r.sourceUrl}\n${r.deliveryVerification==='search-index'?'Ввод (поисковый индекс)':'Ввод'}: ${r.deliverySourceUrl||r.sourceUrl}`,
    r.sourceDate||'Не указана',r.checkedAt,r.deliveryScope]);
}
export const toCsv=rows=>'\uFEFF'+rows.map(row=>row.map(value=>'"'+String(value).replaceAll('"','""')+'"').join(';')).join('\n')+'\n';
