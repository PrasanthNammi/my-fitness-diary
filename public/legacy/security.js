/* Encode data for JavaScript embedded in an HTML attribute. HTML escaping alone
 * is insufficient: the browser decodes entities before compiling the handler.
 * Kept separate from esc(), which remains the encoder for ordinary HTML text. */
function securityHTML(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function jsString(value){return securityHTML(JSON.stringify(String(value??'')).slice(1,-1).replace(/'/g,'\\u0027').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029'))}
function jsValue(value){return securityHTML((JSON.stringify(value)??'null').replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029'))}
