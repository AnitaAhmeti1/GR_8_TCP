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

////////////////
socket.on('data', (data) => {
  // Handle download protocol
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
    return; // Continue buffering
  }

////////////////////







































































































































  if (trimmed.startsWith('/local sendfile ')) {

    const parts = trimmed.split(' ');
    const localPath = parts[2];
    const remoteName = parts[3] || (localPath ? path.basename(localPath) : null);
   
    if (!localPath) {
      console.log('❌ Usage: /local sendfile <localpath> [remotefilename]');
      rl.prompt();
      return;
    }

    if (!fs.existsSync(localPath)) {
      console.log(`❌ Local file not found: ${localPath}`);
      rl.prompt();
      return;
    }
   
    if (!remoteName) {
      console.log('❌ Remote filename required');
      rl.prompt();
      return;
    }

     try {
      const content = fs.readFileSync(localPath, 'utf8');
      const size = Buffer.byteLength(content, 'utf8');
      console.log(`📤 Uploading: ${localPath} → ${remoteName} (${size} bytes)`);
     
      socket.write(`/upload ${remoteName}\n`);
     

      setTimeout(() => {
        sendUploadContentFromString(content);
        console.log('✓ Upload sent');
      }, 300);
     
    } catch (err) {
      console.log(`❌ Error reading file: ${err.message}`);
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