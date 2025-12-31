const fs = require('fs');
const path = require('path');
const https = require('https');

class MainGeoJsonCrawler {
    constructor() {
        this.baseUrl = 'https://geo.datav.aliyun.com/areas_v3/bound';
        this.dataDir = './data';
        this.successCount = 0;
        this.errorCount = 0;
        this.totalCount = 0;
        this.errorLog = [];
        this.retryAttempts = 3;
        this.requestDelay = 1000;
        
        // 直辖市列表（只需要市级数据）
        this.municipalities = ['北京市', '天津市', '上海市', '重庆市'];
        this.stats = {
            provinces: { total: 0, success: 0, failed: 0 },
            cities: { total: 0, success: 0, failed: 0 }
        };
    }

    async init() {
        console.log('🚀 初始化主爬虫...');
        console.log(`📁 数据存储目录: ${this.dataDir}`);
        console.log(`🔗 API地址: ${this.baseUrl}\n`);
        
        // 创建数据目录
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
        
        // 读取城市数据
        const cityData = JSON.parse(fs.readFileSync('./ChinaCitys.json', 'utf8'));
        this.totalCount = cityData.length;
        
        console.log(`📊 找到 ${this.totalCount} 个省级行政区`);
        return cityData;
    }

    // 修正编码：从12位转换为6位（移除末尾的6个0）
    fixCityCode(cityCode) {
        return cityCode.replace(/000000$/, '');
    }

    async fetchData(url, description = '') {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('请求超时'));
            }, 30000);

            const options = {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                    'Referer': 'https://geo.datav.aliyun.com/',
                    'Accept': 'application/json, text/plain, */*'
                }
            };

            https.get(url, options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    clearTimeout(timeout);
                    
                    if (res.statusCode === 301 || res.statusCode === 302) {
                        const redirectUrl = res.headers.location;
                        if (redirectUrl) {
                            console.log(`  ↪️ 重定向到: ${redirectUrl}`);
                            return this.fetchData(redirectUrl, description).then(resolve).catch(reject);
                        }
                    }
                    
                    if (res.statusCode === 200) {
                        try {
                            const jsonData = JSON.parse(data);
                            resolve(jsonData);
                        } catch (error) {
                            reject(new Error(`解析 JSON 失败: ${error.message}`));
                        }
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                    }
                });
            }).on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    async fetchDataWithRetry(url, description = '') {
        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            try {
                console.log(`  🔄 尝试 ${attempt}/${this.retryAttempts}: ${description}`);
                return await this.fetchData(url, description);
            } catch (error) {
                console.error(`  ❌ 尝试 ${attempt} 失败: ${error.message}`);
                
                if (attempt === this.retryAttempts) {
                    throw error;
                }
                
                await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
            }
        }
    }

    saveToFile(filePath, data) {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    }

    async processProvince(province) {
        const provinceCode = province.code;
        const provinceName = province.province;
        const isMunicipality = this.municipalities.includes(provinceName);
        
        console.log(`\n🏛️ [省级] ${provinceName} (${provinceCode})${isMunicipality ? ' [直辖市]' : ''}`);
        console.log(`   📊 包含 ${province.citys.length} 个市级行政区`);
        
        // 对于直辖市，只获取市级数据，不需要省级数据
        if (isMunicipality) {
            console.log(`   🎯 直辖市优化：直接获取市级数据，跳过省级数据`);
            this.stats.provinces.total++;
            // 市级数据获取将在下面进行
        } else {
            // 普通省份：获取省级数据
            try {
                const provinceUrl = `${this.baseUrl}/${provinceCode}_full.json`;
                const provinceData = await this.fetchDataWithRetry(provinceUrl, `${provinceName}省级数据`);
                
                // 保存省级数据到 data/{provinceCode}/geo.json
                const provinceFilePath = path.join(this.dataDir, provinceCode, 'geo.json');
                this.saveToFile(provinceFilePath, provinceData);
                
                console.log(`   ✅ 省级数据保存成功: ${provinceFilePath}`);
                this.successCount++;
                this.stats.provinces.success++;
                
            } catch (error) {
                console.error(`   ❌ 省级数据获取失败: ${error.message}`);
                this.errorCount++;
                this.stats.provinces.failed++;
                
                this.errorLog.push({
                    type: 'province',
                    name: provinceName,
                    code: provinceCode,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        }
        
        // 处理市级数据（所有省份都需要）
        await this.processCities(province);
    }

    async processCities(province) {
        const provinceCode = province.code;
        const provinceName = province.province;
        
        console.log(`\n🏢 开始处理 ${provinceName} 的 ${province.citys.length} 个市级数据...`);
        
        for (let i = 0; i < province.citys.length; i++) {
            const city = province.citys[i];
            await this.processCity(province, city, i, province.citys.length);
            
            // 延迟避免请求过于频繁
            if (i < province.citys.length - 1) {
                await new Promise(resolve => setTimeout(resolve, this.requestDelay));
            }
        }
    }

    async processCity(province, city, index, total) {
        const provinceCode = province.code;
        const provinceName = province.province;
        const isMunicipality = this.municipalities.includes(provinceName);
        const cityCode12 = city.code;
        const cityCode6 = this.fixCityCode(cityCode12);
        const cityName = city.city;
        
        // 直辖市：市级代码使用省级代码（因为直辖市本身就是市级）
        const finalCityCode = isMunicipality ? provinceCode : cityCode6;
        
        console.log(`\n  🏙️ [市级 ${index + 1}/${total}] ${cityName} (${cityCode12} → ${finalCityCode})${isMunicipality ? ' [直辖市]' : ''}`);
        
        try {
            let cityData;
            let cityFilePath;
            
            if (isMunicipality) {
                // 直辖市：使用省级数据作为市级数据，直接存储在省级目录
                console.log(`     🎯 直辖市优化：直接存储在省级目录`);
                
                try {
                    const provinceUrl = `${this.baseUrl}/${provinceCode}_full.json`;
                    cityData = await this.fetchDataWithRetry(provinceUrl, `${cityName}市级数据(直辖市)`);
                    
                    // 直辖市数据直接存储在省级目录：data/{provinceCode}/geo.json
                    cityFilePath = path.join(this.dataDir, provinceCode, 'geo.json');
                    this.saveToFile(cityFilePath, cityData);
                    
                    console.log(`     ✅ 直辖市数据保存成功: ${cityFilePath}`);
                    this.successCount++;
                    this.stats.cities.success++;
                    this.stats.cities.total++;
                    
                } catch (error) {
                    // 如果省级数据获取失败，尝试直接获取市级数据
                    console.log(`     ⚠️ 省级数据获取失败，尝试直接获取市级数据`);
                    const cityUrl = `${this.baseUrl}/${finalCityCode}_full.json`;
                    cityData = await this.fetchDataWithRetry(cityUrl, `${cityName}市级数据`);
                    cityFilePath = path.join(this.dataDir, provinceCode, 'geo.json');
                    this.saveToFile(cityFilePath, cityData);
                    
                    console.log(`     ✅ 市级数据保存成功: ${cityFilePath}`);
                    this.successCount++;
                    this.stats.cities.success++;
                    this.stats.cities.total++;
                }
                
            } else {
                // 普通城市：直接获取市级数据
                const cityUrl = `${this.baseUrl}/${finalCityCode}_full.json`;
                cityData = await this.fetchDataWithRetry(cityUrl, `${cityName}市级数据`);
                
                // 保存市级数据到 data/{provinceCode}/{cityCode}/geo.json
                cityFilePath = path.join(this.dataDir, provinceCode, finalCityCode, 'geo.json');
                this.saveToFile(cityFilePath, cityData);
                
                console.log(`     ✅ 市级数据保存成功: ${cityFilePath}`);
                this.successCount++;
                this.stats.cities.success++;
                this.stats.cities.total++;
            }
            
        } catch (error) {
            console.error(`     ❌ 市级数据获取失败: ${error.message}`);
            this.errorCount++;
            this.stats.cities.failed++;
            this.stats.cities.total++;
            
            this.errorLog.push({
                type: 'city',
                name: cityName,
                code: cityCode6,
                originalCode: cityCode12,
                provinceCode: provinceCode,
                provinceName: provinceName,
                isMunicipality: isMunicipality,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    showProgress(current, total) {
        const percentage = ((current / total) * 100).toFixed(1);
        console.log(`\n📈 进度: ${current}/${total} (${percentage}%)`);
        console.log(`✅ 成功: ${this.successCount}, ❌ 失败: ${this.errorCount}`);
        
        if (this.errorLog.length > 0) {
            const lastError = this.errorLog[this.errorLog.length - 1];
            console.log(`🐛 最近错误: ${lastError.type}: ${lastError.name} - ${lastError.error}`);
        }
        console.log('');
    }

    saveResults() {
        // 保存成功结果摘要
        const summary = {
            total: this.totalCount,
            success: this.successCount,
            error: this.errorCount,
            successRate: this.totalCount > 0 ? ((this.successCount / this.totalCount) * 100).toFixed(1) : 0,
            stats: this.stats,
            timestamp: new Date().toISOString()
        };
        
        const summaryPath = path.join(this.dataDir, 'crawl_summary.json');
        this.saveToFile(summaryPath, summary);
        console.log(`📋 爬取摘要已保存到: ${summaryPath}`);
        
        // 保存详细错误日志
        if (this.errorLog.length > 0) {
            const errorLogPath = path.join(this.dataDir, 'error_log.json');
            this.saveToFile(errorLogPath, this.errorLog);
            console.log(`🐛 错误日志已保存到: ${errorLogPath}`);
        }
    }

    showFinalStatistics() {
        console.log('\n' + '='.repeat(60));
        console.log('🎉 爬取完成 - 最终统计');
        console.log('='.repeat(60));
        
        console.log(`\n📊 总体统计:`);
        console.log(`   省级数据: ${this.stats.provinces.success}/${this.stats.provinces.total} 成功`);
        console.log(`   市级数据: ${this.stats.cities.success}/${this.stats.cities.total} 成功`);
        console.log(`   总成功率: ${this.totalCount > 0 ? ((this.successCount / (this.stats.provinces.total + this.stats.cities.total)) * 100).toFixed(1) : 0}%`);
        
        console.log(`\n📁 数据存储目录: ${this.dataDir}`);
        console.log(`📋 目录结构: data/{省级code}/geo.json (省级)`);
        console.log(`              data/{省级code}/{市级code}/geo.json (市级)`);
        
        if (this.errorLog.length > 0) {
            console.log(`\n🐛 错误统计: ${this.errorLog.length} 个错误`);
            console.log('错误详情:');
            
            const provinceErrors = this.errorLog.filter(e => e.type === 'province');
            const cityErrors = this.errorLog.filter(e => e.type === 'city');
            
            if (provinceErrors.length > 0) {
                console.log(`   省级错误 (${provinceErrors.length}个):`);
                provinceErrors.slice(0, 3).forEach(error => {
                    console.log(`     • ${error.name} (${error.code}): ${error.error}`);
                });
                if (provinceErrors.length > 3) {
                    console.log(`     ... 还有 ${provinceErrors.length - 3} 个省级错误`);
                }
            }
            
            if (cityErrors.length > 0) {
                console.log(`   市级错误 (${cityErrors.length}个):`);
                cityErrors.slice(0, 3).forEach(error => {
                    console.log(`     • ${error.provinceName} > ${error.name} (${error.code}): ${error.error}`);
                });
                if (cityErrors.length > 3) {
                    console.log(`     ... 还有 ${cityErrors.length - 3} 个市级错误`);
                }
            }
        }
        
        console.log('\n💡 编码说明:');
        console.log('   • 原始编码: 12位格式 (如: 420100000000)');
        console.log('   • API编码: 6位格式 (如: 420100)');
        console.log('   • 转换方式: 移除末尾6个0');
    }

    async run() {
        try {
            console.log('🚀 开始GeoJSON数据爬取...\n');
            
            const cityData = await this.init();
            
            // 处理每个省份
            for (let i = 0; i < cityData.length; i++) {
                const province = cityData[i];
                console.log(`\n[${i + 1}/${cityData.length}] 处理省份数据...`);
                
                await this.processProvince(province);
                this.showProgress(i + 1, cityData.length);
            }
            
            // 保存结果
            this.saveResults();
            
            // 显示最终统计
            this.showFinalStatistics();
            
        } catch (error) {
            console.error('❌ 爬虫运行失败:', error.message);
        }
    }
}

// 运行主爬虫
const crawler = new MainGeoJsonCrawler();
crawler.run();