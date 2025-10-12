
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
        
        // Check if package.json exists in fb-chat-api folder
        let currentVersion = '1.0.3';
        if (fs.existsSync(currentPackagePath)) {
            const currentPackage = JSON.parse(fs.readFileSync(currentPackagePath, 'utf-8'));
            currentVersion = currentPackage.version;
        }
        
        if (latestVersion !== currentVersion) {
            console.log('\x1b[32m%s\x1b[0m', `✨ New ST-FCA version available: ${latestVersion} (current: ${currentVersion})`);
            console.log('\x1b[33m%s\x1b[0m', '📦 Updating ST-FCA...');
            
            // Get changes info
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
            
            // Update FCA files
            await updateFCAFiles();
            
            console.log('\x1b[32m%s\x1b[0m', '✅ ST-FCA updated successfully!');
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

async function updateFCAFiles() {
    const filesToUpdate = [
        'index.js',
        'utils.js',
        'src/listenMqtt.js',
        'package.json',
        'README.md'
    ];
    
    const backupDir = path.join(__dirname, 'backup_' + Date.now());
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }
    
    for (const file of filesToUpdate) {
        try {
            const targetPath = path.join(__dirname, file);
            
            // Backup existing file
            if (fs.existsSync(targetPath)) {
                const backupPath = path.join(backupDir, file);
                const backupFileDir = path.dirname(backupPath);
                if (!fs.existsSync(backupFileDir)) {
                    fs.mkdirSync(backupFileDir, { recursive: true });
                }
                fs.copyFileSync(targetPath, backupPath);
            }
            
            // Download new file
            const { data } = await axios.get(
                `https://raw.githubusercontent.com/sheikhtamimlover/ST-FCA/main/${file}`,
                { responseType: 'arraybuffer' }
            );
            
            // Ensure directory exists
            const fileDir = path.dirname(targetPath);
            if (!fs.existsSync(fileDir)) {
                fs.mkdirSync(fileDir, { recursive: true });
            }
            
            fs.writeFileSync(targetPath, Buffer.from(data));
            console.log('\x1b[32m%s\x1b[0m', `  ✓ Updated: ${file}`);
        } catch (error) {
            console.log('\x1b[31m%s\x1b[0m', `  ✗ Failed to update: ${file}`, error.message);
        }
    }
    
    console.log('\x1b[33m%s\x1b[0m', `💾 Backup saved to: ${backupDir}`);
}

module.exports = { checkForFCAUpdate, updateFCAFiles };
