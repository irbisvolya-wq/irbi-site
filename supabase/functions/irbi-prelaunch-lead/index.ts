import { createClient } from "npm:@supabase/supabase-js@2.95.0";
const allowed = new Set(["https://irbicleaning.com","https://www.irbicleaning.com"]);
function respond(status:number,data:unknown,origin:string|null){return new Response(status===204?null:JSON.stringify(data),{status,headers:{"content-type":"application/json","cache-control":"no-store","access-control-allow-origin":origin&&allowed.has(origin)?origin:"https://irbicleaning.com","vary":"Origin","access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"content-type"}})}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin");
 if(!origin||!allowed.has(origin)) return respond(403,{error:"origin_not_allowed"},origin);
 if(req.method==="OPTIONS")return respond(204,{},origin);
 if(req.method!=="POST")return respond(405,{error:"method_not_allowed"},origin);
 if(Number(req.headers.get("content-length")||0)>10000)return respond(413,{error:"payload_too_large"},origin);
 let body:any; try{body=await req.json()}catch{return respond(400,{error:"invalid_json"},origin)}
 if(body.website)return respond(200,{ok:true},origin);
 const name=String(body.name||"").trim(), contact=String(body.contact||"").trim();
 const isEmail=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact),isPhone=/^\+?[0-9 ()-]{9,20}$/.test(contact);
 if(name.length<2||name.length>120||contact.length>255||!(isEmail||isPhone)||body.privacyAccepted!==true||!crypto.randomUUID)return respond(400,{error:"invalid_fields"},origin);
 const key=String(body.requestId||"");if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key))return respond(400,{error:"invalid_request_id"},origin);
 const ip=req.headers.get("cf-connecting-ip")||req.headers.get("x-forwarded-for")?.split(",")[0]||"unknown";
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(ip)))).map(x=>x.toString(16).padStart(2,"0")).join("");
 const url=Deno.env.get("SUPABASE_URL"),secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!secret)return respond(503,{error:"server_not_configured"},origin);
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const rooms=Number(body.rooms);
 const service=["regular","general","move","repair"].includes(body.service)?body.service:null;
 const {data,error}=await db.rpc("irbi_accept_prelaunch",{p_fingerprint:digest,p_idempotency:key,p_name:name,p_contact:contact,p_service:service,p_rooms:Number.isInteger(rooms)&&rooms>=1&&rooms<=4?rooms:null,p_estimate:null,p_marketing:body.marketingConsent===true,p_privacy:true});
 if(error){if(error.message.includes("rate_limited"))return respond(429,{error:"too_many_requests"},origin);console.error("prelaunch insert failed",error.code);return respond(500,{error:"save_failed"},origin)}
 return respond(201,{ok:true,id:data},origin);
});