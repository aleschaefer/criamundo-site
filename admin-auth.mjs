const enc=new TextEncoder(),dec=new TextDecoder();
const reply=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
const b64u=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const unb64=value=>{const text=String(value).replaceAll('-','+').replaceAll('_','/');return Uint8Array.from(atob(text+'='.repeat((4-text.length%4)%4)),c=>c.charCodeAt(0));};
const random=length=>crypto.getRandomValues(new Uint8Array(length));
const digest=async value=>new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?enc.encode(value):value));
const safeEqual=(a,b)=>a.length===b.length&&a.reduce((ok,value,index)=>ok&(value===b[index]),1)===1;
const cleanEmail=value=>String(value||'').trim().toLowerCase();
const originFor=request=>new URL(request.url).origin;
const rpIdFor=request=>new URL(request.url).hostname;

async function passwordHash(password,salt,iterations=100000){
  const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},key,256));
}
function readCbor(bytes,start=0){
  let offset=start;const first=bytes[offset++],major=first>>5,info=first&31;
  const length=()=>{if(info<24)return info;if(info===24)return bytes[offset++];if(info===25)return (bytes[offset++]<<8)|bytes[offset++];if(info===26){const value=new DataView(bytes.buffer,bytes.byteOffset+offset,4).getUint32(0);offset+=4;return value;}throw new Error('Formato de passkey não suportado.');};
  if(major===0)return{value:length(),offset};if(major===1)return{value:-1-length(),offset};
  if(major===2||major===3){const size=length(),value=bytes.slice(offset,offset+size);offset+=size;return{value:major===3?dec.decode(value):value,offset};}
  if(major===4){const size=length(),value=[];for(let i=0;i<size;i++){const item=readCbor(bytes,offset);value.push(item.value);offset=item.offset;}return{value,offset};}
  if(major===5){const size=length(),value=new Map();for(let i=0;i<size;i++){const key=readCbor(bytes,offset);offset=key.offset;const item=readCbor(bytes,offset);offset=item.offset;value.set(key.value,item.value);}return{value,offset};}
  if(major===7&&info===20)return{value:false,offset};if(major===7&&info===21)return{value:true,offset};if(major===7&&info===22)return{value:null,offset};throw new Error('Formato de passkey inválido.');
}
function registrationKey(attestation){
  const object=readCbor(attestation).value,authData=object.get('authData');if(!(authData instanceof Uint8Array)||authData.length<55)throw new Error('Resposta do Touch ID inválida.');
  const flags=authData[32];if(!(flags&1)||!(flags&4)||!(flags&64))throw new Error('Confirme sua identidade com o Touch ID.');
  let offset=53;const credentialLength=(authData[offset]<<8)|authData[offset+1];offset+=2;const credentialId=authData.slice(offset,offset+credentialLength);offset+=credentialLength;const cose=readCbor(authData,offset).value;
  if(cose.get(1)!==2||cose.get(3)!==-7||cose.get(-1)!==1)throw new Error('Esta passkey não usa o algoritmo de segurança esperado.');
  const x=cose.get(-2),y=cose.get(-3);return{credentialId,rpIdHash:authData.slice(0,32),publicKey:{kty:'EC',crv:'P-256',x:b64u(x),y:b64u(y),ext:true}};
}
async function validateClient(clientData,challenge,request,type){const parsed=JSON.parse(dec.decode(clientData));if(parsed.type!==type||parsed.challenge!==challenge||parsed.origin!==originFor(request))throw new Error('Desafio de autenticação inválido ou expirado.');}
async function createSession(db,userId){const token=b64u(random(32)),hash=b64u(await digest(token)),expires=new Date(Date.now()+8*60*60*1000).toISOString();await db.prepare('INSERT INTO admin_sessions(token_hash,user_id,expires_at) VALUES(?1,?2,?3)').bind(hash,userId,expires).run();return{token,expires};}
const sessionCookie=(token,maxAge=28800)=>`__Host-admin_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
function cookieToken(request){return request.headers.get('cookie')?.match(/(?:^|;\s*)__Host-admin_session=([^;]+)/)?.[1]||'';}
function derSignature(bytes){if(bytes.length===64)return bytes;if(bytes[0]!==48)throw new Error('Assinatura da passkey inválida.');let offset=2;if(bytes[1]&128)offset=2+(bytes[1]&127);if(bytes[offset++]!==2)throw new Error('Assinatura da passkey inválida.');const rLength=bytes[offset++],r=bytes.slice(offset,offset+rLength);offset+=rLength;if(bytes[offset++]!==2)throw new Error('Assinatura da passkey inválida.');const sLength=bytes[offset++],s=bytes.slice(offset,offset+sLength),raw=new Uint8Array(64);raw.set(r.slice(-32),32-Math.min(r.length,32));raw.set(s.slice(-32),64-Math.min(s.length,32));return raw;}

export async function requireAdminSession(request,env){
  if(env.ALLOW_LEGACY_ADMIN_AUTH==='true'&&env.ADMIN_PASSWORD&&request.headers.get('x-admin-password')===env.ADMIN_PASSWORD)return true;
  if(!env.CONTENT_DB)return false;const token=cookieToken(request);if(!token)return false;const hash=b64u(await digest(token));const row=await env.CONTENT_DB.prepare("SELECT user_id FROM admin_sessions WHERE token_hash=?1 AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(hash).first();return Boolean(row);
}

export async function handleAdminAuthentication(request,env,path){
  const db=env.CONTENT_DB;if(!db)return reply({error:'Banco de dados não configurado.'},503);
  try{
    if(path.endsWith('/status')){const configured=Boolean(await db.prepare('SELECT id FROM admin_users LIMIT 1').first());return reply({configured,authenticated:await requireAdminSession(request,env),passkeySupported:true});}
    if(path.endsWith('/logout-all')){const token=cookieToken(request);if(!token)return reply({error:'Sessão inválida.'},401);const hash=b64u(await digest(token)),session=await db.prepare("SELECT user_id FROM admin_sessions WHERE token_hash=?1 AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(hash).first();if(!session)return reply({error:'Sessão inválida.'},401);await db.prepare('DELETE FROM admin_sessions WHERE user_id=?1').bind(session.user_id).run();return reply({ok:true},200,{'Set-Cookie':sessionCookie('',0)});}
    if(path.endsWith('/logout')){const token=cookieToken(request);if(token)await db.prepare('DELETE FROM admin_sessions WHERE token_hash=?1').bind(b64u(await digest(token))).run();return reply({ok:true},200,{'Set-Cookie':sessionCookie('',0)});}
    const body=await request.json();
    if(path.endsWith('/setup-options')){
      if(await db.prepare('SELECT id FROM admin_users LIMIT 1').first())return reply({error:'O usuário administrativo já foi configurado.'},409);
      if(!env.ADMIN_PASSWORD||body.legacyPassword!==env.ADMIN_PASSWORD)return reply({error:'Senha administrativa atual inválida.'},401);
      const email=cleanEmail(body.email),password=String(body.password||'');if(!/^\S+@\S+\.\S+$/.test(email)||password.length<12)return reply({error:'Informe um e-mail válido e uma senha com pelo menos 12 caracteres.'},400);
      const id=crypto.randomUUID(),userId=crypto.randomUUID(),challenge=b64u(random(32)),salt=random(16),hash=await passwordHash(password,salt),expires=new Date(Date.now()+5*60*1000).toISOString();
      await db.prepare('INSERT INTO admin_auth_challenges(id,purpose,challenge,payload,expires_at) VALUES(?1,\'setup\',?2,?3,?4)').bind(id,challenge,JSON.stringify({userId,email,salt:b64u(salt),hash:b64u(hash)}),expires).run();
      return reply({flowId:id,publicKey:{challenge,rp:{name:'Painel Criamundo',id:rpIdFor(request)},user:{id:b64u(enc.encode(userId)),name:email,displayName:email},pubKeyCredParams:[{type:'public-key',alg:-7}],authenticatorSelection:{authenticatorAttachment:'platform',residentKey:'required',userVerification:'required'},timeout:60000,attestation:'none'}});
    }
    if(path.endsWith('/setup-verify')){
      const flow=await db.prepare("SELECT * FROM admin_auth_challenges WHERE id=?1 AND purpose='setup' AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(body.flowId).first();if(!flow)return reply({error:'Cadastro expirado. Tente novamente.'},400);const payload=JSON.parse(flow.payload),client=unb64(body.response.clientDataJSON);await validateClient(client,flow.challenge,request,'webauthn.create');const key=registrationKey(unb64(body.response.attestationObject));if(body.rawId!==b64u(key.credentialId)||!safeEqual(key.rpIdHash,await digest(rpIdFor(request))))throw new Error('Credencial divergente ou criada para outro domínio.');
      const userInsert=db.prepare('INSERT INTO admin_users(id,email,password_salt,password_hash,password_iterations) VALUES(?1,?2,?3,?4,100000)').bind(payload.userId,payload.email,payload.salt,payload.hash);const passkeyInsert=db.prepare('INSERT INTO admin_passkeys(credential_id,user_id,public_key,transports) VALUES(?1,?2,?3,?4)').bind(body.rawId,payload.userId,JSON.stringify(key.publicKey),JSON.stringify(body.transports||[]));await db.batch([userInsert,passkeyInsert,db.prepare('DELETE FROM admin_auth_challenges WHERE id=?1').bind(flow.id)]);const session=await createSession(db,payload.userId);return reply({ok:true,email:payload.email},200,{'Set-Cookie':sessionCookie(session.token)});
    }
    if(path.endsWith('/login-options')){
      const email=cleanEmail(body.email),user=await db.prepare('SELECT * FROM admin_users WHERE email=?1 COLLATE NOCASE').bind(email).first();if(!user)return reply({error:'E-mail, senha ou Touch ID inválido.'},401);const hash=await passwordHash(String(body.password||''),unb64(user.password_salt),user.password_iterations);if(!safeEqual(hash,unb64(user.password_hash)))return reply({error:'E-mail, senha ou Touch ID inválido.'},401);const keys=await db.prepare('SELECT credential_id FROM admin_passkeys WHERE user_id=?1').bind(user.id).all(),id=crypto.randomUUID(),challenge=b64u(random(32)),expires=new Date(Date.now()+5*60*1000).toISOString();await db.prepare("INSERT INTO admin_auth_challenges(id,user_id,purpose,challenge,expires_at) VALUES(?1,?2,'login',?3,?4)").bind(id,user.id,challenge,expires).run();return reply({flowId:id,publicKey:{challenge,rpId:rpIdFor(request),allowCredentials:keys.results.map(key=>({type:'public-key',id:key.credential_id})),userVerification:'required',timeout:60000}});
    }
    if(path.endsWith('/login-verify')){
      const flow=await db.prepare("SELECT * FROM admin_auth_challenges WHERE id=?1 AND purpose='login' AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(body.flowId).first();if(!flow)return reply({error:'Login expirado. Tente novamente.'},400);const passkey=await db.prepare('SELECT * FROM admin_passkeys WHERE credential_id=?1 AND user_id=?2').bind(body.rawId,flow.user_id).first();if(!passkey)return reply({error:'Passkey não reconhecida.'},401);const client=unb64(body.response.clientDataJSON),auth=unb64(body.response.authenticatorData);await validateClient(client,flow.challenge,request,'webauthn.get');if(!safeEqual(auth.slice(0,32),await digest(rpIdFor(request)))||!(auth[32]&1)||!(auth[32]&4))throw new Error('A confirmação do Touch ID não é válida.');const signed=new Uint8Array(auth.length+32);signed.set(auth);signed.set(await digest(client),auth.length);const key=await crypto.subtle.importKey('jwk',JSON.parse(passkey.public_key),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);const valid=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,derSignature(unb64(body.response.signature)),signed);if(!valid)return reply({error:'Assinatura da passkey inválida.'},401);const count=new DataView(auth.buffer,auth.byteOffset+33,4).getUint32(0);if(count&&passkey.sign_count&&count<=passkey.sign_count)return reply({error:'Esta passkey pode ter sido clonada.'},401);await db.batch([db.prepare("UPDATE admin_passkeys SET sign_count=?1,last_used_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE credential_id=?2").bind(count,passkey.credential_id),db.prepare('DELETE FROM admin_auth_challenges WHERE id=?1').bind(flow.id)]);const session=await createSession(db,flow.user_id);return reply({ok:true},200,{'Set-Cookie':sessionCookie(session.token)});
    }
    return reply({error:'Operação de autenticação inválida.'},404);
  }catch(error){console.error('Admin auth error',error);return reply({error:error.message||'Não foi possível autenticar.'},400);}
}
