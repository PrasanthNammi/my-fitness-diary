// Acceptance oracle only. Never return/log an upstream body or token.
async function expiredAccessRejected(response,expiresAt,nowMs){
 if(typeof expiresAt!=='number'||!Number.isFinite(expiresAt)||expiresAt>=nowMs/1000)return false;
 if(response.status===401)return true;
 if(response.status!==403)return false;
 try{const body=await response.json();return body&&typeof body==='object'&&!body.user&&!body.access_token&&(body.error_code==='bad_jwt'||body.code==='bad_jwt')&&typeof body.msg==='string'&&/\bexpired\b/i.test(body.msg);}catch{return false;}
}
module.exports={expiredAccessRejected};
