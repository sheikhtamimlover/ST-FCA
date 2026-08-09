# ST-FCA (stfca)

[![npm version](https://img.shields.io/npm/v/@bruxa/stfca.svg)](https://www.npmjs.com/package/@bruxa/stfca)
[![npm downloads](https://img.shields.io/npm/dm/@bruxa/stfca.svg)](https://www.npmjs.com/package/@bruxa/stfca)
[![GitHub](https://img.shields.io/github/license/bruxa6t9/ST-FCA)](https://github.com/bruxa6t9/ST-FCA)

> **Unofficial Facebook Chat API for Node.js** - Interact with Facebook Messenger programmatically for ST-BOT 
> 
> **Original Creator:** ST | Sheikh Tamim  
> **Currently Maintained by:** Bruxa | Rakib Adil

---

## ⚠️ IMPORTANT - OFFICIAL PROJECT NOTICE

**Official Repository:** https://github.com/bruxa6t9/ST-FCA.git  
**Official NPM Package:** `@bruxa/stfca`

**Base/Original Repository:** https://github.com/sheikhtamimlover/ST-FCA (by Sheikh Tamim)

### ⛔ WARNING - Copyright Violation

There are **fake and unauthorized copies** of this project created by people using AI-generated code without respecting the original authors' intellectual property rights. 

**Do NOT use any other versions or forks that claim to be "ST-FCA"** - They are:
- ❌ Unauthorized copies
- ❌ Copyright violations
- ❌ May contain malicious code
- ❌ Not maintained or supported

**Only use the official package:** `npm install @bruxa/stfca`  
**Only clone from:** https://github.com/bruxa6t9/ST-FCA.git

If you find any unauthorized copies, please report them to the original creators.

---

## Maintenance

This package was originally created and enhanced by **Sheikh Tamim**.  
As of v1.2.28, it is actively maintained by **Rakib Adil** (`npm: rakib-adil` | `github: @bruxa6t9`)

For issues and PRs, please use this repo.

## 🌟 What's New in ST-FCA

- ✨ Enhanced MQTT connection logging
- 🔄 Auto-reconnect with configurable intervals
- 📊 Better connection status indicators
- 🎨 Improved console output with colors
- 🚀 Automatic update checking and installation
- 💡 Better error handling and debugging
- 🔐 Enhanced security and stability

## 📦 Installation

```bash
npm install @bruxa/stfca
```

Or with yarn:

```bash
yarn add @bruxa/stfca
```

## 🔄 Auto-Update Feature

ST-FCA includes an **automatic update system** that keeps your package up-to-date seamlessly:

### How It Works

1. 🔍 **Automatic Check**: Checks for updates when you start your bot
2. 📋 **Shows Changes**: Displays recent changelog updates
3. 📦 **NPM Update**: Runs `npm install @bruxa/stfca@latest` automatically
4. 🔄 **Auto-Restart**: Restarts your bot to apply changes

### For Bot Projects

If you're using ST-FCA in your bot project (like [ST-BOT](https://github.com/sheikhtamimlover/ST-BOT)), the package will:

- ✅ Detect when a new version is available
- ✅ Automatically update to the latest version via npm
- ✅ Update your `node_modules/@bruxa/stfca` folder
- ✅ Restart your bot with the new version

### Manual Update

You can also update manually:

```bash
npm install @bruxa/stfca@latest
```

Or check for updates programmatically:

```javascript
const { checkForFCAUpdate } = require('@bruxa/stfca/checkUpdate.js');
await checkForFCAUpdate();
```

### Update Notifications

The auto-update system will:
- Show the current and latest versions
- Display recent changes from the changelog
- Inform you when the update is complete
- Automatically restart your application

**Note**: Updates are non-blocking and won't interrupt your bot's startup if the update check fails.

## ⚠️ Important Disclaimer

**We are not responsible if your account gets banned for spammy activities such as:**

- Sending lots of messages to people you don't know
- Sending messages very quickly
- Sending spammy looking URLs
- Logging in and out very quickly

**Recommendation:** Use Firefox browser or [this website](https://fca.dongdev.id.vn) to reduce logout issues, especially for iOS users.

**Support:** If you encounter errors, contact us [here](https://www.facebook.com/mdong.dev)

## 🔍 Introduction

Facebook now has an [official API for chat bots](https://developers.facebook.com/docs/messenger-platform), however it's only available for Facebook Pages.

`stfca` is the only API that allows you to automate chat functionalities on a **user account** by emulating the browser. This means:

- Making the exact same GET/POST requests as a browser
- Does not work with auth tokens
- Requires Facebook account credentials (email/password) or AppState

## 📦 Installation

```bash
npm install @bruxa/stfca@latest
```

## 🚀 Basic Usage

### 1. Login and Simple Echo Bot

```javascript
const login = require("@bruxa/stfca");

login({ appState: [] }, (err, api) => {
    if (err) return console.error(err);

    api.listenMqtt((err, event) => {
        if (err) return console.error(err);

        // Echo back the received message
        api.sendMessage(event.body, event.threadID);
    });
});
```

### 2. Send Text Message

```javascript
const login = require("@bruxa/stfca");

login({ appState: [] }, (err, api) => {
    if (err) {
        console.error("Login Error:", err);
        return;
    }

    let yourID = "000000000000000"; // Replace with actual Facebook ID
    let msg = "Hey!";

    api.sendMessage(msg, yourID, err => {
        if (err) console.error("Message Sending Error:", err);
        else console.log("Message sent successfully!");
    });
});
```

**Tip:** To find your Facebook ID, look inside the cookies under the name `c_user`

### 3. Send File/Image

```javascript
const login = require("@bruxa/stfca");
const fs = require("fs");

login({ appState: [] }, (err, api) => {
    if (err) {
        console.error("Login Error:", err);
        return;
    }

    let yourID = "000000000000000";
    let imagePath = __dirname + "/image.jpg";

    // Check if file exists
    if (!fs.existsSync(imagePath)) {
        console.error("Error: Image file not found!");
        return;
    }

    let msg = {
        body: "Hey!",
        attachment: fs.createReadStream(imagePath)
    };

    api.sendMessage(msg, yourID, err => {
        if (err) console.error("Message Sending Error:", err);
        else console.log("Message sent successfully!");
    });
});
```

## 📝 Message Types

| Type                   | Usage                                                             |
| ---------------------- | ----------------------------------------------------------------- |
| **Regular text** | `{ body: "message text" }`                                      |
| **Sticker**      | `{ sticker: "sticker_id" }`                                     |
| **File/Image**   | `{ attachment: fs.createReadStream(path) }` or array of streams |
| **URL**          | `{ url: "https://example.com" }`                                |
| **Large emoji**  | `{ emoji: "👍", emojiSize: "large" }` (small/medium/large)      |

**Note:** A message can only be a regular message (which can be empty) and optionally **one of the following**: a sticker, an attachment, or a URL.

## 💾 Saving AppState to Avoid Re-login

### Save AppState

```javascript
const fs = require("fs");
const login = require("@bruxa/stfca");

const credentials = { appState: [] };

login(credentials, (err, api) => {
    if (err) {
        console.error("Login Error:", err);
        return;
    }

    try {
        const appState = JSON.stringify(api.getAppState(), null, 2);
        fs.writeFileSync("appstate.json", appState);
        console.log("✅ AppState saved successfully!");
    } catch (error) {
        console.error("Error saving AppState:", error);
    }
});
```

### Use Saved AppState

```javascript
const fs = require("fs");
const login = require("@bruxa/stfca");

login(
    { appState: JSON.parse(fs.readFileSync("appstate.json", "utf8")) },
    (err, api) => {
        if (err) {
            console.error("Login Error:", err);
            return;
        }

        console.log("✅ Logged in successfully!");
        // Your code here
    }
);
```

**Alternative:** Use [c3c-fbstate](https://github.com/c3cbot/c3c-fbstate) to get fbstate.json

## 👂 Listening for Messages

### Echo Bot with Stop Command

```javascript
const fs = require("fs");
const login = require("@bruxa/stfca");

login(
    { appState: JSON.parse(fs.readFileSync("appstate.json", "utf8")) },
    (err, api) => {
        if (err) {
            console.error("Login Error:", err);
            return;
        }

        // Enable listening to events (join/leave, title change, etc.)
        api.setOptions({ listenEvents: true });

        const stopListening = api.listenMqtt((err, event) => {
            if (err) {
                console.error("Listen Error:", err);
                return;
            }

            // Mark as read
            api.markAsRead(event.threadID, err => {
                if (err) console.error("Mark as read error:", err);
            });

            // Handle different event types
            switch (event.type) {
                case "message":
                    if (event.body && event.body.trim().toLowerCase() === "/stop") {
                        api.sendMessage("Goodbye…", event.threadID);
                        stopListening();
                        return;
                    }
                    api.sendMessage(`TEST BOT: ${event.body}`, event.threadID);
                    break;

                case "event":
                    console.log("Event Received:", event);
                    break;
            }
        });
    }
);
```

### Listen Options

```javascript
api.setOptions({
    listenEvents: true,  // Receive events (join/leave, rename, etc.)
    selfListen: true,    // Receive messages from yourself
    logLevel: "silent"   // Disable logs (silent/error/warn/info/verbose)
});
```

**By default:**

- `listenEvents` is `false` - won't receive events like joining/leaving chat, title changes
- `selfListen` is `false` - will ignore messages sent by the current account

## 🛠️ Projects Using This API

### Primary Project

- **[ST-BOT](https://github.com/sheikhtamimlover/ST-BOT)** - Enhanced version of GoatBot V2, a powerful and customizable Facebook Messenger bot with advanced features, plugin support, and automatic updates. This is the main project that ST-FCA was designed for.

### Other Use Cases

ST-FCA can be used for any Facebook Messenger bot project or automation tool. If you want to create your own messenger bot or use this API for other purposes, feel free to integrate it into your project.

## 📚 Full API Documentation

See [DOCS.md](./DOCS.md) for detailed information about:

- All available API methods
- Parameters and options
- Event types
- Error handling
- Advanced usage examples

## 🎯 Quick Reference

### Common API Methods

```javascript
// Send message
api.sendMessage(message, threadID, callback);

// Send typing indicator
api.sendTypingIndicator(threadID, callback);

// Mark as read
api.markAsRead(threadID, callback);

// Get user info
api.getUserInfo(userID, callback);

// Get thread info
api.getThreadInfo(threadID, callback);

// Change thread color
api.changeThreadColor(color, threadID, callback);

// Change thread emoji
api.changeThreadEmoji(emoji, threadID, callback);

// Set message reaction
api.setMessageReaction(reaction, messageID, callback);
```

## 📞 Support & Contact

### Maintained By

**Rakib Adil** - Bruxa | @bruxa6t9

- 🔗 **Facebook:** [facebook.com/RAKIB.404X](https://facebook.com/RAKIB.404X)
- 💬 **Telegram:** [@RAKIBX](https://t.me/RAKIBX)
- 🐙 **GitHub:** [@bruxa6t9](https://github.com/bruxa6t9)

### Original Creator

**Sheikh Tamim** - ST

- 📱 **Instagram:** [@sheikh.tamim_lover](https://www.instagram.com/sheikh.tamim_lover/)
- 🔗 **Facebook:** [facebook.com/hamza.chudena](https://www.facebook.com/hamza.chudena)
- 🐙 **GitHub:** [@sheikhtamimlover](https://github.com/sheikhtamimlover)

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a new branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

MIT License - See [LICENSE](./LICENSE) for details.

## ⭐ Support

If this project is helpful, please give it a ⭐ on GitHub!

## 🔗 Links

- [NPM Package (Official)](https://www.npmjs.com/package/@bruxa/stfca)
- [GitHub Repository (Official)](https://github.com/bruxa6t9/ST-FCA)
- [GitHub Repository (Original Base)](https://github.com/sheikhtamimlover/ST-FCA)
- [Issue Tracker](https://github.com/bruxa6t9/ST-FCA/issues)

---

**Disclaimer:** This is an unofficial API and is not officially supported by Facebook. Use responsibly and comply with [Facebook Terms of Service](https://www.facebook.com/terms.php).
