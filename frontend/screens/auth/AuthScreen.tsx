import {LogoFull} from '../../components/ui';
import {useState} from 'react';
import {auth} from '../../adapters/auth';

/** Sign in or create an account: Google, or email and password (12+ characters for a new account). */
export function AuthScreen(){
 let [signup,setSignup]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function run(fn:()=>Promise<void>){setBusy(true);setError('');try{await fn()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <main className="auth"><div className="auth-box">
  <LogoFull width={220}/>
  <h1 className="auth-title">{signup?'Create your account':'Welcome back'}</h1>
  <button className="btn auth-google" disabled={busy} onClick={()=>run(auth.signInWithGoogle)}>
   <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z"/></svg>
   Continue with Google
  </button>
  <div className="auth-or" role="separator"><span>or</span></div>
  <form className="auth-form" onSubmit={e=>{e.preventDefault();run(()=>signup?auth.signUpWithEmail('',email,password):auth.signInWithEmail(email,password))}}>
   <label>Email<input className="input" type="email" required value={email} autoComplete="email" onChange={e=>setEmail(e.target.value)}/></label>
   <label>Password<input className="input" type="password" required minLength={signup?12:1} value={password} placeholder={signup?'At least 12 characters':undefined} autoComplete={signup?'new-password':'current-password'} onChange={e=>setPassword(e.target.value)}/></label>
   {error&&<p role="alert" className="auth-error">{error}</p>}
   <button className="btn btn-primary btn-block auth-submit" disabled={busy} type="submit">{busy?'Please wait…':signup?'Create account':'Sign in'}</button>
  </form>
  <p className="auth-switch">{signup?'Already have an account?':'New to My Fitness Diary?'} <button type="button" className="btn-link" onClick={()=>{setSignup(!signup);setError('')}}>{signup?'Sign in':'Create an account'}</button></p>
 </div></main>
}
