
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