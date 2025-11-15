
const net = require('net');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = parseInt(process.env.PORT || '9000', 10);

const MAX_ACTIVE_CONNECTIONS = 6;        
const INACTIVITY_MS = 2 * 60 * 1000;       
const STATS_LOG_FILE = path.join(__dirname, 'server_stats.txt');
const FILES_DIR = path.join(__dirname, 'server_files');

if (!fs.existsSync(FILES_DIR)) fs.mkdirSync(FILES_DIR, { recursive: true });

const USERS = {
  admin: { password: 'adminpass', role: 'admin' },
  user1: { password: 'user1pass', role: 'read' },
  user2: { password: 'user2pass', role: 'read' },
  user3: { password: 'user3pass', role: 'read' }
};

const clients = new Map();   
const clientsByName = {};     
let totalBytesReceived = 0;
let totalBytesSent = 0;

const nowISO = () => new Date().toISOString();

function safeJoin(baseDir, requestedPath = '.') {
  const base = path.resolve(baseDir);
  const resolved = path.resolve(base, requestedPath);
  const rel = path.relative(base, resolved);
  if (rel === '' || (!rel.split(path.sep).includes('..') && !rel.startsWith('..'))) return resolved;
  throw new Error('Path traversal detected');
}

function activeConnectionsCount() { return clients.size; }
function listActiveIPs() {
  const ips = new Set();
  for (const st of clients.values()) ips.add(st.ip);
  return Array.from(ips);
}

function prettyStats() {
  const out = {
    time: nowISO(),
    active_connections: activeConnectionsCount(),
    active_ips: listActiveIPs(),
    total_bytes_received: totalBytesReceived,
    total_bytes_sent: totalBytesSent,
    per_client: []
  };
  for (const st of clients.values()) {
    out.per_client.push({
      username: st.username,
      ip: st.ip,
      port: st.port,
      role: st.role,
      messages_received: st.messagesReceived,
      bytes_received: st.bytesReceived,
      bytes_sent: st.bytesSent,
      last_active: new Date(st.lastActive).toISOString()
    });
  }
  return JSON.stringify(out, null, 2);
}

function sendLine(socket, text) {
  if (socket.destroyed) return;
  const line = text.endsWith('\n') ? text : text + '\n';
  socket.write(line);
  const st = clients.get(socket);
  if (st) {
    const n = Buffer.byteLength(line, 'utf8');
    st.bytesSent += n;
    totalBytesSent += n;
  }
}



function requireAdminOrFail(state) {
  if (state.role !== 'admin') {
    sendLine(state.socket, 'ERROR Permission denied. Admin required.');
    return false;
  }
  return true;
}

function requireAuthenticatedOrFail(state) {
  if (!state.authenticated) {
    sendLine(state.socket, 'ERROR Not authenticated.');
    return false;
  }
  return true;
}


function handleCommand(state, line) {
  const socket = state.socket;
  const parts = line.split(' ').filter(Boolean);
  const cmd = (parts[0] || '').toLowerCase();
   
  
if (!requireAuthenticatedOrFail(state)) return;

  try {
    switch (cmd) {
      case '/list': {
          const dir = parts.length > 1 ? parts.slice(1).join(' ') : '.';
        const safeDir = safeJoin(FILES_DIR, dir);
        const items = fs.readdirSync(safeDir, { withFileTypes: true })
          .map(d => (d.isDirectory() ? `[DIR] ${d.name}` : d.name));
        sendLine(socket, `LIST ${safeDir}:\n${items.join('\n')}`);
        break;
      }
      case '/read': 
       const filename = parts[1];
        if (!filename) { sendLine(socket, 'ERROR Usage: /read <filename>'); break; }
        const safePath = safeJoin(FILES_DIR, filename);
        if (!fs.existsSync(safePath)) { sendLine(socket, 'ERROR File not found'); break; }
        const stat = fs.statSync(safePath);
        if (stat.isDirectory()) { sendLine(socket, 'ERROR Cannot read directory. Use /list'); break; }
        const content = fs.readFileSync(safePath, 'utf8');
        sendLine(socket, `FILE_CONTENT_BEGIN\n${path.basename(safePath)}\n${content}\nFILE_CONTENT_END`);
        break;
      }

      case '/upload': {
      
        if (!requireAdminOrFail(state)) break;
        const filename = parts[1];
        if (!filename) { sendLine(socket, 'ERROR Usage: /upload <filename> (then send CONTENT_BEGIN ... CONTENT_END)'); break; }
        if (state.expectingUpload) { sendLine(socket, 'ERROR Already expecting an upload.'); break; }
        state.expectingUpload = true;
        state.uploadBuffer = '';
        state.uploadFilename = filename;
        sendLine(socket, 'READY_FOR_UPLOAD Send CONTENT_BEGIN then file content then CONTENT_END on separate lines.');
        break;
      }
      case '/download': {
     
        const filename = parts[1];
        if (!filename) { sendLine(socket, 'ERROR Usage: /download <filename>'); break; }
        const safePath = safeJoin(FILES_DIR, filename);
        if (!fs.existsSync(safePath)) { sendLine(socket, 'ERROR File not found'); break; }
        const stat = fs.statSync(safePath);
        if (stat.isDirectory()) { sendLine(socket, 'ERROR Cannot download directory'); break; }
        const content = fs.readFileSync(safePath, 'utf8');
        sendLine(socket, `DOWNLOAD_BEGIN\n${path.basename(safePath)}\n${content}\nDOWNLOAD_END`);
        break;
      }
      case '/delete': {
       
        if (!requireAdminOrFail(state)) break;
        const filename = parts[1];
        if (!filename) { sendLine(socket, 'ERROR Usage: /delete <filename>'); break; }
        const safePath = safeJoin(FILES_DIR, filename);
        if (!fs.existsSync(safePath)) { sendLine(socket, 'ERROR File not found'); break; }
        fs.unlinkSync(safePath);
        sendLine(socket, `DELETE_OK ${filename}`);
        console.log(`[${nowISO()}] ${state.username} deleted: ${filename}`);
        break;
      }
      case '/search': {
        
        const keyword = parts.slice(1).join(' ');
        if (!keyword) { sendLine(socket, 'ERROR Usage: /search <keyword>'); break; }
        const found = [];
        const items = fs.readdirSync(FILES_DIR);
        for (const it of items) if (it.toLowerCase().includes(keyword.toLowerCase())) found.push(it);
        sendLine(socket, `SEARCH_RESULTS ${found.length}\n${found.join('\n')}`);
        break;
      }
         case '/info': {
        const filename = parts[1];
        if (!filename) { sendLine(socket, 'ERROR Usage: /info <filename>'); break; }
        const safePath = safeJoin(FILES_DIR, filename);
        if (!fs.existsSync(safePath)) { sendLine(socket, 'ERROR File not found'); break; }
        const st = fs.statSync(safePath);
        const type = st.isDirectory() ? 'directory' : 'file';
        sendLine(socket, `INFO\nname: ${filename}\ntype: ${type}\nsize: ${st.size} bytes\ncreated: ${st.birthtime.toISOString()}\nmodified: ${st.mtime.toISOString()}`);
        break;
      }
      default:
        sendLine(socket, 'ERROR Unknown command. Available: /list /read /download /search /info /upload /delete');
    }
  } catch (err) {
    sendLine(socket, 'ERROR ' + err.message);
  }
}

//
// const server = net.createServer((socket) => {
//   const remote = `${socket.remoteAddress}:${socket.remotePort}`;

//   // Limit aktiv
//   if (activeConnectionsCount() >= MAX_ACTIVE_CONNECTIONS) {
//     try { socket.write('ERROR:SERVER_BUSY Too many connections. Try later.\n'); } catch {}
//     try { socket.end(); } catch {}
//     console.log(`[${nowISO()}] Refused connection from ${remote} (server busy).`);
//     return;
//   }

//   // State inicial për klientin
//   const state = {
//     socket,
//     remote,
//     ip: socket.remoteAddress,
//     port: socket.remotePort,
//     username: null,
//     authenticated: false,
//     role: null,
//     bytesReceived: 0,
//     bytesSent: 0,
//     messagesReceived: 0,
//     lastActive: Date.now(),
//     inactivityTimer: null,
//     // upload state
//     expectingUpload: false,
//     uploadBuffer: '',
//     uploadFilename: null
//   };
//   clients.set(socket, state);

//   console.log(`[${nowISO()}] Connection from ${remote}. Active: ${activeConnectionsCount()}`);

//   socket.setEncoding('utf8');
//     function resetInactivity() {
//     state.lastActive = Date.now();
//     if (state.inactivityTimer) clearTimeout(state.inactivityTimer);
//     state.inactivityTimer = setTimeout(() => {
//       try { socket.write('NOTICE:INACTIVITY_CLOSING No activity detected. Connection closing.\n'); } catch {}
//       console.log(`[${nowISO()}] Closing for inactivity: ${remote} (user=${state.username})`);
//       cleanupSocket();
//       try { socket.destroy(); } catch {}
//     }, INACTIVITY_MS);
//   }
//   resetInactivity();

>>>>>>> 35cf110c8eb6d1dcb757bfe6f2fb31479d1c58a1
