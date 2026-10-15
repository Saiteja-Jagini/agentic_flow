const http = require('node:http');
function createDemoServer(mode = 'working') {
  let requests = 0;
  const email = process.env.DEMO_VALID_EMAIL || 'demo@example.test';
  const password = process.env.DEMO_VALID_PASSWORD || 'demo-only-password';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Login demo</title></head>
  <body><h1>Login demo</h1><form id="login"><label>Email <input name="email" type="email" required></label>
  <label>Password <input name="password" type="password" required></label>
  ${mode === 'missing-button' ? '' : '<button type="submit">Login</button>'}</form><p id="message" role="alert"></p>
  <script>document.querySelector('#login').addEventListener('submit',async event=>{
    event.preventDefault();const data=Object.fromEntries(new FormData(event.target));
    try{const result=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
      const body=await result.json();if(body.ok)location.href='/dashboard';else document.querySelector('#message').textContent=body.message;
    }catch{document.querySelector('#message').textContent='Network error';}
  });</script></body></html>`;
  return http.createServer((request, response) => {
    if (request.url === '/api/login' && request.method === 'POST') {
      let body = '';
      request.on('data', chunk => { body += chunk; if (body.length > 10000) request.destroy(); });
      request.on('end', () => {
        const respond = () => {
          response.setHeader('Content-Type','application/json');
          if (mode === 'network' || mode === 'transient' && requests++ === 0) {
            response.writeHead(503); response.end(JSON.stringify({ ok:false, message:'Service temporarily unavailable' })); return;
          }
          let data;
          try { data = JSON.parse(body); } catch { response.writeHead(400); response.end('{}'); return; }
          response.end(JSON.stringify({ ok: data.email === email && data.password === password, message: mode === 'wrong-text' ? 'Something went wrong' : 'Invalid email or password' }));
        };
        if (mode === 'slow') setTimeout(respond, 5000); else respond();
      });
      return;
    }
    response.setHeader('Content-Type','text/html; charset=utf-8');
    if (request.url === '/dashboard') response.end('<!doctype html><title>Dashboard</title><h1>Dashboard</h1>');
    else if (request.url === '/' || request.url === '/login') response.end(html);
    else { response.writeHead(404); response.end('Not found'); }
  });
}
module.exports = { createDemoServer };
