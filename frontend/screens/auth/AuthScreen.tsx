import {LogoFull} from '../../components/ui';
import {useEffect,useState} from 'react';
import {Eye,EyeOff,MailCheck} from 'lucide-react';
import {auth} from '../../adapters/auth';

const RESEND_AFTER=60_000;

/** Password box with a show/hide button. */
function PasswordInput(props:React.InputHTMLAttributes<HTMLInputElement>){
 const [show,setShow]=useState(false);
 return <span className="password-field"><input className="input" {...props} type={show?'text':'password'}/><button type="button" className="password-toggle" aria-label={show?'Hide password':'Show password'} aria-pressed={show} onClick={()=>setShow(!show)}>{show?<EyeOff/>:<Eye/>}</button></span>;
}
type Mode='signin'|'signup'|'forgot';

/**
 * Sign in, create an account (password typed twice, then a confirmation email) or reset a forgotten password
 * (a reset link by email). Google sign-in needs none of these.
 */
export function AuthScreen(){
 let [mode,setMode]=useState<Mode>('signin'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[again,setAgain]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 let [sent,setSent]=useState<{email:string;kind:'confirm'|'reset'}|null>(null),[sentAt,setSentAt]=useState(0),[now,setNow]=useState(Date.now());
 // Supabase allows another email after a short wait (60 s by default): count down instead of failing.
 useEffect(()=>{if(!sent)return;const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t)},[sent]);
 const wait=Math.max(0,Math.ceil((sentAt+RESEND_AFTER-now)/1000));
 async function run(fn:()=>Promise<unknown>){setBusy(true);setError('');try{await fn()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 const mark=(kind:'confirm'|'reset')=>{setSent({email:email.trim(),kind});setSentAt(Date.now());setNow(Date.now());setPassword('');setAgain('')};
 async function submit(){
  if(mode==='signin')return run(()=>auth.signInWithEmail(email,password));
  if(mode==='forgot')return run(async()=>{await auth.requestPasswordReset(email.trim());mark('reset')});
  if(password!==again){setError('The passwords don’t match.');return}
  await run(async()=>{const result=await auth.signUpWithEmail('',email,password);if(result==='confirm')mark('confirm')});
 }
 const go=(m:Mode)=>{setMode(m);setError('');setAgain('')};
 if(sent)return <main className="auth"><div className="auth-box">
  <LogoFull width={180}/>
  <div className="auth-sent"><span className="auth-sent-icon" aria-hidden="true"><MailCheck/></span>
   <h1 className="auth-title">Check your email</h1>
   <p>{sent.kind==='reset'?'If an account uses ':'We sent a link to '}<strong>{sent.email}</strong>{sent.kind==='reset'?', we sent it a link to set a new password. Open it on this device.':'. Open it on this device to finish creating your account.'}</p>
  </div>
  {error&&<p role="alert" className="auth-error">{error}</p>}
  <button className="btn auth-google" disabled={busy||wait>0} onClick={()=>run(async()=>{if(sent.kind==='reset')await auth.requestPasswordReset(sent.email);else await auth.resendConfirmation(sent.email);setSentAt(Date.now());setNow(Date.now())})}>{busy?'Sending…':wait>0?`Resend in 0:${String(wait).padStart(2,'0')}`:'Resend email'}</button>
  <p className="auth-switch">{sent.kind==='reset'?'Remembered it?':'Wrong address?'} <button type="button" className="btn-link" onClick={()=>{setSent(null);setError('');if(sent.kind==='reset')go('signin')}}>{sent.kind==='reset'?'Sign in':'Go back'}</button></p>
 </div></main>;
 return <main className="auth"><div className="auth-box">
  <LogoFull width={220}/>
  <h1 className="auth-title">{mode==='signup'?'Create your account':mode==='forgot'?'Reset your password':'Welcome back'}</h1>
  {mode!=='forgot'&&<>
   <button className="btn auth-google" disabled={busy} onClick={()=>run(auth.signInWithGoogle)}>
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z"/></svg>
    Continue with Google
   </button>
   <div className="auth-or" role="separator"><span>or</span></div>
  </>}
  <form className="auth-form" onSubmit={e=>{e.preventDefault();submit()}}>
   <label>Email<input className="input" type="email" required value={email} autoComplete="email" onChange={e=>setEmail(e.target.value)}/></label>
   {mode!=='forgot'&&<label>Password<PasswordInput required minLength={mode==='signup'?12:1} value={password} placeholder={mode==='signup'?'At least 12 characters':undefined} autoComplete={mode==='signup'?'new-password':'current-password'} onChange={e=>setPassword(e.target.value)}/></label>}
   {mode==='signup'&&<label>Confirm password<PasswordInput required minLength={12} value={again} autoComplete="new-password" aria-invalid={!!again&&again!==password} onChange={e=>setAgain(e.target.value)}/></label>}
   {mode==='signin'&&<button type="button" className="btn-link auth-forgot" onClick={()=>go('forgot')}>Forgot password?</button>}
   {error&&<p role="alert" className="auth-error">{error}</p>}
   <button className="btn btn-primary btn-block auth-submit" disabled={busy} type="submit">{busy?'Please wait…':mode==='signup'?'Create account':mode==='forgot'?'Send reset link':'Sign in'}</button>
  </form>
  <p className="auth-switch">{mode==='signup'?'Already have an account?':mode==='forgot'?'Remembered it?':'New to My Fitness Diary?'} <button type="button" className="btn-link" onClick={()=>go(mode==='signin'?'signup':'signin')}>{mode==='signin'?'Create an account':'Sign in'}</button></p>
 </div></main>
}

/** After opening a password-reset link: choose a new password (typed twice). */
export function SetPasswordScreen({onDone}:{onDone:()=>void}){
 const [password,setPassword]=useState(''),[again,setAgain]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState(false);
 async function submit(){if(password!==again){setError('The passwords don’t match.');return}setBusy(true);setError('');try{await auth.setPassword(password);setDone(true)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <main className="auth"><div className="auth-box">
  <LogoFull width={180}/>
  <h1 className="auth-title">{done?'Password changed':'Set a new password'}</h1>
  {done?<button className="btn btn-primary btn-block auth-submit" onClick={onDone}>Continue</button>:<form className="auth-form" onSubmit={e=>{e.preventDefault();submit()}}>
   <label>New password<PasswordInput required minLength={12} value={password} placeholder="At least 12 characters" autoComplete="new-password" onChange={e=>setPassword(e.target.value)}/></label>
   <label>Confirm new password<PasswordInput required minLength={12} value={again} autoComplete="new-password" aria-invalid={!!again&&again!==password} onChange={e=>setAgain(e.target.value)}/></label>
   {error&&<p role="alert" className="auth-error">{error}</p>}
   <button className="btn btn-primary btn-block auth-submit" disabled={busy} type="submit">{busy?'Please wait…':'Save new password'}</button>
  </form>}
 </div></main>
}
