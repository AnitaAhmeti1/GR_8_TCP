const net = require('net');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      out[key] = val;
    }
  }
  return out;
}

const args = parseArgs(process.argv);
const HOST = args.host || '127.0.0.1';
const PORT = parseInt(args.port || '9000', 10);
const USER = args.user || null;
const PASS = args.pass || null;

console.log('='.repeat(60));
console.log('TCP CLIENT - Rrjetat Kompjuterike');
console.log('='.repeat(60));
console.log(`Connecting to: ${HOST}:${PORT}`);
console.log('='.repeat(60));

const socket = net.createConnection({ host: HOST, port: PORT }, () => {
  console.log(`✓ Connected to ${HOST}:${PORT}`);
  if (USER && PASS) {
    console.log(`→ Authenticating as: ${USER}`);
    socket.write(`AUTH ${USER} ${PASS}\n`);
  } else {
    console.log('\nℹ Nuk u dhanë kredenciale në start. Mund të autentikohesh me:');
    console.log('  AUTH <username> <password>');
    console.log('\nShembuj:');
    console.log('  AUTH admin adminpass');
    console.log('  AUTH user1 user1pass');
  }
  showHelp();
});

socket.setEncoding('utf8');

let downloadBuffer = '';
let isDownloading = false;

socket.on('data', (data) => {
  if (data.includes('DOWNLOAD_BEGIN') || isDownloading) {
    downloadBuffer += data;
    isDownloading = true;
   
    if (downloadBuffer.includes('DOWNLOAD_END')) {
      const beginIdx = downloadBuffer.indexOf('DOWNLOAD_BEGIN');
      const endIdx = downloadBuffer.indexOf('DOWNLOAD_END');
      if (beginIdx >= 0 && endIdx > beginIdx) {
        const content = downloadBuffer.substring(beginIdx + 'DOWNLOAD_BEGIN'.length, endIdx).trim();
        const lines = content.split('\n');
        const filename = lines[0];
        const fileContent = lines.slice(1).join('\n');
       
        console.log(`\n[DOWNLOAD] File: ${filename}`);
        console.log(`[DOWNLOAD] Size: ${Buffer.byteLength(fileContent, 'utf8')} bytes`);
        console.log('[DOWNLOAD] Content:');
        console.log('─'.repeat(60));
        console.log(fileContent);
        console.log('─'.repeat(60));
      }
      downloadBuffer = '';
      isDownloading = false;
      return;
    }
    return;
  }

  if (data.includes('FILE_CONTENT_BEGIN') && data.includes('FILE_CONTENT_END')) {
    const beginIdx = data.indexOf('FILE_CONTENT_BEGIN');
    const endIdx = data.indexOf('FILE_CONTENT_END');
    const content = data.substring(beginIdx + 'FILE_CONTENT_BEGIN'.length, endIdx).trim();
    const lines = content.split('\n');
    const filename = lines[0];
    const fileContent = lines.slice(1).join('\n');
   
    console.log(`\n[FILE] ${filename}`);
    console.log('─'.repeat(60));
    console.log(fileContent);
    console.log('─'.repeat(60));
    return;
  }

  process.stdout.write(`[SERVER] ${data}`);
});

socket.on('close', () => {
  console.log('\n Disconnected from server.');
  process.exit(0);
});

socket.on('error', (err) => {
  console.error(`\n Socket error: ${err.message}`);
  process.exit(1);
});

function sendUploadContentFromString(content) {
  socket.write('CONTENT_BEGIN\n');
  socket.write(content + '\n');
  socket.write('CONTENT_END\n');
}

function showHelp() {
  console.log('\n' + '─'.repeat(60));
  console.log('KOMANDAT E DISPONUESHME:');
  console.log('─'.repeat(60));
  console.log('\n FILE MANAGEMENT:');
  console.log('  /list [dir]              - Lista e file-ave në server');
  console.log('  /read <filename>         - Lexo përmbajtjen e file-it');
  console.log('  /download <filename>     - Shkarko file (display content)');
  console.log('  /search <keyword>        - Kërko file sipas emrit');
  console.log('  /info <filename>         - Info për file-in');
  console.log('\n ADMIN ONLY:');
  console.log('  /upload <filename>       - Upload file (pastaj CONTENT_BEGIN...END)');
  console.log('  /delete <filename>       - Fshi file nga serveri');
  console.log('\n OTHER:');
  console.log('  STATS                    - Statistika të serverit');
  console.log('  <text>                   - Dërgo mesazh të zakonshëm (echo)');
  console.log('\n LOCAL HELPER:');
  console.log('  /local sendfile <path> [remotename]  - Upload automatik të file-it lokal');
  console.log('\n EXAMPLES:');
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

  if (trimmed.toLowerCase() === 'help' || trimmed === '?') {
    showHelp();
    rl.prompt();
    return;
  }

  if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
    console.log('Goodbye!');
    socket.end();
    process.exit(0);
  }

  if (trimmed.startsWith('/local sendfile ')) {
    const parts = trimmed.split(' ');
    const localPath = parts[2];
    const remoteName = parts[3] || (localPath ? path.basename(localPath) : null);
   
    if (!localPath) {
      console.log(' Usage: /local sendfile <localpath> [remotefilename]');
      rl.prompt();
      return;
    }
   
    if (!fs.existsSync(localPath)) {
      console.log(` Local file not found: ${localPath}`);
      rl.prompt();
      return;
    }
   
    if (!remoteName) {
      console.log(' Remote filename required');
      rl.prompt();
      return;
    }
   
    try {
      const content = fs.readFileSync(localPath, 'utf8');
      const size = Buffer.byteLength(content, 'utf8');
      console.log(` Uploading: ${localPath} → ${remoteName} (${size} bytes)`);
     
      socket.write(`/upload ${remoteName}\n`);
     
      setTimeout(() => {
        sendUploadContentFromString(content);
        console.log('✓ Upload sent');
      }, 300);
     
    } catch (err) {
      console.log(` Error reading file: ${err.message}`);
    }
   
    rl.prompt();
    return;
  }

  socket.write(trimmed + '\n');
  rl.prompt();
});

rl.on('close', () => {
  console.log('\nGoodbye!');
  socket.end();
  process.exit(0);
});