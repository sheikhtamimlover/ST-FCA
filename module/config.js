const fs = require("fs");
const path = require("path");
const defaultConfig = {
  autoUpdate: false,
  mqtt: { enabled: true, reconnectInterval: 3600 },
  autoLogin: true,
  credentials: { email: "", password: "", twofactor: "" }
};

function loadConfig() {
  const configPath = path.join(process.cwd(), "fca-config.json");
  let config;
  if (!fs.existsSync(configPath)) {
    try {
      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
      config = defaultConfig;
    } catch (err) {
      console.error(`[FCA-ERROR] Error writing config file: ${err.message}`);
      config = defaultConfig;
    }
  } else {
    try {
      const fileContent = fs.readFileSync(configPath, "utf8");
      config = Object.assign({}, defaultConfig, JSON.parse(fileContent));
    } catch (err) {
      console.error(`[FCA-ERROR] Error reading config file: ${err.message}`);
      config = defaultConfig;
    }
  }
  return { config, configPath };
}

module.exports = { loadConfig, defaultConfig };