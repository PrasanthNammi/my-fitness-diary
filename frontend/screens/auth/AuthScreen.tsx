import {LogoFull} from '../../components/ui';
import {useEffect,useState} from 'react';
import {MailCheck} from 'lucide-react';
import {auth} from '../../adapters/auth';

const RESEND_AFTER=60_000;

/** Sign in or create an account: Google, or email and password (12+ characters, typed twice, for a new account). */
export function AuthScreen(){
 let [signup,setSignup]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[again,setAgain]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[sent,setSent]=useState<string|null>(null),[sentAt,setSentAt]=useState(0),[now,setNow]=useState(Date.now());
 // Supabase allows another email after a short wait (60 s by default): count down instead of failing.
 useEffect(()=>{if(!sent)return;const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t)},[sent]);
 const wait=Math.max(0,Math.ceil((sentAt+RESEND_AFTER-now)/1000));
 async function run(fn:()=>Promise<unknown>){setBusy(true);setError('');try{await fn()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function submit(){
  if(!signup)return run(()=>auth.signInWithEmail(email,password));
  if(password!==again){setError('The passwords don’t match.');return}
  await run(async()=>{const result=await auth.signUpWithEmail('',email,password);if(result==='confirm'){setSent(email.trim());setSentAt(Date.now());setNow(Date.now());setPassword('');setAgain('')}});
 }
 const toggle=()=>{setSignup(!signup);setError('');setAgain('')};
 if(sent)return <main className="auth"><div className="auth-box">
  <LogoFull width={180}/>
  <div className="auth-sent"><span className="auth-sent-icon" aria-hidden="true"><MailCheck/></span>
   <h1 className="auth-title">Check your email</h1>
   <p>We sent a link to <strong>{sent}</strong>. Open it on this device to finish creating your account.</p>
  </div>
  {error&&<p role="alert" className="auth-error">{error}</p>}
  <button className="btn auth-google" disabled={busy||wait>0} onClick={()=>run(async()=>{await auth.resendConfirmation(sent);setSentAt(Date.now());setNow(Date.now())})}>{busy?'Sending…':wait>0?`Resend in 0:${String(wait).padStart(2,'0')}`:'Resend email'}</button>
  <p className="auth-switch">Wrong address? <button type="button" className="btn-link" onClick={()=>{setSent(null);setError('')}}>Go back</button></p>
 </div></main>;
 return <main className="auth"><div className="auth-box">
  <LogoFull width={220}/>
  <h1 className="auth-title">{signup?'Create your account':'Welcome back'}</h1>
  <button className="btn auth-google" disabled={busy} onClick={()=>run(auth.signInWithGoogle)}>
   <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z"/></svg>
   Continue with Google
  </button>
  <div className="auth-or" role="separator"><span>or</span></div>
  <form className="auth-form" onSubmit={e=>{e.preventDefault();submit()}}>
   <label>Email<input className="input" type="email" required value={email} autoComplete="email" onChange={e=>setEmail(e.target.value)}/></label>
   <label>Password<input className="input" type="password" required minLength={signup?12:1} value={password} placeholder={signup?'At least 12 characters':undefined} autoComplete={signup?'new-password':'current-password'} onChange={e=>setPassword(e.target.value)}/></label>
   {signup&&<label>Confirm password<input className="input" type="password" required minLength={12} value={again} autoComplete="new-password" aria-invalid={!!again&&again!==password} onChange={e=>setAgain(e.target.value)}/></label>}
   {error&&<p role="alert" className="auth-error">{error}</p>}
   <button className="btn btn-primary btn-block auth-submit" disabled={busy} type="submit">{busy?'Please wait…':signup?'Create account':'Sign in'}</button>
  </form>
  <p className="auth-switch">{signup?'Already have an account?':'New to My Fitness Diary?'} <button type="button" className="btn-link" onClick={toggle}>{signup?'Sign in':'Create an account'}</button></p>
 </div></main>
}
