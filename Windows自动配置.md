# Windows 自动配置

这份说明给 **Windows 上的 Cursor Agent** 用。用户表示要在 Windows 上运行之后，按这里把环境装好并启动，不要再问「要不要安装」或「要不要启动」。

Mac / Linux 不要执行本文的 `winget` 和 `python-service\.venv` 步骤。Mac 用 `./start-mac.sh`（`.venv-mac`）。

## 什么时候执行

用户说出下面任意一种意思，就从第 1 步做到第 7 步：

- 在 Windows 运行、帮我在 Windows 上跑起来、配置环境、启动项目
- 跑起来、继续、vibe coding
- 打开项目后 `:8000`、`:8001`、`:8765` 没有齐

已经在听的端口不要再开一遍。缺的依赖要补上，已有的 `python-service\.venv\` 和 `bridge\node_modules\` 不要删、不要覆盖。

## 跑通的标准

- 浏览器能开 `http://localhost:8000`
- `http://127.0.0.1:8001/health` 里 `status` 为 `ok`，`librosa` 为 `true`
- `http://127.0.0.1:8766/health` 里 `wsListening` 为 `true`，`serial.baud` 为 `500000`

没插 ESP32 时，Bridge 的 `serial.open` 可以是 `false`（`serial_closed`）。这时前端仍可用 Library 的「上传本地音频」走分析。实时麦克风要另烧 `esp32/inmp441_bridge.ino`，并关掉 Arduino 串口监视器。烧录不在本流程里自动做。

串口通信波特率是 **500000**，与固件 `esp32/inmp441_bridge.ino` 里的 `SERIAL_BAUD_RATE` 一致。`README.md` 或 `技术说明书.md` 里若还有 Bridge / Serial Monitor 用 921600 的旧句子，不要照做。Arduino 的 Upload Speed 921600 只是烧录速度，与这条串口波特率不是一回事。

## 1. 确认位置

工作目录必须是仓库根（能看到 `start-windows.ps1`）。后面的命令都从这里开始，除非某一步写了 `cd`。

```powershell
Get-Location
Test-Path .\start-windows.ps1
```

`Test-Path` 不是 `True` 时，先切到克隆下来的项目根，不要在别的目录里装环境。

## 2. 检查 Python 和 Node

```powershell
node -v
Get-Command node -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
py -3.12 -c "import sys; print(sys.executable); print(sys.version)"
```

需要：

- Node.js **18 或更高**（用 LTS）
- CPython **3.12**（3.11 也可以）。`WindowsApps` 里的商店占位 `python.exe` 不能用

## 3. 缺的系统软件用 winget 装

只装缺的那一项。装完后刷新当前终端的 PATH，再跑一次第 2 步，确认能打印版本：

```powershell
winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements
winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
```

`winget` 若弹出安装窗口或要管理员权限，等它结束再继续。装完仍找不到命令时，新开一个终端再查，不要改项目源码来绕过。

## 4. 准备 Python 虚拟环境

只使用 `python-service\.venv\`。不要创建或改动 `.venv-mac`、`.venv-linux`。

```powershell
Test-Path .\python-service\.venv\Scripts\python.exe
```

文件不存在时，在仓库根执行（首次会下载依赖，可能要几分钟，等它结束，不要并行再开一次）：

```powershell
powershell -ExecutionPolicy Bypass -File .\python-service\setup-python.ps1
```

脚本会创建 `.venv`、安装 `python-service\requirements.txt`，并跑 `pytest`。结束后确认：

```powershell
.\python-service\.venv\Scripts\python.exe -c "import fastapi, uvicorn, librosa, soundfile, numpy; print('ok')"
```

`python.exe` 已经在，但这句 `import` 失败时，只在这个虚拟环境里补依赖，不要删掉整个 `.venv`：

```powershell
.\python-service\.venv\Scripts\python.exe -m pip install -r .\python-service\requirements.txt
```

只有 `python.exe` 本身不存在，或用户明确说环境坏了，才可以删掉 `python-service\.venv` 后重新跑 `setup-python.ps1`。

## 5. 准备 Bridge 依赖

`start-windows.ps1` 发现没有 `bridge\node_modules` 时会自己 `npm install`。也可以先装好：

```powershell
if (-not (Test-Path .\bridge\node_modules)) { npm install --prefix .\bridge }
```

## 6. 可选的 .env

没有 `python-service\.env` 时，从示例复制一份，**不要覆盖已有文件**，也不要填入或打印真实密钥：

```powershell
if (-not (Test-Path .\python-service\.env)) {
  Copy-Item .\python-service\.env.example .\python-service\.env
}
```

密钥留空时，本地声学分析和画板可以正常用。`/health` 里 `omni.configured` 会是 `false`，Qwen 语义分类为空。这不是启动失败。

## 7. 启动并验收

三个端口都已经在听时，只做下面的健康检查，不要再次执行启动脚本。

```powershell
powershell -ExecutionPolicy Bypass -File .\start-windows.ps1
```

这个脚本会：

- 没有 `python-service\.venv\Scripts\python.exe` 时先跑 `setup-python.ps1`
- 没有 `bridge\node_modules` 时先 `npm install`
- 打开 Python `:8001`、Bridge `:8765`（`--port auto --baud 500000`）、前端 `:8000`
- 打开浏览器 `http://localhost:8000`

要对死某个串口时，先设环境变量再启动，不要把某个 `COM` 写进源码：

```powershell
$env:SERIAL_PORT = "COM3"
powershell -ExecutionPolicy Bypass -File .\start-windows.ps1
```

等端口起来（首次装完依赖最多等约 60 秒），然后检查：

```powershell
Invoke-RestMethod http://127.0.0.1:8001/health
Invoke-RestMethod http://127.0.0.1:8766/health
```

向用户用几句话汇报：装了什么、三个地址是否可用、ESP32 是否还没插上、语义分析密钥是否还是空的。

## 失败时只处理对应的那一项

| 现象 | 处理 |
|------|------|
| `setup-python.ps1` 说找不到 Python | 完成第 3 步，刷新 PATH，再跑第 4 步 |
| `node` 不在 PATH | 完成第 3 步的 Node LTS，再跑第 7 步 |
| `:8001` 没起来 | 看 Python 那个窗口的报错。依赖缺了就按第 4 步在现有 `.venv` 里 `pip install`，不要另起一个系统 Python |
| `:8765` 没起来 | 看 Bridge 窗口。`npm install` 日志在 `logs\bridge-npm-install.log` |
| Bridge 在听，但 `serial.open` 为 false | USB 数据线要能传数据；拔掉后重插；关掉 Arduino 串口监视器。波特率保持 500000 |
| 浏览器打不开 `:8000` | 再跑一次 `start-windows.ps1`。脚本发现端口已占用会跳过，不会关掉你正在用的服务 |
| 分析没有语义类别 | 正常，除非用户已经在 `.env` 里配了 `SILICONFLOW_API_KEY` 并且 `/health` 的 `omni.configured` 为 `true` |

## 不要做

- 不要问用户要不要开始
- 不要用 Mac 的 `.venv-mac` 替换 Windows 的 `.venv`
- 不要把 API Key 写进前端、源码或对话
- 不要为了启动去改业务代码，或把 `README.md` 里的 Windows 步骤改成只适用于 Mac
- 不要提交 `.env`、`python-service\.venv\`、`bridge\node_modules\`
