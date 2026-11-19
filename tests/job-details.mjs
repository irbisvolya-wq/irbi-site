import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const {jobDetails}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('job-details.js','utf8')).toString('base64'));
const booking={status:'assigned',service_type:'regular',property_type:'apartment',address:'Тестова 1',apartment:'2',entrance:'3',floor:'4',access_notes:'Зателефонувати перед входом',contact_phone:'+380000000000',total:0,cleaning_features:{requested_addons:{fridge:true,oven:false,unknown:true}}};
test('assigned cleaner sees full access instructions and requested extras',()=>{const d=Object.fromEntries(jobDetails(booking,'cleaner'));assert.match(d['Адреса'],/під’їзд 3/);assert.equal(d['Доступ та примітки'],booking.access_notes);assert.equal(d['Контактний телефон'],booking.contact_phone);assert.equal(d['Додаткові роботи'],'Холодильник усередині');assert.equal(d['Послуга'],'Підтримувальне');assert.equal(d['Тип'],'Квартира');});
test('unassigned cleaner card does not reveal address phone or access notes',()=>{for(const status of ['pending','confirmed']){const d=Object.fromEntries(jobDetails({...booking,status},'cleaner'));for(const name of ['Адреса','Контактний телефон','Доступ та примітки'])assert.equal(d[name],'Після призначення');}});
test('coordinator can review access details before assignment',()=>{const d=Object.fromEntries(jobDetails({...booking,status:'pending'},'dispatcher'));assert.equal(d['Доступ та примітки'],booking.access_notes);assert.equal(d['Вартість'],'0 ₴');});
test('missing contact details display explicit empty values',()=>{const d=Object.fromEntries(jobDetails({},'admin'));assert.equal(d['Контактний телефон'],'Не вказано');assert.equal(d['Додаткові роботи'],'Не замовлено');assert.equal(d['Вартість'],'—');});
