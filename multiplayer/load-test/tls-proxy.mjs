// Local certification fixture only: no compression (production ws defaults).
import https from 'node:https';import http from 'node:http';import net from 'node:net';import {readFile} from 'node:fs/promises';
const server=https.createServer({key:await readFile(process.argv[2]),cert:await readFile(process.argv[3])},(req,res)=>{
 const upstream=http.request({host:'127.0.0.1',port:8898,path:req.url,method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);
});
server.on('upgrade',(req,socket,head)=>{
 const upstream=net.connect(8898,'127.0.0.1',()=>{
  upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`+Object.entries(req.headers).map(([k,v])=>`${k}: ${v}`).join('\r\n')+'\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);
 });upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());socket.on('close',()=>upstream.destroy());
});server.listen(8899,'127.0.0.1',()=>console.log('TLS proxy ready'));for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>server.close(()=>process.exit()));
