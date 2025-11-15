
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


const server = net.createServer((socket) => {
  const remote = `${socket.remoteAddress}:${socket.remotePort}`;

  // Limit aktiv
  if (activeConnectionsCount() >= MAX_ACTIVE_CONNECTIONS) {
    try { socket.write('ERROR:SERVER_BUSY Too many connections. Try later.\n'); } catch {}
    try { socket.end(); } catch {}
    console.log(`[${nowISO()}] Refused connection from ${remote} (server busy).`);
    return;
  }

  // State inicial për klientin
  const state = {
    socket,
    remote,
    ip: socket.remoteAddress,
    port: socket.remotePort,
    username: null,
    authenticated: false,
    role: null,
    bytesReceived: 0,
    bytesSent: 0,
    messagesReceived: 0,
    lastActive: Date.now(),
    inactivityTimer: null,
    // upload state
    expectingUpload: false,
    uploadBuffer: '',
    uploadFilename: null
  };
  clients.set(socket, state);

  console.log(`[${nowISO()}] Connection from ${remote}. Active: ${activeConnectionsCount()}`);

  socket.setEncoding('utf8');
    function resetInactivity() {
    state.lastActive = Date.now();
    if (state.inactivityTimer) clearTimeout(state.inactivityTimer);
    state.inactivityTimer = setTimeout(() => {
      try { socket.write('NOTICE:INACTIVITY_CLOSING No activity detected. Connection closing.\n'); } catch {}
      console.log(`[${nowISO()}] Closing for inactivity: ${remote} (user=${state.username})`);
      cleanupSocket();
      try { socket.destroy(); } catch {}
    }, INACTIVITY_MS);
  }
  resetInactivity();
socket.on('data', (data) => {
    resetInactivity();

    const len = Buffer.byteLength(data, 'utf8');
    state.bytesReceived += len;
    totalBytesReceived += len;
    state.messagesReceived += 1;
    state.lastActive = Date.now();
  
    if (state.expectingUpload) {
      state.uploadBuffer += data;
      const beginIdx = state.uploadBuffer.indexOf('CONTENT_BEGIN');
      const endIdx = state.uploadBuffer.indexOf('CONTENT_END');
      if (beginIdx >= 0 && endIdx > beginIdx) {
        const between = state.uploadBuffer.substring(beginIdx + 'CONTENT_BEGIN'.length, endIdx).trim();
        try {
          const safePath = safeJoin(FILES_DIR, state.uploadFilename);
          fs.writeFileSync(safePath, between, 'utf8');
          sendLine(socket, `UPLOAD_OK ${state.uploadFilename}`);
          console.log(`[${nowISO()}] Uploaded ${state.uploadFilename} from ${state.username || state.remote}`);
        } catch (e) {
          sendLine(socket, `ERROR Upload failed: ${e.message}`);
        }
        // cleanup upload state
        state.expectingUpload = false;
        state.uploadBuffer = '';
        state.uploadFilename = null;
      }
      return; 
    }

    
    const lines = data.split(/\r?\n/).filter(Boolean);
    for (const raw of lines) {
      const line = raw.trim();


if (!state.authenticated) {
  if (line.startsWith('AUTH ')) {
    const parts = line.split(' ');
    if (parts.length >= 3) {
      const username = parts[1];
      const password = parts.slice(2).join(' ');
      const user = USERS[username];
      if (user && user.password === password) {
        state.username = username;
        state.authenticated = true;
        state.role = user.role;

        if (clientsByName[username]) {
          state.bytesReceived += (clientsByName[username].bytesReceived || 0);
          state.bytesSent += (clientsByName[username].bytesSent || 0);
          state.messagesReceived += (clientsByName[username].messagesReceived || 0);
        }

        if (state.role === 'admin') {
          try { socket.setNoDelay(true); } catch {}
          console.log(`[${nowISO()}] Admin ${username} - TCP_NODELAY enabled for lower latency`);
        }

        clientsByName[username] = {
          username,
          bytesReceived: state.bytesReceived,
          bytesSent: state.bytesSent,
          messagesReceived: state.messagesReceived,
          lastSeen: Date.now()
        };

        sendLine(socket, `AUTH_OK Welcome ${username}. Role=${state.role}`);
        console.log(`[${nowISO()}] Authenticated ${username} (${state.role}) from ${state.remote}`);
        continue;
      } else {
        sendLine(socket, 'AUTH_FAIL Invalid credentials.');
        continue;
      }
    } else {
      sendLine(socket, 'AUTH_FAIL Usage: AUTH <username> <password>');
      continue;
    }
  } else {
    sendLine(socket, 'ERROR Not authenticated. Please authenticate with: AUTH <username> <password>');
    continue;
  }
}

if (line === 'STATS') {
  sendLine(socket, prettyStats());
} else if (line.startsWith('/')) {
  handleCommand(state, line);
} else {
  const msg = `[${nowISO()}] ${state.username || state.remote}: ${line}\n`;
  fs.appendFile(path.join(__dirname, 'messages.log'), msg, () => {});
  sendLine(socket, `ECHO ${line}`);
}

  socket.on('close', () => {
    console.log(`[${nowISO()}] Connection closed: ${remote} (user=${state.username})`);
    cleanupSocket();
  });

  socket.on('error', (err) => {
    console.log(`[${nowISO()}] Socket error from ${remote}: ${err.message}`);
    cleanupSocket();
  });

  function cleanupSocket() {
    if (state.inactivityTimer) clearTimeout(state.inactivityTimer);
    clients.delete(socket);
    state.expectingUpload = false;
    state.uploadBuffer = '';
    state.uploadFilename = null;
    if (state.username) {
      clientsByName[state.username] = {
        username: state.username,
        bytesReceived: state.bytesReceived,
        bytesSent: state.bytesSent,
        messagesReceived: state.messagesReceived,
        disconnectedAt: Date.now()
      };
    }
  }
});

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on('line', (line) => {
  const t = line.trim().toUpperCase();
  if (t === 'STATS') {
    console.log(prettyStats());
  } else if (t === 'EXIT' || t === 'QUIT') {
    console.log('Shutting down server...');
    process.exit(0);
  } else {
    console.log('Type STATS to see stats, or EXIT to stop the server.');
  }
});

function showHelp() {
  console.log('\n' + '─'.repeat(60));
  console.log('KOMANDAT E DISPONUESHME:');
  console.log('─'.repeat(60));
  console.log('\n📂 FILE MANAGEMENT:');
  console.log('  /list [dir]              - Lista e file-ave në server');
  console.log('  /read <filename>         - Lexo përmbajtjen e file-it');
  console.log('  /download <filename>     - Shkarko file (display content)');
  console.log('  /search <keyword>        - Kërko file sipas emrit');
  console.log('  /info <filename>         - Info për file-in');
  console.log('\n🔐 ADMIN ONLY:');
  console.log('  /upload <filename>       - Upload file (pastaj CONTENT_BEGIN...END)');
  console.log('  /delete <filename>       - Fshi file nga serveri');
  console.log('\n📊 OTHER:');
  console.log('  STATS                    - Statistika të serverit');
  console.log('  <text>                   - Dërgo mesazh të zakonshëm (echo)');
  console.log('\n🛠️  LOCAL HELPER:');
  console.log('  /local sendfile <path> [remotename]  - Upload automatik të file-it lokal');
  console.log('\n💡 EXAMPLES:');
  console.log('  /list');
  console.log('  /read test.txt');
  console.log('  /local sendfile ./document.txt mydoc.txt');
  console.log('  /search report');
  console.log('─'.repeat(60) + '\n');
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '> '
});

rl.prompt();

rl.on('line', (line) => {
  const trimmed = (line || '').trim();
 
  if (!trimmed) {
    rl.prompt();
    return;
  }

  // Help command
  if (trimmed.toLowerCase() === 'help' || trimmed === '?') {
    showHelp();
    rl.prompt();
    return;
  }

  // Exit command
  if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
    console.log('Goodbye!');
    socket.end();
    process.exit(0);
  }
});