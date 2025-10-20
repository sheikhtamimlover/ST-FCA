
const axios = require('axios');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function checkForFCAUpdate() {
    try {
        console.log('\x1b[33m%s\x1b[0m', '🔍 Checking for ST-FCA updates...');
        
        // Get latest version from GitHub
        const { data: packageData } = await axios.get(
            'https://raw.githubusercontent.com/sheikhtamimlover/ST-FCA/main/package.json'
        );
        
        const latestVersion = packageData.version;
        const currentPackagePath = path.join(__dirname, 'package.json');
        
        // Check if package.json exists
        let currentVersion = '1.0.3';
        if (fs.existsSync(currentPackagePath)) {
            const currentPackage = JSON.parse(fs.readFileSync(currentPackagePath, 'utf-8'));
            currentVersion = currentPackage.version;
        }
        
        if (latestVersion !== currentVersion) {
            console.log('\x1b[32m%s\x1b[0m', `✨ New ST-FCA version available: ${latestVersion} (current: ${currentVersion})`);
            console.log('\x1b[33m%s\x1b[0m', '📦 Updating ST-FCA...');
            
            // Show changelog
            try {
                const { data: changesData } = await axios.get(
                    'https://raw.githubusercontent.com/sheikhtamimlover/ST-FCA/main/CHANGELOG.md'
                );
                console.log('\x1b[36m%s\x1b[0m', '📋 Recent Changes:');
                const latestChanges = changesData.split('##')[1]?.split('\n').slice(0, 5).join('\n');
                if (latestChanges) {
                    console.log(latestChanges);
                }
            } catch (err) {
                // Silently ignore changelog fetch errors
            }
            
            // Perform comprehensive update
            await performComprehensiveUpdate();
            
            console.log('\x1b[32m%s\x1b[0m', '✅ ST-FCA updated successfully!');
            console.log('\x1b[33m%s\x1b[0m', '🔄 Restarting to apply changes...');
            
            // Restart the process
            setTimeout(() => {
                process.exit(0);
            }, 1000);
            
            return true;
        } else {
            console.log('\x1b[32m%s\x1b[0m', `✅ ST-FCA is up to date (v${currentVersion})`);
            return false;
        }
    } catch (error) {
        console.log('\x1b[31m%s\x1b[0m', '❌ Failed to check for ST-FCA updates:', error.message);
        return false;
    }
}

async function performComprehensiveUpdate() {
    try {
        // Step 1: Get the complete file tree from GitHub
        console.log('\x1b[36m%s\x1b[0m', '📂 Fetching complete file structure...');
        const fileTree = await getGitHubFileTree();
        
        // Step 2: Get local files
        const localFiles = getLocalFiles();
        
        // Step 3: Download/Update all files from GitHub
        console.log('\x1b[36m%s\x1b[0m', '⬇️  Downloading files...');
        for (const file of fileTree) {
            await downloadFile(file);
        }
        
        // Step 4: Delete files that don't exist in the latest version
        console.log('\x1b[36m%s\x1b[0m', '🗑️  Cleaning up old files...');
        const githubFilePaths = fileTree.map(f => f.path);
        for (const localFile of localFiles) {
            if (!githubFilePaths.includes(localFile) && !shouldKeepFile(localFile)) {
                deleteLocalFile(localFile);
            }
        }
        
        console.log('\x1b[32m%s\x1b[0m', '✅ All files synchronized!');
    } catch (error) {
        console.log('\x1b[31m%s\x1b[0m', '❌ Update failed:', error.message);
        throw error;
    }
}

async function getGitHubFileTree() {
    try {
        const { data } = await axios.get(
            'https://api.github.com/repos/sheikhtamimlover/ST-FCA/git/trees/main?recursive=1'
        );
        
        // Filter only files (not directories)
        return data.tree
            .filter(item => item.type === 'blob')
            .filter(item => !item.path.startsWith('.git'))
            .filter(item => !shouldIgnoreFile(item.path));
    } catch (error) {
        console.log('\x1b[31m%s\x1b[0m', '❌ Failed to fetch file tree:', error.message);
        throw error;
    }
}

function getLocalFiles() {
    const files = [];
    
    function walkDir(dir, baseDir = '') {
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
            const fullPath = path.join(dir, item);
            const relativePath = baseDir ? path.join(baseDir, item) : item;
            
            if (shouldIgnoreFile(relativePath)) continue;
            
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                walkDir(fullPath, relativePath);
            } else {
                files.push(relativePath.replace(/\\/g, '/'));
            }
        }
    }
    
    walkDir(__dirname);
    return files;
}

function shouldIgnoreFile(filePath) {
    const ignorePatterns = [
        'node_modules',
        '.git',
        '.env',
        'appstate.json',
        'fbstate.json',
        'package-lock.json',
        '.replit',
        'replit.nix',
        '.config',
        'generated-icon.png'
    ];
    
    return ignorePatterns.some(pattern => filePath.includes(pattern));
}

function shouldKeepFile(filePath) {
    const keepPatterns = [
        'node_modules',
        '.env',
        'appstate.json',
        'fbstate.json',
        'package-lock.json',
        '.replit',
        'replit.nix',
        '.config'
    ];
    
    return keepPatterns.some(pattern => filePath.includes(pattern));
}

async function downloadFile(fileInfo) {
    try {
        const targetPath = path.join(__dirname, fileInfo.path);
        
        // Download file content
        const { data } = await axios.get(
            `https://raw.githubusercontent.com/sheikhtamimlover/ST-FCA/main/${fileInfo.path}`,
            { responseType: 'arraybuffer' }
        );
        
        // Ensure directory exists
        const fileDir = path.dirname(targetPath);
        if (!fs.existsSync(fileDir)) {
            fs.mkdirSync(fileDir, { recursive: true });
        }
        
        // Write file
        fs.writeFileSync(targetPath, Buffer.from(data));
        console.log('\x1b[32m%s\x1b[0m', `  ✓ ${fileInfo.path}`);
    } catch (error) {
        console.log('\x1b[31m%s\x1b[0m', `  ✗ Failed: ${fileInfo.path}`, error.message);
    }
}

function deleteLocalFile(filePath) {
    try {
        const fullPath = path.join(__dirname, filePath);
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            console.log('\x1b[33m%s\x1b[0m', `  🗑️  Deleted: ${filePath}`);
        }
    } catch (error) {
        console.log('\x1b[31m%s\x1b[0m', `  ✗ Failed to delete: ${filePath}`, error.message);
    }
}

module.exports = { checkForFCAUpdate, performComprehensiveUpdate };
