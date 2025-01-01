const fs = require('fs');
const path = require('path');
const axios = require('axios');
const colors = require('colors');
const readline = require('readline');
const { DateTime } = require('luxon');
const md5 = require('md5');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const printLogo = require('./src/logo');
const headers = require("./src/header");

class Bums {
    constructor() {
        this.baseUrl = 'https://api.bums.bot';
        this.headers = headers;
        this.SECRET_KEY = '7be2a16a82054ee58398c5edb7ac4a5a';
        this.loadProxies();
    }

    log(msg, type = 'info', accountIndex = null, proxyIP = null) {
        const timestamp = new Date().toLocaleTimeString();
        const accountPrefix = accountIndex !== null ? `[Account ${accountIndex + 1}]` : '';
        const ipPrefix = proxyIP ? `[${proxyIP}]` : '[Unknown IP]';
        const formattedType = type.toUpperCase();

        let logMessage = `${timestamp} | ${formattedType} | ${accountPrefix} | ${ipPrefix} | ${msg}`;

        switch (type) {
            case 'success':
                logMessage = logMessage.green;
                break;
            case 'error':
                logMessage = logMessage.red;
                break;
            case 'warning':
                logMessage = logMessage.yellow;
                break;
            default:
                logMessage = logMessage.blue;
        }

        console.log(logMessage);
    }

    loadProxies() {
        try {
            const proxyFile = path.join(__dirname, 'proxy.txt');
            if (fs.existsSync(proxyFile)) {
                this.proxies = fs.readFileSync(proxyFile, 'utf8')
                    .replace(/\r/g, '')
                    .split('\n')
                    .filter(Boolean);
            } else {
                this.proxies = [];
                this.log('Proxy file proxy.txt not found!', 'warning');
            }
        } catch (error) {
            this.proxies = [];
            this.log(`Error reading proxy file: ${error.message}`, 'error');
        }
    }

    async makeRequest(config, proxyUrl) {
        try {
            if (proxyUrl) {
                const proxyAgent = new HttpsProxyAgent(proxyUrl);
                config.httpsAgent = proxyAgent;
                config.proxy = false;
            }

            const response = await axios(config);
            return response;
        } catch (error) {
            throw error;
        }
    }

    async checkProxyIP(proxy) {
        try {
            const proxyAgent = new HttpsProxyAgent(proxy);
            const response = await axios.get('https://api.ipify.org?format=json', {
                httpsAgent: proxyAgent,
                proxy: false,
                timeout: 10000
            });

            if (response.status === 200) {
                return response.data.ip;
            } else {
                throw new Error(`Cannot check proxy IP. Status code: ${response.status}`);
            }
        } catch (error) {
            throw new Error(`Error checking proxy IP: ${error.message}`);
        }
    }

    async login(initData, invitationCode, proxyUrl) {
        const url = `${this.baseUrl}/miniapps/api/user/telegram_auth`;
        const formData = new FormData();
        formData.append('invitationCode', invitationCode);
        formData.append('initData', initData);

        try {
            const response = await this.makeRequest({
                method: 'POST',
                url,
                data: formData,
                headers: this.headers
            }, proxyUrl);

            if (response.status === 200 && response.data.code === 0) {
                return {
                    success: true,
                    token: response.data.data.token,
                    data: response.data.data
                };
            } else {
                return { success: false, error: response.data.msg };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async getGameInfo(token, proxyUrl, accountIndex = null) {
        const url = `${this.baseUrl}/miniapps/api/user_game_level/getGameInfo`;
        const headers = {
            ...this.headers,
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        };

        try {
            const response = await this.makeRequest({
                method: 'GET',
                url,
                headers
            }, proxyUrl);

            if (response.status === 200 && response.data.code === 0) {
                return {
                    success: true,
                    coin: response.data.data.gameInfo.coin,
                    energySurplus: response.data.data.gameInfo.energySurplus,
                    data: response.data.data
                };
            } else {
                return { success: false, error: response.data.msg };
            }
        } catch (error) {
            this.log(`Error fetching game info: ${error.message}`, 'error', accountIndex);
            return { success: false, error: error.message };
        }
    }

    generateHashCode(collectAmount, collectSeqNo) {
        const data = `${collectAmount}${collectSeqNo}${this.SECRET_KEY}`;
        return md5(data);
    }

    distributeEnergy(totalEnergy) {
        const parts = 10;
        let remaining = parseInt(totalEnergy);
        const distributions = [];

        for (let i = 0; i < parts; i++) {
            const isLast = i === parts - 1;
            if (isLast) {
                distributions.push(remaining);
            } else {
                const maxAmount = Math.min(300, Math.floor(remaining / 2));
                const amount = Math.floor(Math.random() * maxAmount) + 1;
                distributions.push(amount);
                remaining -= amount;
            }
        }

        return distributions;
    }

    async collectCoins(token, collectSeqNo, collectAmount, proxyUrl, accountIndex = null) {
        let proxyIP = proxyUrl ? (proxyUrl.split('@')[1] || 'Unknown Proxy') : 'No Proxy';
        try {
            if (proxyUrl) {
                try {
                    const checkedIP = await this.checkProxyIP(proxyUrl);
                    proxyIP = checkedIP;
                } catch (error) {
                    this.log(`Error checking proxy: ${error.message}`, 'warning', accountIndex, proxyIP);
                }
            }

            const url = `${this.baseUrl}/miniapps/api/user_game/collectCoin`;
            const headers = {
                ...this.headers,
                "Authorization": `Bearer ${token}`,
                "Content-Type": "multipart/form-data"
            };

            const hashCode = this.generateHashCode(collectAmount, collectSeqNo);
            const formData = new FormData();
            formData.append('hashCode', hashCode);
            formData.append('collectSeqNo', collectSeqNo.toString());
            formData.append('collectAmount', collectAmount.toString());

            const response = await this.makeRequest({
                method: 'POST',
                url,
                data: formData,
                headers
            }, proxyUrl);

            if (response.status === 200 && response.data.code === 0) {
                return {
                    success: true,
                    newCollectSeqNo: response.data.data.collectSeqNo,
                    data: response.data.data
                };
            } else {
                return { success: false, error: response.data.msg };
            }
        } catch (error) {
            this.log(`Error collecting coins: ${error.message}`, 'error', accountIndex, proxyIP);
            return { success: false, error: error.message };
        }
    }

    async getTaskLists(token, proxyUrl, accountIndex = null) {
        let proxyIP = proxyUrl ? (proxyUrl.split('@')[1] || 'Unknown Proxy') : 'No Proxy';
        try {
            if (proxyUrl) {
                try {
                    const checkedIP = await this.checkProxyIP(proxyUrl);
                    proxyIP = checkedIP;
                } catch (error) {
                    this.log(`Error checking proxy: ${error.message}`, 'warning', accountIndex, proxyIP);
                }
            }

            const url = `${this.baseUrl}/miniapps/api/task/lists`;
            const headers = {
                ...this.headers,
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            };

            const response = await this.makeRequest({
                method: 'GET',
                url,
                headers,
                params: {
                    _t: Date.now()
                }
            }, proxyUrl);

            if (response.status === 200 && response.data.code === 0) {
                return {
                    success: true,
                    tasks: response.data.data.lists.filter(task => task.isFinish === 0)
                };
            } else {
                return { success: false, error: response.data.msg };
            }
        } catch (error) {
            this.log(`Error fetching task lists: ${error.message}`, 'error', accountIndex, proxyIP);
            return { success: false, error: error.message };
        }
    }

    async getMineList(token, proxyUrl, accountIndex = null) {
        const url = `${this.baseUrl}/miniapps/api/mine/getMineLists`;
        const headers = {
            ...this.headers,
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        };

        try {
            const response = await this.makeRequest({
                method: 'POST',
                url,
                headers
            }, proxyUrl);

            if (response.status === 200 && response.data.code === 0) {
                return {
                    success: true,
                    mines: response.data.data.lists
                };
            } else {
                this.log(`Cannot fetch mine list: ${response.data.msg}`, 'error', accountIndex);
                return { success: false, error: response.data.msg };
            }
        } catch (error) {
            this.log(`Error fetching mine list: ${error.message}`, 'error', accountIndex);
            return { success: false, error: error.message };
        }
    }

    async processMineUpgrades(token, currentCoin, proxyUrl, accountIndex = null) {
        let proxyIP = proxyUrl ? (proxyUrl.split('@')[1] || 'Unknown Proxy') : 'No Proxy';
        if (proxyUrl) {
            try {
                proxyIP = await this.checkProxyIP(proxyUrl);
            } catch (error) {
                this.log(`Error checking proxy: ${error.message}`, 'warning', accountIndex, proxyIP);
            }
        }

        const config = require('./config.json');
        const mineList = await this.getMineList(token, proxyUrl, accountIndex);

        if (!mineList.success) {
            this.log(`Cannot fetch mine list: ${mineList.error}`, 'error', accountIndex, proxyIP);
            return;
        }

        let availableMines = mineList.mines
            .filter(mine =>
                mine.status === 1 &&
                parseInt(mine.nextLevelCost) <= Math.min(currentCoin, config.maxUpgradeCost)
            )
            .sort((a, b) => parseInt(b.nextPerHourReward) - parseInt(a.nextPerHourReward));

        if (availableMines.length === 0) {
            this.log('No mines available for upgrade!', 'warning', accountIndex, proxyIP);
            return;
        }

        let remainingCoin = currentCoin;
        for (const mine of availableMines) {
            const cost = parseInt(mine.nextLevelCost);
            if (cost > remainingCoin) continue;
            const result = await this.upgradeMine(token, mine.mineId, proxyUrl, accountIndex, proxyIP);

            if (result.success) {
                remainingCoin -= cost;
                this.log(`Upgraded mine ID ${mine.mineId} successfully | Remaining coin: ${remainingCoin}`, 'success', accountIndex, proxyIP);
            } else {
                this.log(`Cannot upgrade mine ID ${mine.mineId}: ${result.error}`, 'error', accountIndex, proxyIP);
            }

            await new Promise(resolve => setTimeout(resolve, 5 * 1000));
        }
    }

    async upgradeMine(token, mineId, proxyUrl, accountIndex = null, proxyIP = 'No Proxy') {
        const url = `${this.baseUrl}/miniapps/api/mine/upgrade`;
        const headers = {
            ...this.headers,
            "Authorization": `Bearer ${token}`,
            "Content-Type": "multipart/form-data"
        };

        const formData = new FormData();
        formData.append('mineId', mineId.toString());

        try {
            const response = await this.makeRequest({
                method: 'POST',
                url,
                data: formData,
                headers
            }, proxyUrl);

            if (response.status === 200 && response.data.code === 0) {
                return { success: true };
            } else {
                this.log(`Cannot upgrade mine: ${response.data.msg}`, 'error', accountIndex, proxyIP);
                return { success: false, error: response.data.msg };
            }
        } catch (error) {
            this.log(`Error upgrading mine: ${error.message}`, 'error', accountIndex, proxyIP);
            return { success: false, error: error.message };
        }
    }

    async finishTask(token, taskId, taskInfo, proxyUrl, accountIndex = null) {
        const url = `${this.baseUrl}/miniapps/api/task/finish_task`;
        const headers = {
            ...this.headers,
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/x-www-form-urlencoded"
        };

        const getEpisodeNumber = (name) => {
            const match = name.match(/Episode (\d+)/);
            return match ? parseInt(match[1]) : null;
        };

        const episodeCodes = {
            0: '42858', 1: '95065', 2: '88125', 3: '51264', 4: '13527',
            5: '33270', 6: '57492', 7: '63990', 8: '19988', 9: '26483',
            10: '36624', 11: '30436', 12: '71500', 13: '48516', 14: '92317',
            15: '68948', 16: '98109', 17: '35264', 18: '86100', 19: '86100',
            20: '83273', 21: '74737', 22: '18948', 23: '16086', 24: '13458',
            25: '13458', 26: '91467', 27: '71728', 28: '97028', 29: '97028',
            30: '89349', 31: '31114', 32: '31114', 33: '37422', 34: '52860',
            35: '10300', 36: '35583', 37: '35194', 38: '26488', 39: '85133',
            40: '13116', 41: '28932', 42: '50662', 43: '83921', 44: '35176',
            45: '24345', 46: '95662', 47: '43700', 48: '36632', 49: '74507',
            50: '74507', 51: '46056', 52: '48627', 53: '39617'
        };

        const params = new URLSearchParams();
        params.append('id', taskId.toString());

        let proxyIP = proxyUrl ? (proxyUrl.split('@')[1] || 'Unknown Proxy') : 'No Proxy';
        try {
            if (proxyUrl) {
                try {
                    const checkedIP = await this.checkProxyIP(proxyUrl);
                    proxyIP = checkedIP;
                } catch (error) {
                    this.log(`Error checking proxy: ${error.message}`, 'warning', accountIndex, proxyIP);
                }
            }

            if (taskInfo &&
                taskInfo.classifyName === 'YouTube' &&
                taskInfo.name.includes('Find hidden code')) {

                const episodeNum = getEpisodeNumber(taskInfo.name);
                if (episodeNum !== null && episodeCodes[episodeNum]) {
                    params.append('pwd', episodeCodes[episodeNum]);
                    this.log(`Sending code for Episode ${episodeNum}: ${episodeCodes[episodeNum]}`, 'info', accountIndex, proxyIP);
                }
            }
            params.append('_t', Date.now().toString());

            const response = await this.makeRequest({
                method: 'POST',
                url,
                data: params,
                headers
            }, proxyUrl);

            if (response.status === 200 && response.data.code === 0) {
                return { success: true };
            } else {
                return { success: false, error: response.data.msg };
            }
        } catch (error) {
            this.log(`Error completing task: ${error.message}`, 'error', accountIndex, proxyIP);
            return { success: false, error: error.message };
        }
    }

    async processTasks(token, proxyUrl, accountIndex = null) {
        let proxyIP = proxyUrl ? (proxyUrl.split('@')[1] || 'Unknown Proxy') : 'No Proxy';
        try {
            if (proxyUrl) {
                try {
                    const checkedIP = await this.checkProxyIP(proxyUrl);
                    proxyIP = checkedIP;
                } catch (error) {
                    this.log(`Error checking proxy: ${error.message}`, 'warning', accountIndex, proxyIP);
                }
            }

            const taskList = await this.getTaskLists(token, proxyUrl, accountIndex);

            if (!taskList.success) {
                this.log(`Cannot fetch task list: ${taskList.error}`, 'error', accountIndex, proxyIP);
                return;
            }

            if (taskList.tasks.length === 0) {
                this.log('No new tasks available!', 'warning', accountIndex, proxyIP);
                return;
            }

            for (const task of taskList.tasks) {
                const result = await this.finishTask(token, task.id, task, proxyUrl, accountIndex);

                if (result.success) {
                    this.log(`Task ${task.name} completed successfully | Reward: ${task.rewardParty}`, 'success', accountIndex, proxyIP);
                }

                await new Promise(resolve => setTimeout(resolve, 5 * 1000));
            }
        } catch (error) {
            this.log(`Error processing tasks: ${error.message}`, 'error', accountIndex, proxyIP);
        }
    }

    async processEnergyCollection(token, energy, initialCollectSeqNo, proxyUrl, accountIndex = null) {
        let proxyIP = 'No Proxy';
        if (proxyUrl) {
            try {
                proxyIP = await this.checkProxyIP(proxyUrl);
            } catch (error) {
                this.log(`Error checking proxy: ${error.message}`, 'warning', accountIndex, proxyIP);
            }
        }

        const energyDistributions = this.distributeEnergy(energy);
        let currentCollectSeqNo = initialCollectSeqNo;
        let totalCollected = 0;

        for (let i = 0; i < energyDistributions.length; i++) {
            const amount = energyDistributions[i];
            this.log(`Collection attempt ${i + 1}/10: ${amount} energy`, 'custom', accountIndex, proxyIP);

            const result = await this.collectCoins(token, currentCollectSeqNo, amount, proxyUrl, accountIndex);

            if (result.success) {
                totalCollected += amount;
                currentCollectSeqNo = result.newCollectSeqNo;
                this.log(`Success! Collected: ${totalCollected}/${energy}`, 'success', accountIndex, proxyIP);
            } else {
                this.log(`Error during collection: ${result.error}`, 'error', accountIndex, proxyIP);
                break;
            }

            if (i < energyDistributions.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 5 * 1000));
            }
        }

        return totalCollected;
    }



    askQuestion(query) {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        return new Promise(resolve => rl.question(query, ans => {
            rl.close();
            resolve(ans);
        }))
    }

    async getSignLists(token, proxyUrl, accountIndex = null) {
        let proxyIP = proxyUrl ? (proxyUrl.split('@')[1] || 'Unknown Proxy') : 'No Proxy';
        try {
            if (proxyUrl) {
                try {
                    const checkedIP = await this.checkProxyIP(proxyUrl);
                    proxyIP = checkedIP;
                } catch (error) {
                    this.log(`Error checking proxy: ${error.message}`, 'warning', accountIndex, proxyIP);
                }
            }

            const url = `${this.baseUrl}/miniapps/api/sign/getSignLists`;
            const headers = {
                ...this.headers,
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            };

            const response = await this.makeRequest({
                method: 'GET',
                url,
                headers
            }, proxyUrl);

            if (response.status === 200 && response.data.code === 0) {
                return {
                    success: true,
                    lists: response.data.data.lists
                };
            } else {
                return { success: false, error: response.data.msg };
            }
        } catch (error) {
            this.log(`Error fetching sign-in list: ${error.message}`, 'error', accountIndex, proxyIP);
            return { success: false, error: error.message };
        }
    }

    async sign(token, proxyUrl, accountIndex = null) {
        let proxyIP = proxyUrl ? (proxyUrl.split('@')[1] || 'Unknown Proxy') : 'No Proxy';
        try {
            if (proxyUrl) {
                try {
                    const checkedIP = await this.checkProxyIP(proxyUrl);
                    proxyIP = checkedIP;
                } catch (error) {
                    this.log(`Error checking proxy: ${error.message}`, 'warning', accountIndex, proxyIP);
                }
            }

            const url = `${this.baseUrl}/miniapps/api/sign/sign`;
            const headers = {
                ...this.headers,
                "Authorization": `Bearer ${token}`,
                "Content-Type": "multipart/form-data"
            };

            const formData = new FormData();

            const response = await this.makeRequest({
                method: 'POST',
                url,
                data: formData,
                headers
            }, proxyUrl);

            if (response.status === 200 && response.data.code === 0) {
                return { success: true };
            } else {
                return { success: false, error: response.data.msg };
            }
        } catch (error) {
            this.log(`Error signing in: ${error.message}`, 'error', accountIndex, proxyIP);
            return { success: false, error: error.message };
        }
    }


    async processSignIn(token, proxyUrl, accountIndex = null) {
        const proxyIP = proxyUrl ? (proxyUrl.split('@')[1] || 'Unknown Proxy') : 'No Proxy';

        this.log('Checking sign-in status...', 'info', accountIndex, proxyIP);
        const signList = await this.getSignLists(token, proxyUrl, accountIndex);

        if (!signList.success) {
            this.log(`Cannot fetch sign-in information: ${signList.error}`, 'error', accountIndex, proxyIP);
            return;
        }

        const availableDay = signList.lists.find(day => day.status === 0);
        if (!availableDay) {
            this.log('No days available for sign-in!', 'warning', accountIndex, proxyIP);
            return;
        }

        this.log(`Signing in for day ${availableDay.days}...`, 'info', accountIndex, proxyIP);
        const result = await this.sign(token, proxyUrl, accountIndex);

        if (result.success) {
            this.log(`Sign-in for day ${availableDay.days} successful | Reward: ${availableDay.normal}`, 'success', accountIndex, proxyIP);
        } else {
            this.log(`Sign-in failed: ${result.error}`, 'error', accountIndex, proxyIP);
        }

        await new Promise(resolve => setTimeout(resolve, 5 * 1000));
    }

    async getGangLists(token, proxyUrl) {
        const url = `${this.baseUrl}/miniapps/api/gang/gang_lists`;
        const headers = {
            ...this.headers,
            "Authorization": `Bearer ${token}`,
            "Content-Type": "multipart/form-data"
        };

        const formData = new FormData();
        formData.append('boostNum', '15');
        formData.append('powerNum', '35');

        try {
            const response = await this.makeRequest({
                method: 'POST',
                url,
                data: formData,
                headers
            }, proxyUrl);

            if (response.status === 200 && response.data.code === 0) {
                return {
                    success: true,
                    myGang: response.data.data.myGang,
                    gangLists: response.data.data.lists
                };
            } else {
                return { success: false, error: response.data.msg };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async joinGang(token, gangName = 'cryptohomea', proxyUrl, accountIndex = null) {
        let proxyIP = proxyUrl ? (proxyUrl.split('@')[1] || 'Unknown Proxy') : 'No Proxy';
        try {
            if (proxyUrl) {
                try {
                    const checkedIP = await this.checkProxyIP(proxyUrl);
                    proxyIP = checkedIP;
                } catch (error) {
                    this.log(`Error checking proxy: ${error.message}`, 'warning', accountIndex, proxyIP);
                }
            }

            const url = `${this.baseUrl}/miniapps/api/gang/gang_join`;
            const headers = {
                ...this.headers,
                "Authorization": `Bearer ${token}`,
                "Content-Type": "multipart/form-data"
            };

            const formData = new FormData();
            formData.append('name', gangName);

            const response = await this.makeRequest({
                method: 'POST',
                url,
                data: formData,
                headers
            }, proxyUrl);

            if (response.status === 200 && response.data.code === 0) {
                return { success: true };
            } else {
                return { success: false, error: response.data.msg };
            }
        } catch (error) {
            this.log(`Error joining gang: ${error.message}`, 'error', accountIndex, proxyIP);
            return { success: false, error: error.message };
        }
    }

    async processGangJoin(token, proxyUrl, accountIndex = null) {
        const proxyIP = proxyUrl ? (proxyUrl.split('@')[1] || 'Unknown Proxy') : 'No Proxy';

        this.log('Checking gang information...', 'info', accountIndex, proxyIP);
        const gangList = await this.getGangLists(token, proxyUrl, accountIndex);

        if (!gangList.success) {
            this.log(`Cannot fetch gang information: ${gangList.error}`, 'error', accountIndex, proxyIP);
            return;
        }

        if (!gangList.myGang.gangId) {
            this.log('You have not joined any gang, trying to join Gang...', 'info', accountIndex, proxyIP);
            const result = await this.joinGang(token, 'dancayairdrop', proxyUrl, accountIndex);

            if (result.success) {
                this.log('Successfully joined Gang', 'success', accountIndex, proxyIP);
            } else {
                this.log(`Failed to join gang: ${result.error}`, 'error', accountIndex, proxyIP);
            }
        } else {
            this.log(`You are already a member of gang ${gangList.myGang.name}`, 'custom', accountIndex, proxyIP);
        }

        await new Promise(resolve => setTimeout(resolve, 5 * 1000));
    }

    async processAccount(initData, accountIndex, proxyUrl = null) {
        let proxyIP = proxyUrl ? (proxyUrl.split('@')[1] || 'Unknown Proxy') : 'No Proxy';
        try {
            if (proxyUrl) {
                try {
                    const checkedIP = await this.checkProxyIP(proxyUrl);
                    proxyIP = checkedIP;
                } catch (error) {
                    this.log(`Error checking proxy: ${error.message}`, 'warning', accountIndex, proxyIP);
                }
            }

            const userData = JSON.parse(decodeURIComponent(initData.split('user=')[1].split('&')[0]));
            const firstName = userData.first_name;

            this.log(`Starting account processing`, 'info', accountIndex, proxyIP);

            const loginResult = await this.login(initData, 'FXVePI68', proxyUrl);

            if (!loginResult.success) {
                this.log(`Login failed: ${loginResult.error}`, 'error', accountIndex, proxyIP);
                return { success: false, error: loginResult.error };
            }

            this.log('Login successful!', 'success', accountIndex, proxyIP);
            const token = loginResult.token;

            await this.processSignIn(token, proxyUrl, accountIndex);
            await this.processGangJoin(token, proxyUrl, accountIndex);

            const gameInfo = await this.getGameInfo(token, proxyUrl);
            if (gameInfo.success) {
                this.log(`Coin: ${gameInfo.coin} | Energy: ${gameInfo.energySurplus}`, 'custom', accountIndex, proxyIP);

                if (parseInt(gameInfo.energySurplus) > 0) {
                    const collectSeqNo = gameInfo.data.tapInfo.collectInfo.collectSeqNo;
                    await this.processEnergyCollection(token, gameInfo.energySurplus, collectSeqNo, proxyUrl, accountIndex);
                } else {
                    this.log(`Not enough energy to collect`, 'warning', accountIndex, proxyIP);
                }
            } else {
                this.log(`Cannot fetch game information: ${gameInfo.error}`, 'error', accountIndex, proxyIP);
                return { success: false, error: gameInfo.error };
            }

            if (this.hoinhiemvu) {
                await this.processTasks(token, proxyUrl);
            }

            if (this.hoinangcap) {
                await this.processMineUpgrades(token, parseInt(gameInfo.coin), proxyUrl);
            }

            this.log('Account processing complete', 'success', accountIndex, proxyIP);
            return { success: true };
        } catch (error) {
            this.log(`Error processing account: ${error.message}`, 'error', accountIndex, proxyIP);
            return { success: false, error: error.message };
        }
    }

    async main() {
        const dataFile = path.join(__dirname, 'data.txt');
        if (!fs.existsSync(dataFile)) {
            this.log('data.txt file not found!', 'error');
            return;
        }

        const data = fs.readFileSync(dataFile, 'utf8')
            .replace(/\r/g, '')
            .split('\n')
            .filter(Boolean);

        if (data.length === 0) {
            this.log('data.txt file is empty!', 'error');
            return;
        }

        printLogo();

        this.hoinhiemvu = (await this.askQuestion('Do you want to complete tasks? (y/n): ')).toLowerCase() === 'y';
        this.hoinangcap = (await this.askQuestion('Do you want to upgrade cards? (y/n): ')).toLowerCase() === 'y';

        while (true) {
            const promises = [];
            for (let i = 0; i < data.length; i += this.maxThreads) {
                const batch = data.slice(i, i + this.maxThreads);
                const batchPromises = batch.map((initData, index) => {
                    const proxyUrl = this.proxies[i + index] || null;
                    return Promise.race([
                        this.processAccount(initData, i + index, proxyUrl),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('Timeout')), 10 * 60 * 1000)
                        )
                    ]);
                });

                promises.push(...batchPromises);
                await Promise.allSettled(batchPromises);

                console.log('Waiting 3 seconds');
                await new Promise(resolve => setTimeout(resolve, 3 * 1000));
            }

            console.log('Waiting 300 seconds');
            await new Promise(resolve => setTimeout(resolve, 300 * 1000));
        }
    }
}

const client = new Bums();
client.maxThreads = 10;
client.main().catch(err => {
    client.log(err.message, 'error');
    process.exit(1);
});
