import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
const root=process.cwd();
function exists(ref,owner){if(!ref||/^(https?:|mailto:|tel:|data:|#|javascript:)/i.test(ref))return;const clean=ref.split(/[?#]/)[0];if(!clean)return;const target=clean.startsWith('/')?path.join(root,clean):path.resolve(root,path.dirname(owner),clean);assert.ok(fs.existsSync(target),`${owner}: missing ${ref}`);}
test('HTML pages reference existing local assets and destinations',()=>{for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.html'))){const text=fs.readFileSync(file,'utf8');for(const m of text.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g))exists(m[1],file);}});
test('local ES module imports resolve to tracked source files',()=>{for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.js'))){for(const m of fs.readFileSync(file,'utf8').matchAll(/\bfrom\s+["']([^"']+)["']/g))exists(m[1],file);}});
