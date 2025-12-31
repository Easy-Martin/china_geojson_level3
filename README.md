
# 中国省市区geojson数据
- 数据来源：[阿里云数据可视化平台](https://geo.datav.aliyun.com/)
- 数据格式：geojson
- 数据层级：省、市、区（县）

## API说明
### 直辖市geojson数据
#### 已北京为例
get https://geo.datav.aliyun.com/areas_v3/bound/110000_full.json

### 省份geojson数据
#### 已湖北为例-省级的数据
get https://geo.datav.aliyun.com/areas_v3/bound/420000_full.json

#### 已湖北为例-市级的数据
get https://geo.datav.aliyun.com/areas_v3/bound/420100_full.json

## 备注
项目需要使用全国省市区geojson数据，奈何这样的数据居然还都特么收费，无语自己爬了一份，分享一下。其中部分数据阿里云也有缺失故没有；仓库包含了爬虫脚本`main_crawler.js`，让 AI5 分钟写完的。`data/geo.json`额外补充的全国省级数据，数据按照 `data/直辖市code/geo.json` 或者 `data/省份code/geo.json` 和 `data/省份code/城市code/geo.json` 组织。