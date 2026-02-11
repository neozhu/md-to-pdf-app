# Docker 部署指南

这个项目已经配置好 Docker 支持，可以轻松部署。

## 前置要求

- Docker (>= 20.10)
- Docker Compose (>= 2.0)

## 快速开始

### 使用 Docker Compose（推荐）

```bash
# 构建并启动容器
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止容器
docker-compose down
```

应用将在 http://localhost:3000 运行。

### 使用 Docker 命令

```bash
# 构建镜像
docker build -t md-to-pdf-app .

# 运行容器
docker run -d \
  --name md-to-pdf-app \
  --shm-size=2g \
  --security-opt seccomp:unconfined \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
  md-to-pdf-app

# 查看日志
docker logs -f md-to-pdf-app

# 停止容器
docker stop md-to-pdf-app
docker rm md-to-pdf-app
```

## 配置说明

### 重要参数

- `--shm-size=2g`: 增加共享内存，Chrome 需要
- `--security-opt seccomp:unconfined`: Chrome 沙箱所需的安全选项
- `-p 3000:3000`: 端口映射

### 环境变量

- `NODE_ENV`: 运行环境 (production/development)
- `PUPPETEER_EXECUTABLE_PATH`: Chrome 可执行文件路径
- `PORT`: 应用端口 (默认 3000)
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase 项目 URL（用于认证与历史记录）
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`: Supabase Publishable Key（浏览器与 SSR 认证）

## 架构说明

### Multi-stage 构建

Dockerfile 使用三阶段构建优化镜像大小：

1. **deps**: 安装依赖
2. **builder**: 构建应用
3. **runner**: 运行时环境（包含 Chrome）

### Puppeteer 支持

- 使用系统 Chromium 浏览器
- 安装中文字体 (Noto Sans CJK)
- 配置必要的系统依赖

## 生产环境建议

### 使用 Nginx 反向代理

```nginx
server {
    listen 80;
    server_name example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### 资源限制

在 docker-compose.yml 中添加资源限制：

```yaml
services:
  app:
    # ... 其他配置
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

## 故障排除

### 问题: PDF 生成失败

确保容器有足够的共享内存：
```bash
docker run --shm-size=2g ...
```

### 问题: Chrome 无法启动

检查安全选项：
```bash
docker run --security-opt seccomp:unconfined ...
```

### 问题: 字体显示异常

确保已安装中文字体支持（已在 Dockerfile 中包含）。

## 健康检查

Docker Compose 配置包含健康检查：

```yaml
healthcheck:
  test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000', ...)"]
  interval: 30s
  timeout: 10s
  retries: 3
```

查看健康状态：
```bash
docker-compose ps
```

## 更新部署

```bash
# 拉取最新代码
git pull

# 重新构建并启动
docker-compose up -d --build

# 清理旧镜像（可选）
docker image prune -f
```
