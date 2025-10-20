const axios = require('axios');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function checkForFCAUpdate() {
    try {
        console.log('\x1b[33m%s\x1b[0m', '🔍 Checking for ST-FCA updates...');
        
        // Get latest version from npm registry
        const { data: npmData } = await axios.get(
            'https://registry.npmjs.org/stfca/latest'
        );
        
        const latestVersion = npmData.version;
        
        // Check current installed version in node_modules
        let currentVersion = '1.0.8';
        const nodeModulesPackagePath = path.join(process.cwd(), 'node_modules', 'stfca', 'package.json');
        if (fs.existsSync(nodeModulesPackagePath)) {
            const installedPackage = JSON.parse(fs.readFileSync(nodeModulesPackagePath, 'utf-8'));
            currentVersion = installedPackage.version;
        }
        
        if (latestVersion !== currentVersion) {
            console.log('\x1b[32m%s\x1b[0m', `✨ New ST-FCA version available: ${latestVersion} (current: ${currentVersion})`);
            console.log('\x1b[33m%s\x1b[0m', '📦 Updating ST-FCA package...');
            
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
            
            // Update npm package
            await updateNpmPackage(latestVersion);
            
            // Update version in user's package.json
            await updateUserPackageJson(latestVersion);
            
            console.log('\x1b[32m%s\x1b[0m', '✅ ST-FCA updated successfully!');
            console.log('\x1b[33m%s\x1b[0m', '🔄 Restarting to apply changes...');
            
            // Restart the process
            setTimeout(() => {
                process.exit(2);
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

async function updateNpmPackage(version) {
    try {
        console.log('\x1b[36m%s\x1b[0m', `📦 Running npm install stfca@${version}...`);
        
        // Execute npm install command
        execSync(`npm install stfca@${version} --save`, {
            cwd: process.cwd(),
            stdio: 'inherit'
        });
        
        console.log('\x1b[32m%s\x1b[0m', '✅ Package installed successfully!');
        return true;
    } catch (error) {
        console.log('\x1b[31m%s\x1b[0m', '❌ Failed to install package:', error.message);
        throw error;
    }
}

async function updateUserPackageJson(version) {
    try {
        const userPackageJsonPath = path.join(process.cwd(), 'package.json');

        if (!fs.existsSync(userPackageJsonPath)) {
            console.log('\x1b[33m%s\x1b[0m', '⚠️  No package.json found in user project');
            return;
        }

        const packageJson = JSON.parse(fs.readFileSync(userPackageJsonPath, 'utf-8'));

        // Update stfca version in dependencies
        if (packageJson.dependencies && packageJson.dependencies.stfca) {
            packageJson.dependencies.stfca = `^${version}`;
            fs.writeFileSync(userPackageJsonPath, JSON.stringify(packageJson, null, 2));
            console.log('\x1b[32m%s\x1b[0m', `✅ Updated package.json to stfca@${version}`);
        }

        return true;
    } catch (error) {
        console.log('\x1b[31m%s\x1b[0m', '⚠️  Failed to update user package.json:', error.message);
        // Don't throw - this is not critical
        return false;
    }
}

module.exports = { checkForFCAUpdate, updateNpmPackage, updateUserPackageJson };