
# Changelog

All notable changes to ST-FCA will be documented in this file.

## [1.0.5] - 2025-01-13

### Added
- 🔄 Comprehensive update system that properly syncs all files
- 📂 Automatic file tree comparison between local and GitHub
- ➕ Smart file addition for new files in updates
- ♻️ Automatic modification detection and update
- 🗑️ Automatic deletion of removed files from old versions
- 🎯 No backup folder creation - cleaner updates

### Changed
- Improved update mechanism to handle version jumps (e.g., 1.0.3 → 1.0.6)
- Enhanced file synchronization to ensure no missing files
- Better error handling during updates
- Auto-restart after successful update

### Fixed
- Missing files when updating across multiple versions
- Outdated files not being properly replaced
- Orphaned files from old versions not being cleaned up

## [1.0.4] - 2025-01-13

### Added
- 🔄 Automatic update checking on package initialization
- ⚡ Non-blocking update process - doesn't interrupt user's bot startup
- 🎯 Update check runs once per session to avoid redundant checks
- 💡 Silent error handling for update checks

### Changed
- Update checker now integrated directly into login flow
- Improved user experience with seamless auto-updates

## [1.0.3] - 2025-01-13

### Added
- 🎨 Enhanced MQTT connection logging with visual indicators
- 🔄 Auto-reconnect status display
- 📊 Connection region display
- ⚡ Automatic update checking and installation
- 💾 Automatic backup creation before updates
- 🎯 Better error messages and debugging
- 📋 Changelog tracking
- 🌟 Branding: "Maintained & Enhanced by ST | Sheikh Tamim"

### Changed
- Improved console output with colors and formatting
- Better connection status messages
- Enhanced stability and error handling

### Fixed
- MQTT reconnection reliability
- Connection timeout handling
- Error message clarity

---

**Maintained & Enhanced by ST | Sheikh Tamim**  
GitHub: https://github.com/sheikhtamimlover/ST-FCA  
NPM: https://www.npmjs.com/package/stfca
