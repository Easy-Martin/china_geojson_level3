
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
项目需要使用全国省市区geojson数据，奈何这样的数据居然还都特么收费，无语自己爬了一份，分享一下。其中部分数据阿里云也有缺失故没有；