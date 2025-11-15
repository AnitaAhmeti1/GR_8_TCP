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