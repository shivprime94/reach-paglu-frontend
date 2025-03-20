const fs = require('fs');
const archiver = require('archiver');
const path = require('path');

// Create dist directory
if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist');
}

// Create a file to stream archive data to
const output = fs.createWriteStream('dist/reachpaglu.zip');
const archive = archiver('zip', {
    zlib: { level: 9 }
});

// Files to include
const files = [
    'manifest.json',
    'popup.html',
    'popup.js',
    'content.js',
    'background.js',
    'styles.css',
    'assets/icon16.png',
    'assets/icon48.png',
    'assets/icon128.png'
];

// Pipe archive data to the file
archive.pipe(output);

// Add files to the archive
files.forEach(file => {
    archive.file(file, { name: file });
});

// Finalize the archive
archive.finalize();