
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
