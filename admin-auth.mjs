const enc=new TextEncoder();
const AUTH_EMAIL='aleschaefer@gmail.com';
const DEFAULT_EMAIL_FROM='onboarding@resend.dev';
const CODE_TTL_MS=10*60*1000;
const RESEND_WAIT_SECONDS=60;
const MAX_CODE_ATTEMPTS=5;
const reply=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
const b64u=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const unb64=value=>{const text=String(value).replaceAll('-','+').replaceAll('_','/');return Uint8Array.from(atob(text+'='.repeat((4-text.length%4)%4)),c=>c.charCodeAt(0));};
const random=length=>crypto.getRandomValues(new Uint8Array(length));
const digest=async value=>new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?enc.encode(value):value));
const safeEqual=(a,b)=>a.length===b.length&&a.reduce((ok,value,index)=>ok&(value===b[index]),1)===1;
const codeHash=async(flowId,code)=>b64u(await digest(`${flowId}:${code}`));
const generateCode=()=>String(crypto.getRandomValues(new Uint32Array(1))[0]%100000).padStart(5,'0');

async function passwordHash(password,salt,iterations=100000){
  const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},key,256));
}
async function createSession(db,userId){const token=b64u(random(32)),hash=b64u(await digest(token)),expires=new Date(Date.now()+8*60*60*1000).toISOString();await db.prepare('INSERT INTO admin_sessions(token_hash,user_id,expires_at) VALUES(?1,?2,?3)').bind(hash,userId,expires).run();return{token,expires};}
const sessionCookie=(token,maxAge=28800)=>`__Host-admin_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
function cookieToken(request){return request.headers.get('cookie')?.match(/(?:^|;\s*)__Host-admin_session=([^;]+)/)?.[1]||'';}

async function sendAccessCode(env,code){
  if(!env.RESEND_API_KEY)throw new Error('O envio do código ainda não foi configurado no servidor.');
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${env.RESEND_API_KEY}`},body:JSON.stringify({from:env.AUTH_EMAIL_FROM||DEFAULT_EMAIL_FROM,to:[AUTH_EMAIL],subject:'Código de acesso — Financeiro Anale',text:`Seu código de acesso é ${code}. Ele expira em 10 minutos e só pode ser usado uma vez.`,html:`<p>Seu código de acesso ao <strong>Financeiro Anale</strong> é:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${code}</p><p>Ele expira em 10 minutos e só pode ser usado uma vez.</p>`})});
  if(!response.ok){console.error('Resend error',response.status,await response.text());throw new Error('Não foi possível enviar o código de acesso. Tente novamente.');}
}
async function recentChallenge(db,userId,purpose){return db.prepare("SELECT id FROM admin_auth_challenges WHERE purpose=?1 AND ((user_id=?2) OR (user_id IS NULL AND ?2 IS NULL)) AND created_at>strftime('%Y-%m-%dT%H:%M:%fZ','now',?3)").bind(purpose,userId,`-${RESEND_WAIT_SECONDS} seconds`).first();}
async function saveAndSendChallenge(db,env,{purpose,userId=null,payload={}}){
  if(await recentChallenge(db,userId,purpose))return{error:reply({error:'Aguarde um minuto antes de solicitar outro código.'},429)};
  const id=crypto.randomUUID(),code=generateCode(),expires=new Date(Date.now()+CODE_TTL_MS).toISOString();
  await sendAccessCode(env,code);
  await db.prepare('INSERT INTO admin_auth_challenges(id,user_id,purpose,challenge,payload,expires_at) VALUES(?1,?2,?3,?4,?5,?6)').bind(id,userId,purpose,await codeHash(id,code),JSON.stringify({...payload,attempts:0}),expires).run();
  return{id};
}
async function verifyChallenge(db,body,purpose){
  const code=String(body.code||'').trim();if(!/^\d{5}$/.test(code))return{error:reply({error:'Informe o código de 5 dígitos enviado por e-mail.'},400)};
  const flow=await db.prepare('SELECT * FROM admin_auth_challenges WHERE id=?1 AND purpose=?2').bind(body.flowId,purpose).first();
  if(!flow||flow.expires_at<=new Date().toISOString())return{error:reply({error:'Código expirado. Solicite um novo código.'},400)};
  const payload=JSON.parse(flow.payload||'{}'),valid=safeEqual(unb64(flow.challenge),unb64(await codeHash(flow.id,code)));
  if(!valid){const attempts=Number(payload.attempts||0)+1;if(attempts>=MAX_CODE_ATTEMPTS)await db.prepare('DELETE FROM admin_auth_challenges WHERE id=?1').bind(flow.id).run();else await db.prepare('UPDATE admin_auth_challenges SET payload=?1 WHERE id=?2').bind(JSON.stringify({...payload,attempts}),flow.id).run();return{error:reply({error:attempts>=MAX_CODE_ATTEMPTS?'Código bloqueado após cinco tentativas. Solicite outro código.':'Código inválido.'},401)};}
  return{flow,payload};
}

export async function requireAdminSession(request,env){
  if(env.ALLOW_LEGACY_ADMIN_AUTH==='true'&&env.ADMIN_PASSWORD&&request.headers.get('x-admin-password')===env.ADMIN_PASSWORD)return true;
  if(!env.CONTENT_DB)return false;const token=cookieToken(request);if(!token)return false;const hash=b64u(await digest(token));const row=await env.CONTENT_DB.prepare("SELECT user_id FROM admin_sessions WHERE token_hash=?1 AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(hash).first();return Boolean(row);
}

export async function handleAdminAuthentication(request,env,path){
  const db=env.CONTENT_DB;if(!db)return reply({error:'Banco de dados não configurado.'},503);
  try{
    if(path.endsWith('/status')){const configured=Boolean(await db.prepare('SELECT id FROM admin_users LIMIT 1').first());return reply({configured,authenticated:await requireAdminSession(request,env),secondFactor:'email',destination:'a•••••••••@gmail.com'});}
    if(path.endsWith('/logout-all')){const token=cookieToken(request);if(!token)return reply({error:'Sessão inválida.'},401);const hash=b64u(await digest(token)),session=await db.prepare("SELECT user_id FROM admin_sessions WHERE token_hash=?1 AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(hash).first();if(!session)return reply({error:'Sessão inválida.'},401);await db.prepare('DELETE FROM admin_sessions WHERE user_id=?1').bind(session.user_id).run();return reply({ok:true},200,{'Set-Cookie':sessionCookie('',0)});}
    if(path.endsWith('/logout')){const token=cookieToken(request);if(token)await db.prepare('DELETE FROM admin_sessions WHERE token_hash=?1').bind(b64u(await digest(token))).run();return reply({ok:true},200,{'Set-Cookie':sessionCookie('',0)});}
    const body=await request.json();
    if(path.endsWith('/setup-options')){
      if(await db.prepare('SELECT id FROM admin_users LIMIT 1').first())return reply({error:'O usuário administrativo já foi configurado.'},409);
      if(!env.ADMIN_PASSWORD||body.legacyPassword!==env.ADMIN_PASSWORD)return reply({error:'Senha administrativa atual inválida.'},401);
      const password=String(body.password||'');if(password.length<12)return reply({error:'Informe uma senha com pelo menos 12 caracteres.'},400);
      const salt=random(16),hash=await passwordHash(password,salt),challenge=await saveAndSendChallenge(db,env,{purpose:'setup',payload:{userId:crypto.randomUUID(),email:AUTH_EMAIL,salt:b64u(salt),hash:b64u(hash)}});if(challenge.error)return challenge.error;
      return reply({flowId:challenge.id,destination:'a•••••••••@gmail.com',expiresIn:600});
    }
    if(path.endsWith('/setup-verify')){
      const checked=await verifyChallenge(db,body,'setup');if(checked.error)return checked.error;const {flow,payload}=checked;
      await db.batch([db.prepare('INSERT INTO admin_users(id,email,password_salt,password_hash,password_iterations) VALUES(?1,?2,?3,?4,100000)').bind(payload.userId,payload.email,payload.salt,payload.hash),db.prepare('DELETE FROM admin_auth_challenges WHERE id=?1').bind(flow.id)]);const session=await createSession(db,payload.userId);return reply({ok:true,email:payload.email},200,{'Set-Cookie':sessionCookie(session.token)});
    }
    if(path.endsWith('/login-options')){
      const user=await db.prepare('SELECT * FROM admin_users LIMIT 1').first();if(!user)return reply({error:'E-mail ou senha inválido.'},401);const hash=await passwordHash(String(body.password||''),unb64(user.password_salt),user.password_iterations);if(!safeEqual(hash,unb64(user.password_hash)))return reply({error:'E-mail ou senha inválido.'},401);const challenge=await saveAndSendChallenge(db,env,{purpose:'login',userId:user.id});if(challenge.error)return challenge.error;return reply({flowId:challenge.id,destination:'a•••••••••@gmail.com',expiresIn:600});
    }
    if(path.endsWith('/login-verify')){
      const checked=await verifyChallenge(db,body,'login');if(checked.error)return checked.error;const {flow}=checked;await db.prepare('DELETE FROM admin_auth_challenges WHERE id=?1').bind(flow.id).run();const session=await createSession(db,flow.user_id);return reply({ok:true},200,{'Set-Cookie':sessionCookie(session.token)});
    }
    return reply({error:'Operação de autenticação inválida.'},404);
  }catch(error){console.error('Admin auth error',error);return reply({error:error.message||'Não foi possível autenticar.'},400);}
}
