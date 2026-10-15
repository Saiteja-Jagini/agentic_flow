const http=require('node:http');
function websiteFixture({broken=false}={}) {
  const hits={login:0,destructive:0};
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://fixture');
    const html=(body,status=200)=>{res.writeHead(status,{'content-type':'text/html'});res.end(`<!doctype html><html><head><title>Website fixture</title><link rel="icon" href="data:,"></head><body>${body}</body></html>`);};
    const redirect=location=>{res.writeHead(302,{location});res.end();};
    if(url.pathname==='/login' && req.method==='POST') {
      let body='';req.on('data',data=>body+=data);req.on('end',()=>{
        const fields=new URLSearchParams(body);
        if(fields.get('email')==='discovery@example.test' && fields.get('password')==='fixture-password') {hits.login++;res.writeHead(302,{'set-cookie':'session=fixture; HttpOnly; Path=/; SameSite=Lax',location:'/dashboard'});res.end();}
        else html('<h1>Login failed</h1><input type="password">',401);
      });return;
    }
    if(url.pathname==='/login') return html('<h1>Login</h1><form method="post"><label>Email<input type="email" name="email"></label><label>Password<input type="password" name="password"></label><button type="submit">Login</button></form>');
    if(url.pathname==='/delete' || url.pathname==='/mutate') {hits.destructive++;return html('<h1>Must not visit</h1>');}
    if(url.pathname==='/sitemap.xml') {res.writeHead(200,{'content-type':'application/xml'});return res.end('<urlset><url><loc>/hidden</loc></url></urlset>');}
    if(url.pathname==='/dashboard' && !req.headers.cookie?.includes('session=fixture')) return redirect('/login');
    if(url.pathname==='/dashboard') return html('<h1>Private dashboard</h1><a href="/">Home</a><a href="/catalog">Catalog</a><button aria-expanded="false" id="menu" onclick="this.setAttribute(\'aria-expanded\',\'true\'); document.getElementById(\'nav\').hidden=false">More</button><section id="nav" hidden><h2>Expanded navigation</h2><button type="button" onclick="location.href=\'/settings\'">Settings</button></section><a href="/delete">Delete account</a>');
    if(url.pathname==='/catalog') return html('<h1>Catalog</h1><form method="get" action="/search" role="search"><label>Search<input type="search" name="q"></label><button type="submit">Search</button></form><label>Category<select><option value="all">All</option><option value="books">Books</option></select></label><label>In stock<input type="checkbox"></label>');
    if(url.pathname==='/settings') return html('<h1>Settings</h1><label>Display name<input type="text"></label><form method="post" action="/mutate"><button type="submit">Save</button></form>');
    if(url.pathname==='/search') return html('<h1>Search results</h1>');
    if(url.pathname==='/hidden') return html('<h1>Sitemap page</h1>');
    if(url.pathname==='/broken') return html('<h1>Broken page</h1><script>throw new Error("fixture application error")</script>',broken?500:200);
    if(url.pathname==='/') return html(`<h1>Home</h1><a href="/dashboard">Dashboard</a><a href="/catalog">Catalog</a><a href="/login">Sign in</a>${broken?'<a href="/broken">Broken</a>':''}<a href="https://example.com">External</a><a href="/action?op=delete">Delete</a>`);
    html('<h1>Not found</h1>',404);
  });
  return {server,hits};
}
module.exports={websiteFixture};
