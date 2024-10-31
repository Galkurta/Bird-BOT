const fs = require("fs");
const path = require("path");
const axios = require("axios");
const WebSocket = require("ws");
const logger = require("./config/logger");
const printBanner = require("./config/banner");

class Birdton {
  constructor() {
    this.config = {
      baseURL: "https://birdton.site",
      headers: {
        Accept: "*/*",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en-US;q=0.8,en;q=0.7",
        Connection: "keep-alive",
        "Content-Type": "application/json",
        Origin: "https://birdton.site",
        Referer: "https://birdton.site/",
        "Sec-Ch-Ua":
          '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        "Sec-Ch-Ua-Mobile": "?1",
        "Sec-Ch-Ua-Platform": '"Android"',
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      },
      maxBoostLevel: 49,
    };

    this.state = {
      remainingEnergy: 0,
      authKey: "",
      payload: {},
      ws: null,
      balance: 0,
      coinValues: {},
      currentBoost: null,
      currentTask: null,
      initialAdsLeft: 0,
      adsProcessed: false,
      userId: "",
    };
  }

  formatBalance(balance) {
    if (balance >= 1000000000) {
      // Billions
      return `${(balance / 1000000000).toFixed(1)}B`;
    }
    if (balance >= 1000000) {
      // Millions
      return `${(balance / 1000000).toFixed(1)}M`;
    }
    if (balance >= 1000) {
      // Thousands
      return `${(balance / 1000).toFixed(1)}K`;
    }
    return balance.toString();
  }

  async waitForTaskCompletion() {
    if (this.state.currentTask) {
      await this.state.currentTask;
      this.state.currentTask = null;
    }
  }

  async fetchAds(userId) {
    const url = `https://api.adsgram.ai/adv?blockId=604&tg_id=${userId}&tg_platform=android&platform=Win32&language=en`;
    try {
      const response = await axios.get(url, { headers: this.config.headers });
      const data = response.data;

      const renderUrl = data.banner.trackings.find(
        (tracking) => tracking.name === "render"
      ).value;
      const showUrl = data.banner.trackings.find(
        (tracking) => tracking.name === "show"
      ).value;
      const rewardUrl = data.banner.trackings.find(
        (tracking) => tracking.name === "reward"
      ).value;

      await axios.get(renderUrl, { headers: this.config.headers });
      await axios.get(showUrl, { headers: this.config.headers });
      await axios.get(rewardUrl, { headers: this.config.headers });

      this.state.ws.send(JSON.stringify({ event_type: "ad_reward", data: "" }));
      logger.info("Processing advertisement");
    } catch (error) {
      logger.error("Error fetching advertisement data", {
        error: error.message,
      });
    }
  }

  sendGameIdMessage() {
    if (this.state.ws && this.state.ws.readyState === WebSocket.OPEN) {
      const totalMessages = Math.floor(Math.random() * 21) + 30;
      const avgInterval = 2000;
      const totalTimeSeconds = Math.ceil((totalMessages * avgInterval) / 1000);
      const minutes = Math.floor(totalTimeSeconds / 60);
      const seconds = totalTimeSeconds % 60;

      logger.info(
        `Starting game session (Estimated time: ${minutes}m ${seconds}s)`
      );

      const gameIdMessage = {
        event_type: "game_id",
        data: "std",
      };
      this.state.ws.send(JSON.stringify(gameIdMessage));
    }
  }

  sendPipeMessages(gameData) {
    let messageCount = 0;
    const totalMessages = Math.floor(Math.random() * 21) + 30;
    let totalTime = 0;

    const sendPipeMessage = () => {
      if (messageCount < totalMessages) {
        const pipeMessage = {
          event_type: "pipe",
          data: gameData,
        };
        this.state.ws.send(JSON.stringify(pipeMessage));
        messageCount++;

        const randomInterval = Math.floor(Math.random() * 3000) + 1000;
        totalTime += randomInterval;
        setTimeout(sendPipeMessage, randomInterval);
      } else {
        const gameEndMessage = {
          event_type: "game_end",
          data: gameData,
        };
        this.state.ws.send(JSON.stringify(gameEndMessage));
        logger.warn(
          `Game session ended (Total time: ${(totalTime / 1000).toFixed(1)}s)`
        );
        this.state.remainingEnergy--;
      }
    };

    sendPipeMessage();
  }

  async buyBoost(boostId, boostValue) {
    if (boostValue >= this.config.maxBoostLevel) {
      logger.info("Maximum boost level reached. Starting game...");
      this.sendGameIdMessage();
      return;
    }

    if (!this.state.coinValues[boostValue]) {
      logger.warn("Invalid boost level or coin value. Starting game...");
      this.sendGameIdMessage();
      return;
    }

    if (this.state.balance > this.state.coinValues[boostValue]) {
      logger.info(
        `Initiating boost upgrade. Required balance: ${this.formatBalance(
          this.state.coinValues[boostValue]
        )}`
      );
      const boostBuyMessage = {
        event_type: "boost_buy",
        data: boostId.toString(),
      };
      this.state.ws.send(JSON.stringify(boostBuyMessage));
    } else {
      logger.warn("Insufficient balance for upgrade");
      this.sendGameIdMessage();
    }
  }

  connectWebSocket(auth_key, payload, balance) {
    const wsURL = `wss://birdton.site/ws?auth=${encodeURIComponent(auth_key)}`;
    this.state.ws = new WebSocket(wsURL);
    this.state.balance = balance;

    this.state.ws.on("open", () => {
      logger.info("WebSocket connection established");
      const message = {
        event_type: "auth",
        data: JSON.stringify(payload),
      };
      this.state.ws.send(JSON.stringify(message));
    });

    this.state.ws.on("message", async (message) => {
      try {
        const parsedMessage = JSON.parse(message.toString("utf8"));
        await this.handleWebSocketMessage(parsedMessage);
      } catch (error) {
        logger.error("WebSocket message parsing error", {
          error: error.message,
        });
      }
    });

    this.state.ws.on("close", () => {
      logger.warn("WebSocket connection closed");
    });

    this.state.ws.on("error", (error) => {
      logger.error("WebSocket error occurred", { error: error.message });
    });
  }

  async handleWebSocketMessage(parsedMessage) {
    switch (parsedMessage.event_type) {
      case "boost":
        await this.handleBoostMessage(parsedMessage);
        break;
      case "buy_boost_result":
        await this.handleBuyBoostResult(parsedMessage);
        break;
      case "game_id":
        if (parsedMessage.data.includes(":")) {
          await this.handleGameIdMessage(parsedMessage);
        }
        break;
      case "game_saved":
        await this.handleGameSaved(parsedMessage);
        break;
    }
  }

  async handleBoostMessage(message) {
    if (!this.state.adsProcessed && this.state.ads_left > 0) {
      await this.handleAds(this.state.userId);
      this.state.adsProcessed = true;
    }

    const boostData = JSON.parse(message.data);
    const coinValues = boostData.price_config.coin_value;
    const boost = boostData.boosts[0];
    const boostValue = boost.value;

    this.state.coinValues = coinValues;
    this.state.currentBoost = boost;

    if (boostValue >= this.config.maxBoostLevel) {
      logger.info(`Maximum boost level ${this.config.maxBoostLevel} reached`);
      this.sendGameIdMessage();
      return;
    }

    const requiredCoinValue = coinValues[boostValue] || 0;
    logger.info(
      `Boost status - Level: ${boostValue} | Required coins: ${this.formatBalance(
        requiredCoinValue
      )}`
    );
    await this.buyBoost(boost.id, boostValue);
  }

  async handleBuyBoostResult(message) {
    const buyBoostResult = JSON.parse(message.data);
    if (buyBoostResult.result === "success") {
      this.state.balance -= buyBoostResult.price;
      logger.info(
        `Boost upgrade successful. New balance: ${this.formatBalance(
          this.state.balance
        )}`
      );

      const nextLevel = this.state.currentBoost.value + 1;
      if (nextLevel >= this.config.maxBoostLevel) {
        logger.info(
          "Maximum boost level reached after upgrade. Starting game..."
        );
        this.sendGameIdMessage();
        return;
      }

      await this.buyBoost(this.state.currentBoost.id, nextLevel);
    } else {
      logger.warn(`Boost upgrade failed: ${buyBoostResult.reason}`);
      this.sendGameIdMessage();
    }
  }

  async handleGameIdMessage(message) {
    const gameData = message.data;
    const gameStartMessage = {
      event_type: "game_start",
      data: gameData,
    };
    this.state.ws.send(JSON.stringify(gameStartMessage));
    setTimeout(() => {
      this.sendPipeMessages(gameData);
    }, 2000);
  }

  async handleGameSaved(message) {
    const gameSavedData = JSON.parse(message.data);
    logger.info(
      `Game results - Score: ${
        gameSavedData.score
      }, Balance: ${this.formatBalance(gameSavedData.balance)}, Energy: ${
        this.state.remainingEnergy
      }`
    );

    if (this.state.remainingEnergy > 0) {
      logger.info(
        `Continuing game with remaining energy: ${this.state.remainingEnergy}`
      );
      this.sendGameIdMessage();
    } else {
      logger.warn("No energy remaining. Ending session");
      this.state.ws.close();
    }
  }

  async auth(payload, userData) {
    try {
      const url = `${this.config.baseURL}/auth`;
      const response = await axios.post(url, payload, {
        headers: this.config.headers,
      });
      const { auth_key, balance, energy, ads_left } = response.data;

      Object.assign(this.state, {
        authKey: auth_key,
        payload,
        remainingEnergy: energy,
        balance,
        initialAdsLeft: ads_left,
        ads_left,
        adsProcessed: false,
        userId: userData.id,
      });

      logger.info(
        `Account status - Balance: ${this.formatBalance(
          balance
        )} | Energy: ${energy} | Ads remaining: ${ads_left}`
      );

      if (energy > 0) {
        this.connectWebSocket(auth_key, payload, balance);
        this.state.currentTask = new Promise((resolve) => {
          this.state.ws.on("close", resolve);
        });
        await this.state.currentTask;
      } else {
        logger.warn("No energy available");
      }

      return response.data;
    } catch (error) {
      logger.error("Authentication error", { error: error.message });
    }
  }

  async handleAds(userId) {
    for (let i = 0; i < this.state.initialAdsLeft; i++) {
      await this.fetchAds(userId);
    }
  }

  countdown(seconds) {
    let lastOutput = "";

    return new Promise((resolve) => {
      process.stdout.write("\n"); // Initial newline for clean display

      const timer = setInterval(() => {
        const hours = String(Math.floor(seconds / 3600)).padStart(2, "0");
        const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(
          2,
          "0"
        );
        const remainingSeconds = String(seconds % 60).padStart(2, "0");
        const output = `Time until next cycle: ${hours}:${minutes}:${remainingSeconds}`;

        // Clear previous line and write new one
        process.stdout.write(
          "\r" + " ".repeat(lastOutput.length) + "\r" + output
        );
        lastOutput = output;
        seconds--;

        if (seconds < 0) {
          clearInterval(timer);
          // Clear the countdown line when done
          process.stdout.write("\r" + " ".repeat(lastOutput.length) + "\r");
          process.stdout.write("\n"); // Add newline for clean separation
          resolve();
        }
      }, 1000);
    });
  }

  async main() {
    printBanner();

    const dataFile = path.join(__dirname, "data.txt");
    const tokens = fs
      .readFileSync(dataFile, "utf8")
      .replace(/\r/g, "")
      .split("\n")
      .filter(Boolean);

    while (true) {
      for (let [index, token] of tokens.entries()) {
        const tgData = token.split("&")[1].split("=")[1];
        const userData = JSON.parse(decodeURIComponent(tgData));
        const firstName = userData.first_name;
        logger.info(
          `Processing account ${index + 1}/${tokens.length} - ${firstName}`
        );

        const payload = this.createPayload(userData, token);
        await this.auth(payload, userData);
        await this.waitForTaskCompletion();
      }

      logger.info("Cycle completed. Starting countdown for next iteration");
      await this.countdown(3600);
      logger.info("Starting new cycle");
    }
  }

  createPayload(userData, token) {
    return {
      initData: token,
      initDataUnsafe: userData,
      version: "7.4",
      platform: "android",
      colorScheme: "light",
      themeParams: {
        bg_color: "#ffffff",
        button_color: "#3390ec",
        button_text_color: "#ffffff",
        hint_color: "#707579",
        link_color: "#00488f",
        secondary_bg_color: "#f4f4f5",
        text_color: "#000000",
        header_bg_color: "#ffffff",
        accent_text_color: "#3390ec",
        section_bg_color: "#ffffff",
        section_header_text_color: "#3390ec",
        subtitle_text_color: "#707579",
        destructive_text_color: "#df3f40",
      },
      isExpanded: true,
      viewportHeight: 639,
      viewportStableHeight: 639,
      isClosingConfirmationEnabled: true,
      isVerticalSwipesEnabled: true,
      headerColor: "#ffffff",
      backgroundColor: "#ffffff",
      BackButton: { isVisible: false },
      MainButton: {
        text: "CONTINUE",
        color: "#3390ec",
        textColor: "#ffffff",
        isVisible: false,
        isProgressVisible: false,
        isActive: true,
      },
      SettingsButton: { isVisible: false },
      HapticFeedback: {},
      CloudStorage: {},
      BiometricManager: {
        isInited: false,
        isBiometricAvailable: false,
        biometricType: "unknown",
        isAccessRequested: false,
        isAccessGranted: false,
        isBiometricTokenSaved: false,
        deviceId: "",
      },
    };
  }
}

if (require.main === module) {
  const birdton = new Birdton();
  birdton.main().catch((err) => {
    logger.error("Application error", { error: err.message });
    process.exit(1);
  });
}
