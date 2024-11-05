const fs = require('fs');
const path = require('path');
const axios = require('axios');
const colors = require('colors');
const readline = require('readline');
const { DateTime } = require('luxon');
const md5 = require('md5');
const { HttpsProxyAgent } = require('https-proxy-agent');
const printLogo = require('./src/logo');

class Bums {
    constructor() {
        this.baseUrl = 'https://api.bums.bot';
        this.headers = {
            "Accept": "application/json, text/plain, */*",
            "Accept-Encoding": "gzip, deflate, br",
            "Accept-Language": "en",
            "Content-Type": "multipart/form-data",
            "Origin": "https://app.bums.bot",
            "Referer": "https://app.bums.bot/",
            "Sec-Ch-Ua": '"Not/A)Brand";v="99", "Google Chrome";v="115", "Chromium";v="115"',
            "Sec-Ch-Ua-Mobile": "?1",
            "Sec-Ch-Ua-Platform": '"Android"',
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors", 
            "Sec-Fetch-Site": "same-site",
            "User-Agent": "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Mobile Safari/537.36"
        };        
        this.SECRET_KEY = '7be2a16a82054ee58398c5edb7ac4a5a';
        this.loadProxies();
    }

    log(msg, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        switch(type) {
            case 'success':
                console.log(`[${timestamp}] [*] ${msg}`.green);
                break;
            case 'custom':
                console.log(`[${timestamp}] [*] ${msg}`.magenta);
                break;        
            case 'error':
                console.log(`[${timestamp}] [*] ${msg}`.red);
                break;
            case 'warning':
                console.log(`[${timestamp}] [*] ${msg}`.yellow);
                break;
            default:
                console.log(`[${timestamp}] [*] ${msg}`.blue);
        }
    }

    async countdown(seconds) {
        for (let i = seconds; i > 0; i--) {
            const timestamp = new Date().toLocaleTimeString();
            readline.cursorTo(process.stdout, 0);
            process.stdout.write(`[${timestamp}] [*] Waiting ${i} seconds to continue...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        readline.cursorTo(process.stdout, 0);
        readline.clearLine(process.stdout, 0);
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
                this.log('File proxy.txt not found!', 'warning');
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

    async getGameInfo(token, proxyUrl) {
        const url = `${this.baseUrl}/miniapps/api/user_game_level/getGameInfo`;
        const headers = { ...this.headers, "Authorization": `Bearer ${token}` };
        
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
    
    async collectCoins(token, collectSeqNo, collectAmount, proxyUrl) {
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
                    newCollectSeqNo: response.data.data.collectSeqNo,
                    data: response.data.data
                };
            } else {
                return { success: false, error: response.data.msg };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async getTaskLists(token, proxyUrl) {
        const url = `${this.baseUrl}/miniapps/api/task/lists`;
        const headers = { 
            ...this.headers, 
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json" 
        };
        
        try {
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
            return { success: false, error: error.message };
        }
    }

    async finishTask(token, taskId, proxyUrl) {
        const url = `${this.baseUrl}/miniapps/api/task/finish_task`;
        const headers = { 
            ...this.headers, 
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/x-www-form-urlencoded" 
        };
        
        const params = new URLSearchParams();
        params.append('id', taskId.toString());
        params.append('_t', Date.now().toString());

        try {
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
            return { success: false, error: error.message };
        }
    }

    async getMineList(token, proxyUrl) {
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
                return { success: false, error: response.data.msg };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async upgradeMine(token, mineId, proxyUrl) {
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
                return { success: false, error: response.data.msg };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async processTasks(token, proxyUrl) {
        this.log('Fetching task list...', 'info');
        const taskList = await this.getTaskLists(token, proxyUrl);
        
        if (!taskList.success) {
            this.log(`Cannot get task list: ${taskList.error}`, 'error');
            return;
        }

        if (taskList.tasks.length === 0) {
            this.log('No new tasks!', 'warning');
            return;
        }

        for (const task of taskList.tasks) {
            this.log(`Performing task: ${task.name}`, 'info');
            const result = await this.finishTask(token, task.id, proxyUrl);
            
            if (result.success) {
                this.log(`Successfully completed task ${task.name} | Reward: ${task.rewardParty}`, 'success');
            } else {
                this.log(`Cannot complete task ${task.name}: not enough conditions or needs to be done manually`, 'error');
            }

            await this.countdown(5);
        }
    }

    async processEnergyCollection(token, energy, initialCollectSeqNo, proxyUrl) {
        const energyDistributions = this.distributeEnergy(energy);
        let currentCollectSeqNo = initialCollectSeqNo;
        let totalCollected = 0;

        for (let i = 0; i < energyDistributions.length; i++) {
            const amount = energyDistributions[i];
            this.log(`Collecting energy, round ${i + 1}/10: ${amount} energy`, 'custom');
            
            const result = await this.collectCoins(token, currentCollectSeqNo, amount, proxyUrl);
            
            if (result.success) {
                totalCollected += amount;
                currentCollectSeqNo = result.newCollectSeqNo;
                this.log(`Successfully collected: ${totalCollected}/${energy}`, 'success');
            } else {
                this.log(`Error collecting energy: ${result.error}`, 'error');
                break;
            }

            if (i < energyDistributions.length - 1) {
                await this.countdown(5);
            }
        }

        return totalCollected;
    }

    async processMineUpgrades(token, currentCoin, proxyUrl) {
        this.log('Fetching card list...', 'info');
        const config = require('./config.json');
        const mineList = await this.getMineList(token, proxyUrl);
        
        if (!mineList.success) {
            this.log(`Cannot get card list: ${mineList.error}`, 'error');
            return;
        }

        let availableMines = mineList.mines
            .filter(mine => 
                mine.status === 1 && 
                parseInt(mine.nextLevelCost) <= Math.min(currentCoin, config.maxUpgradeCost)
            )
            .sort((a, b) => parseInt(b.nextPerHourReward) - parseInt(a.nextPerHourReward));

        if (availableMines.length === 0) {
            this.log('No cards available for upgrade!', 'warning');
            return;
        }

        let remainingCoin = currentCoin;
        for (const mine of availableMines) {
            const cost = parseInt(mine.nextLevelCost);
            if (cost > remainingCoin) continue;

            this.log(`Upgrading card ID ${mine.mineId} | Cost: ${cost} | Reward/h: ${mine.nextPerHourReward}`, 'info');
            const result = await this.upgradeMine(token, mine.mineId, proxyUrl);
            
            if (result.success) {
                remainingCoin -= cost;
                this.log(`Successfully upgraded card ID ${mine.mineId} | Remaining coin: ${remainingCoin}`, 'success');
            } else {
                this.log(`Cannot upgrade card ID ${mine.mineId}: ${result.error}`, 'error');
            }

            await this.countdown(5);
        }
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

    async getSignLists(token, proxyUrl) {
        const url = `${this.baseUrl}/miniapps/api/sign/getSignLists`;
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
                    lists: response.data.data.lists 
                };
            } else {
                return { success: false, error: response.data.msg };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async sign(token, proxyUrl) {
        const url = `${this.baseUrl}/miniapps/api/sign/sign`;
        const headers = { 
            ...this.headers, 
            "Authorization": `Bearer ${token}`,
            "Content-Type": "multipart/form-data" 
        };
        
        const formData = new FormData();

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
                return { success: false, error: response.data.msg };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async processSignIn(token, proxyUrl) {
        this.log('Checking attendance...', 'info');
        const signList = await this.getSignLists(token, proxyUrl);
        
        if (!signList.success) {
            this.log(`Cannot get attendance info: ${signList.error}`, 'error');
            return;
        }

        const availableDay = signList.lists.find(day => day.status === 0);
        if (!availableDay) {
            this.log('No days available for attendance!', 'warning');
            return;
        }

        this.log(`Checking attendance for day ${availableDay.days}...`, 'info');
        const result = await this.sign(token, proxyUrl);
        
        if (result.success) {
            this.log(`Attendance for day ${availableDay.days} successful | Reward: ${availableDay.normal}`, 'success');
        } else {
            this.log(`Attendance failed: ${result.error}`, 'error');
        }

        await this.countdown(5);
    }

    async main() {
        const dataFile = path.join(__dirname, 'data.txt');
        if (!fs.existsSync(dataFile)) {
            this.log('File data.txt not found!', 'error');
            return;
        }

        const data = fs.readFileSync(dataFile, 'utf8')
            .replace(/\r/g, '')
            .split('\n')
            .filter(Boolean);

        if (data.length === 0) {
            this.log('File data.txt is empty!', 'error');
            return;
        }

        printLogo();
        
        const nhiemvu = await this.askQuestion('Do you want to do tasks? (y/n): ');
        const hoinhiemvu = nhiemvu.toLowerCase() === 'y';

        const nangcap = await this.askQuestion('Do you want to upgrade cards? (y/n): ');
        const hoinangcap = nangcap.toLowerCase() === 'y';

        while (true) {
            for (let i = 0; i < data.length; i++) {
                const initData = data[i];
                const currentProxy = this.proxies[i] || null;
                let proxyIP = 'No proxy';

                try {
                    if (currentProxy) {
                        try {
                            proxyIP = await this.checkProxyIP(currentProxy);
                        } catch (error) {
                            this.log(`Error checking proxy: ${error.message}`, 'warning');
                            proxyIP = 'Error checking IP';
                        }
                    }

                    const userData = JSON.parse(decodeURIComponent(initData.split('user=')[1].split('&')[0]));
                    const userId = userData.id;
                    const firstName = userData.first_name;

                    console.log(`\n========== Account ${i + 1}/${data.length} | ${firstName.green} | ip: ${proxyIP} ==========`);
                    
                    this.log('Logging in...', 'info');
                    const loginResult = await this.login(initData, 'SkDATcHN', currentProxy);
                    
                    if (!loginResult.success) {
                        this.log(`Login failed: ${loginResult.error}`, 'error');
                        continue;
                    }

                    this.log('Login successful!', 'success');
                    const token = loginResult.token;
                    await this.processSignIn(token, currentProxy);
                    const gameInfo = await this.getGameInfo(token, currentProxy);
                    if (gameInfo.success) {
                        this.log(`Coin: ${gameInfo.coin}`, 'custom');
                        this.log(`Energy: ${gameInfo.energySurplus}`, 'custom');
                        
                        if (parseInt(gameInfo.energySurplus) > 0) {
                            this.log('Starting to collect energy...', 'info');
                            const collectSeqNo = gameInfo.data.tapInfo.collectInfo.collectSeqNo;
                            await this.processEnergyCollection(token, gameInfo.energySurplus, collectSeqNo, currentProxy);
                        } else {
                            this.log('Not enough energy to collect', 'warning');
                        }
                    } else {
                        this.log(`Cannot get game info: ${gameInfo.error}`, 'error');
                    }

                    if (hoinhiemvu) {
                        await this.processTasks(token, currentProxy);
                    }

                    if (hoinangcap) {
                        await this.processMineUpgrades(token, parseInt(gameInfo.coin), currentProxy);
                    }

                    if (i < data.length - 1) {
                        await this.countdown(5);
                    }
                } catch (error) {
                    this.log(`Error processing account: ${error.message}`, 'error');
                    continue;
                }
            }
            await this.countdown(60 * 60);
        }
    }
}

const client = new Bums();
client.main().catch(err => {
    client.log(err.message, 'error');
    process.exit(1);
});