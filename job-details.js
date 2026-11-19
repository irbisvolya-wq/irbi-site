const services={regular:'Підтримувальне',general:'Генеральне',move:'Заселення / виселення',repair:'Після ремонту'};
const properties={apartment:'Квартира',house:'Будинок',office:'Офіс',other:'Інше'};
const addons={balcony:'Балкон',fridge:'Холодильник усередині',oven:'Духовка усередині',cabinets:'Шафи усередині'};
export function jobDetails(booking,role){
 const restricted=role==='cleaner'&&['pending','confirmed'].includes(booking.status);
 const address=[booking.address,booking.apartment?'кв. '+booking.apartment:'',booking.entrance?'під’їзд '+booking.entrance:'',booking.floor?'поверх '+booking.floor:''].filter(Boolean).join(', ');
 const selected=Object.entries(addons).filter(([key])=>booking.cleaning_features?.requested_addons?.[key]===true).map(([,label])=>label);
 return [
 ['Послуга',services[booking.service_type]||booking.service_type||'—'],
 ['Дата',booking.scheduled_at?new Date(booking.scheduled_at).toLocaleString('uk-UA'):'—'],
 ['Адреса',restricted?'Після призначення':address||'Не вказано'],
 ['Контактний телефон',restricted?'Після призначення':booking.contact_phone||'Не вказано'],
 ['Доступ та примітки',restricted?'Після призначення':booking.access_notes||'Не вказано'],
 ['Тип',properties[booking.property_type]||booking.property_type||'—'],
 ['Кімнат',booking.rooms??'—'],['Санвузлів',booking.bathrooms??'—'],
 ['Площа',booking.area_m2?booking.area_m2+' м²':'—'],
 ['Додаткові роботи',selected.join(', ')||'Не замовлено'],
 ['Тривалість',booking.duration_minutes?booking.duration_minutes+' хв':'Не задано'],
 ['Вартість',booking.total==null?'—':booking.total+' ₴']
 ];
}
