"""Prepare local harness of pinned actual Supabase Auth validator, never hosted APIs."""
from pathlib import Path
import hashlib,json
p=Path(__file__).resolve().parent/'.sites-runtime/c1b-redirect-matcher'
sha=(p/'upstream-commit.txt').read_text().strip();assert sha=='fcc491d6d7665718b62f50598d723fde1e9b6c4a'
s=(p/'internal_utilities_request.go').read_text();c=(p/'internal_conf_configuration.go').read_text();h=(p/'localhost-upstream.go.txt').read_text()
def extract(s,name):
 a=s.index('func '+name+'(');return s[a:s.index('\n}',a)+2]
assert "glob.MustCompile(uri, '.', '/')" in c
assert 'github.com/gobwas/glob v0.2.3' in (p/'go.mod').read_text()
w=p/'harness';(w/'internal/conf').mkdir(parents=True,exist_ok=True)
(w/'go.mod').write_text('module github.com/supabase/auth\n\ngo 1.25\nrequire github.com/gobwas/glob v0.2.3\n')
(w/'internal/conf/config.go').write_text('package conf\nimport "github.com/gobwas/glob"\ntype GlobalConfiguration struct { SiteURL string; URIAllowListMap map[string]glob.Glob }\n')
(w/'validator.go').write_text('package utilities\nimport("net";"net/url";"regexp";"strings";"github.com/supabase/auth/internal/conf")\nvar decimalIPAddressPattern=regexp.MustCompile("^[0-9]+$")\nvar regularHostname=regexp.MustCompile("^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$")\n'+extract(s,'IsRedirectURLValid')+'\n'+extract(h,'isLocalhost')+'\n')
b='https://mfd-connect-staging.shanustylish777.workers.dev/auth/google/callback';v=b+'?state='+'a'*64
patterns=[b,b+r'\?state=*',b+r'\?state='+'[0123456789abcdef]'*64]
(p/'dashboard-value.txt').write_text(b+'\n')
cases=[('valid-a',v,True),('valid-mixed',b+'?state='+'0123456789abcdef'*4,True),('domain',v.replace('shanustylish777','attacker'),False),('suffix',v.replace('workers.dev/','workers.dev.evil.example/'),False),('http',v.replace('https:','http:'),False),('port',v.replace('workers.dev/','workers.dev:444/'),False),('userinfo',v.replace('https://','https://attacker@'),False),('path',v.replace('/callback?','/other?'),False),('deeper',v.replace('/callback?','/callback/child?'),False),('trailing',v.replace('/callback?','/callback/?'),False),('missing',b,False),('empty',b+'?state=',False),('short',b+'?state=a',False),('long',v+'a',False),('uppercase',b+'?state='+'A'*64,False),('nonhex',b+'?state='+'g'*64,False),('extra',v+'&evil=1',False),('extra-before',b+'?evil=1&state='+'a'*64,False),('duplicate',v+'&state=other',False),('encoded-extra',v+'%26evil=1',False),('encoded-state',b+'?state='+'%61'*64,False),('wrong-delimiter',v.replace('?state=','xstate='),False),('bad-escape',b+'?state=%ZZ',False),('bad-host','https://[bad/auth/google/callback?state=a',False),('relative','/auth/google/callback?state='+'a'*64,False),('newline',v+'\n',False)]
q=lambda x:json.dumps(x)
code='''package utilities
import("testing";"fmt";"github.com/gobwas/glob";"github.com/supabase/auth/internal/conf")
func TestActualAuthValidator(t *testing.T){
patterns:=[]string{'''+','.join(map(q,patterns))+'''}
cases:=[]struct{name,url string;want bool}{'''+','.join('{'+q(n)+','+q(u)+','+str(ok).lower()+'}' for n,u,ok in cases)+'''}
for i,p:=range patterns{
c:=conf.GlobalConfiguration{SiteURL:"http://localhost:3000",URIAllowListMap:map[string]glob.Glob{p:glob.MustCompile(p,'.','/')}}
for _,tc:=range cases{got:=IsRedirectURLValid(&c,tc.url);fmt.Printf("pattern=%d case=%s accepted=%v\\n",i,tc.name,got)
if i==2 && got!=tc.want{t.Errorf("strict %s got %v",tc.name,got)}
if i==0 && tc.want && got{t.Errorf("bare entry unexpectedly accepted %s",tc.name)}
if i==1 && (tc.name=="empty"||tc.name=="extra"||tc.name=="short") && !got{t.Errorf("candidate result changed %s",tc.name)}
}
if !IsRedirectURLValid(&c,"http://localhost:3000/other?x=1"){t.Fatal("Site URL implicit trust changed")}
if i==2 && !IsRedirectURLValid(&c,'''+q(v+'#ignored-fragment')+'''){t.Fatal("fragment stripping changed")}
}}
'''
code+='''
func TestFixedCallback(t *testing.T){
base:="https://mfd-connect-staging.shanustylish777.workers.dev/auth/google/callback"
c:=conf.GlobalConfiguration{SiteURL:"http://localhost:3000",URIAllowListMap:map[string]glob.Glob{base:glob.MustCompile(base,'.','/')}}
if !IsRedirectURLValid(&c,base){t.Fatal("fixed callback denied")}
for _,u:=range []string{"https://evil.invalid/auth/google/callback","http://mfd-connect-staging.shanustylish777.workers.dev/auth/google/callback",base+"/child",base+"/",base+"?state=unexpected",base+"?evil=1","https://mfd-connect-staging.shanustylish777.workers.dev/auth/google/other"}{if IsRedirectURLValid(&c,u){t.Errorf("unexpected redirect %s",u)}}
}
'''
(w/'validator_test.go').write_text(code)
(p/'source-manifest.json').write_text(json.dumps({'commit':sha,'glob':'v0.2.3','files':{f:hashlib.sha256((p/f).read_bytes()).hexdigest() for f in ['internal_utilities_request.go','internal_conf_configuration.go','localhost-upstream.go.txt','go.mod']},'candidate':patterns[1],'historical_strict_length':len(patterns[2]),'current_fixed_value':b,'cases':len(cases),'scope':'verbatim upstream validator/helper; minimal config struct with exact upstream compile options, not full Auth server'},indent=2)+'\n')
print('Prepared actual-validator harness:',len(cases),'cases x 3 historical patterns plus fixed-callback tests; current dashboard length',len(b))
