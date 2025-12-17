# 项目目录结构（前端）



> 说明：此文件列出当前前端项目下 **除 `public/soundfonts` 下的大量音色资源文件外的所有实际存在的文件和目录**，用于快速导航和在目录结构发生变更时进行对照和更新。



```text

frontend/

├─ .gitignore                         # Git 忽略规则

├─ LICENSE                            # 开源协议

├─ README.md                          # 项目规则与基本说明

├─ WALKTHROUGH.md                     # 演练 / 开发流程说明

├─ env.example                        # 环境变量示例（真实 .env 不纳入版本控制）

├─ index.html                         # Vite 入口 HTML

├─ package-lock.json                  # npm 锁定文件

├─ package.json                       # 项目依赖与脚本

├─ vite.config.js                     # Vite 配置

├─ .vscode/

│  └─ extensions.json                 # 推荐 VS Code 插件列表

├─ doc/                               # 所有前端文档（按日期与主题归档）

│  ├─ 2025-12-09/

│  │  └─ API接口文档_20251209_1817.md             # 早期 API 接口文档

│  ├─ 2025-12-12/

│  │  ├─ 小节时值检测测试用例_20251212.md         # 小节时值检测相关测试用例

│  │  └─ 简谱渲染与高亮更新_20251212_1117.md      # 简谱渲染与高亮逻辑说明

│  ├─ 2025-12-16/

│  │  └─ 音频与三连音修复_20251216_0935.md        # 音频销毁与三连音渲染修复说明

│  ├─ Admin_API_Documentation_20251213_1230.md     # 管理后台 API 文档

│  └─ structure.md                                # 当前文件，记录目录结构

├─ public/                            # 静态资源（直接由服务器提供）

│  ├─ favicon.svg                     # 浏览器标签图标

│  ├─ vite.svg                        # Vite 默认图标

│  ├─ 备案图标.png                    # 备案相关图标

│  ├─ fonts/

│  │  └─ JianpuDigits.woff2          # 简谱数字字体

│  └─ soundfonts/

│     └─ FluidR3_GM/                 # 音色库（钢琴/小提琴/长笛等），下层为大量 mp3 资源文件

│        ├─ acoustic_grand_piano-mp3/ # 钢琴音色 mp3 资源（按音高划分文件，不在此逐一列出）

│        ├─ flute-mp3/               # 长笛音色 mp3 资源

│        ├─ violin-mp3/              # 小提琴音色 mp3 资源

│        └─ acoustic_grand_piano-mp3.js # 钢琴 SoundFont 映射配置

├─ src/                               # 前端源码目录

│  ├─ App.vue                         # 根组件，负责全局布局与路由出口

│  ├─ assets/

│  │  └─ vue.svg                      # Vue 徽标等静态资源

│  ├─ components/                     # 可复用组件

│  │  ├─ admin/                       # 管理后台相关组件

│  │  │  ├─ DashboardSummary.vue      # 仪表盘概要统计卡片

│  │  │  ├─ IPBanManagement.vue       # IP 封禁管理界面

│  │  │  ├─ TrafficTrends.vue        # 访问流量趋势图

│  │  │  └─ VisitorLogs.vue          # 访客访问日志列表

│  │  ├─ debug/

│  │  │  └─ PerfMonitor.vue          # 性能监视/调试组件

│  │  ├─ HelloWorld.vue              # 示例组件（Vite 模板保留）

│  │  ├─ JianpuScore.vue             # 简谱渲染核心组件（旧路径，向后兼容），内部逻辑迁移到 Score 下的渲染器

│  │  ├─ MetronomePanel.vue          # 节拍器控制面板

│  │  ├─ SpectrogramVisualizer.vue   # 频谱可视化组件（语谱图显示）

│  │  └─ Score/                      # 乐谱展示类组件（新 Renderer 体系）

│  │     ├─ JianpuRenderer.vue       # 简谱渲染器（推荐新引用路径）

│  │     ├─ StaffRenderer.vue        # 五线谱只读渲染器

│  │     └─ ImageRenderer.vue        # 图片谱 + 波形渲染组件

│  ├─ main.js                        # 前端入口文件，挂载 Vue 应用

│  ├─ router/

│  │  └─ index.js                    # 路由配置：编辑器、练功房、后台等页面路由

│  ├─ stores/

│  │  └─ user.js                     # 用户状态管理（登录信息、Token 等）

│  ├─ style.css                      # 全局样式

│  ├─ utils/                         # 工具与辅助函数

│  │  ├─ adminApi.js                 # 管理后台相关 API 封装

│  │  ├─ dateFormat.js               # 日期格式化工具

│  │  └─ jianpu.js                   # 简谱解析与转换工具函数

│  └─ views/                         # 页面级组件（路由对应的视图）

│     ├─ AdminDashboard.vue          # 管理后台首页

│     ├─ Editor.vue                  # 在线曲谱编辑器（支持简谱/五线谱/播放）

│     ├─ Library.vue                 # 曲谱库列表页

│     ├─ Login.vue                   # 登录页

│     ├─ Playlist.vue                # 播放列表 / 练功房入口页

│     ├─ Register.vue                # 注册页

│     └─ Workbench.vue               # 练功房/工作台总入口

```

