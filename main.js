const fs = require('fs');
const path = require('path');
const axios = require('axios');
const WebSocket = require('ws');
const { green, red, yellow, blue } = require('colorette');

class Birdton {
    constructor() {
        this.baseURL = 'https://birdton.site';
        this.headers = {
            'Accept': '*/*',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
            'Connection': 'keep-alive',
            'Content-Type': 'application/json',
            'Origin': 'https://birdton.site',
            'Referer': 'https://birdton.site/',
            'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'Sec-Ch-Ua-Mobile': '?1',
            'Sec-Ch-Ua-Platform': '"Android"',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
        };
        this.remainingEnergy = 0;
        this.authKey = '';
        this.payload = {};
        this.ws = null;
        this.balance = 0;
        this.coinValues = {};
        this.currentBoost = null;
        this.currentTask = null;
        this.initialAdsLeft = 0;
        this.adsProcessed = false;
        this.userId = '';
    }

    log(msg, type = 'info') {
        const color = {
            info: blue,
            success: green,
            warn: yellow,
            error: red
        }[type];
        console.log(color(`[*] ${msg}`));
    }

    async waitForTaskCompletion() {
        if (this.currentTask) {
            await this.currentTask;
            this.currentTask = null;
        }
    }

    async fetchAds(userId) {
        const url = `https://api.adsgram.ai/adv?blockId=604&tg_id=${userId}&tg_platform=android&platform=Win32&language=vi`;
        try {
            const response = await axios.get(url, { headers: this.headers });
            const data = response.data;

            const renderUrl = data.banner.trackings.find(tracking => tracking.name === 'render').value;
            const showUrl = data.banner.trackings.find(tracking => tracking.name === 'show').value;
            const rewardUrl = data.banner.trackings.find(tracking => tracking.name === 'reward').value;

            await axios.get(renderUrl, { headers: this.headers });
            await axios.get(showUrl, { headers: this.headers });
            await axios.get(rewardUrl, { headers: this.headers });

            this.ws.send(JSON.stringify({ event_type: 'ad_reward', data: '' }));
            this.log('Are doing advertising.');

        } catch (error) {
            this.log('Error of advertising data!', 'error');
            console.error(error);
        }
    }

    sendGameIdMessage() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.log('Start playing the game ... do not close the tool before the game is completed!');
            const gameIdMessage = {
                event_type: 'game_id',
                data: 'std'
            };
            this.ws.send(JSON.stringify(gameIdMessage));
        }
    }

    sendPipeMessages(gameData) {
        let messageCount = 0;
        const totalMessages = Math.floor(Math.random() * 21) + 30;
        const sendPipeMessage = () => {
            if (messageCount < totalMessages) {
                const pipeMessage = {
                    event_type: 'pipe',
                    data: gameData
                };
                this.ws.send(JSON.stringify(pipeMessage));
                messageCount++;

                const randomInterval = Math.floor(Math.random() * 3000) + 1000;
                setTimeout(sendPipeMessage, randomInterval);
            } else {
                const gameEndMessage = {
                    event_type: 'game_end',
                    data: gameData
                };
                this.ws.send(JSON.stringify(gameEndMessage));
                this.log('Game over...', 'warn');
                this.remainingEnergy--;
            }
        };

        sendPipeMessage();
    }

    async buyBoost(boostId, boostValue) {
        if (this.balance > this.coinValues[boostValue]) {
            this.log(`Balance is larger ${this.coinValues[boostValue]}, Proceed to upgrade ...`);
            const boostBuyMessage = {
                event_type: 'boost_buy',
                data: boostId.toString()
            };
            this.ws.send(JSON.stringify(boostBuyMessage));
        } else {
            this.log('Balance is not enough to upgrade and transfer the next task!', 'warn');
            this.sendGameIdMessage();
        }
    }

    connectWebSocket(auth_key, payload, balance) {
        const wsURL = `wss://birdton.site/ws?auth=${encodeURIComponent(auth_key)}`;
        this.ws = new WebSocket(wsURL);
        this.balance = balance;

        this.ws.on('open', () => {
            this.log('Game data ...');

            const message = {
                event_type: 'auth',
                data: JSON.stringify(payload)
            };
            this.ws.send(JSON.stringify(message));
        });

        this.ws.on('message', async (message) => {
            try {
                const decodedMessage = message.toString('utf8');
                const parsedMessage = JSON.parse(decodedMessage);

                if (parsedMessage.event_type === 'boost') {
                    if (!this.adsProcessed && this.ads_left > 0) {
                        await this.handleAds(this.userId);
                        this.adsProcessed = true;
                    }
                    const boostData = JSON.parse(parsedMessage.data);
                    const coinValues = boostData.price_config.coin_value;
                    const boost = boostData.boosts[0];
                    const boostValue = boost.value;
                    const requiredCoinValue = coinValues[boostValue];

                    this.coinValues = coinValues;
                    this.currentBoost = boost;

                    this.log(`MULTIPLIER Lv: ${boostValue}, Next upgrade need: ${requiredCoinValue}`);

                    await this.buyBoost(boost.id, boostValue);
                }

                if (parsedMessage.event_type === 'buy_boost_result') {
                    const buyBoostResult = JSON.parse(parsedMessage.data);
                    if (buyBoostResult.result === 'success') {
                        this.balance -= buyBoostResult.price;
                        this.log(`Successful upgrade, balance: ${this.balance}`, 'success');
                        await this.buyBoost(this.currentBoost.id, this.currentBoost.value + 1);
                    } else {
                        this.log(`Upgrade failure: ${buyBoostResult.reason}`, 'warn');
                        this.sendGameIdMessage();
                    }
                }

                if (parsedMessage.event_type === 'game_id' && parsedMessage.data.includes(':')) {
                    const gameData = parsedMessage.data;
                    const gameStartMessage = {
                        event_type: 'game_start',
                        data: gameData
                    };
                    this.ws.send(JSON.stringify(gameStartMessage));
                    setTimeout(() => {
                        this.sendPipeMessages(gameData);
                    }, 2000);
                }

                if (parsedMessage.event_type === 'game_saved') {
                    const gameSavedData = JSON.parse(parsedMessage.data);
                    const score = gameSavedData.score;
                    const balance = gameSavedData.balance;
                    this.log(`Number of points received: ${score}, balance: ${balance}, energy: ${this.remainingEnergy}`);

                    if (this.remainingEnergy > 0) {
                        this.log(`Continue to play with the rest of the energy: ${this.remainingEnergy}`);
                        this.sendGameIdMessage();
                    } else {
                        this.log('Energy depleted. Stopping game.', 'warn');
                        this.ws.close();
                    }
                }
            } catch (error) {
                this.log('Message analysis error:', 'error');
                console.error(error);
            }
        });

        this.ws.on('close', () => {
            this.log('Disconnected!', 'warn');
        });

        this.ws.on('error', (error) => {
            this.log('An error occurred:', 'error');
            console.error(error);
        });
    }

    async auth(payload, userData) {
        try {
            const url = `${this.baseURL}/auth`;
            const response = await axios.post(url, payload, { headers: this.headers });
            const data = response.data;

            const { auth_key, balance, energy, ads_left } = data;

            this.authKey = auth_key;
            this.payload = payload;
            this.remainingEnergy = energy;
            this.balance = balance;
            this.initialAdsLeft = ads_left;
            this.ads_left = ads_left;
            this.adsProcessed = false; 
            this.log(`Balance: ${balance}`);
            this.log(`Energy: ${energy}`);
            this.log(`ADS Left: ${ads_left}`);
            this.userId = userData.id;
            if (energy > 0) {
                this.connectWebSocket(auth_key, payload, balance);
                this.currentTask = new Promise((resolve) => {
                    this.ws.on('close', () => {
                        resolve();
                    });
                });
                await this.currentTask;
            } else {
                this.log('Energy depleted. Stopping game.', 'warn');
            }

            return data;
        } catch (error) {
            this.log('Authentication error:', 'error');
            console.error(error);
        }
    }

    async handleAds(userId) {
        for (let i = 0; i < this.initialAdsLeft; i++) {
            await this.fetchAds(userId);
        }
    }

    countdown(t) {
        return new Promise(resolve => {
            const timer = setInterval(() => {
                const hours = String(Math.floor(t / 3600)).padStart(2, '0');
                const minutes = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
                const seconds = String(t % 60).padStart(2, '0');
                process.stdout.write(yellow(`\rNeed to wait ${hours}:${minutes}:${seconds} \r`));
                t--;
                if (t < 0) {
                    clearInterval(timer);
                    process.stdout.write('\r                          \r');
                    resolve();
                }
            }, 1000);
        });
    }

    async main() {
        const dataFile = path.join(__dirname, 'data.txt');
        const tokens = fs.readFileSync(dataFile, 'utf8')
            .replace(/\r/g, '')
            .split('\n')
            .filter(Boolean);

        while (true) {
            for (let [index, token] of tokens.entries()) {
                const tgData = token.split('&')[1].split('=')[1];
                const userData = JSON.parse(decodeURIComponent(tgData));
                const firstName = userData.first_name;
                this.log(`========== Account ${index + 1}/${tokens.length} | ${firstName} ==========`, 'info');

                const payload = {
                    initData: token,
                    initDataUnsafe: userData,
                    version: '7.4',
                    platform: 'android',
                    colorScheme: 'light',
                    themeParams: {
                        bg_color: '#ffffff',
                        button_color: '#3390ec',
                        button_text_color: '#ffffff',
                        hint_color: '#707579',
                        link_color: '#00488f',
                        secondary_bg_color: '#f4f4f5',
                        text_color: '#000000',
                        header_bg_color: '#ffffff',
                        accent_text_color: '#3390ec',
                        section_bg_color: '#ffffff',
                        section_header_text_color: '#3390ec',
                        subtitle_text_color: '#707579',
                        destructive_text_color: '#df3f40'
                    },
                    isExpanded: true,
                    viewportHeight: 639,
                    viewportStableHeight: 639,
                    isClosingConfirmationEnabled: true,
                    isVerticalSwipesEnabled: true,
                    headerColor: '#ffffff',
                    backgroundColor: '#ffffff',
                    BackButton: {
                        isVisible: false
                    },
                    MainButton: {
                        text: 'CONTINUE',
                        color: '#3390ec',
                        textColor: '#ffffff',
                        isVisible: false,
                        isProgressVisible: false,
                        isActive: true
                    },
                    SettingsButton: {
                        isVisible: false
                    },
                    HapticFeedback: {},
                    CloudStorage: {},
                    BiometricManager: {
                        isInited: false,
                        isBiometricAvailable: false,
                        biometricType: 'unknown',
                        isAccessRequested: false,
                        isAccessGranted: false,
                        isBiometricTokenSaved: false,
                        deviceId: ''
                    }
                };

                await this.auth(payload, userData);
                await this.waitForTaskCompletion(); 
            }
            this.log('Wait 1 hour before running all the accounts ...', 'info');
            await this.countdown(3600);
        }
    }
}

if (require.main === module) {
    const birdton = new Birdton();
    birdton.main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}