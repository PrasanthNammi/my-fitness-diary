import {createClient} from '@supabase/supabase-js';
window.formaSupabase=createClient('https://djyozltkmbzhwuvemxuy.supabase.co','sb_publishable_nH3vRaPWVxxY636AThDN5A_ZIlQGghL',{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'forma.supabase.auth'}});
