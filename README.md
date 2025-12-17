# Vue 3 + Vite

This template should help get you started developing with Vue 3 in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

Learn more about IDE Support for Vue in the [Vue Docs Scaling up Guide](https://vuejs.org/guide/scaling-up/tooling.html#ide-support).



### 1. 文档管理规则

- **所有开发文档** 必须存放在 `doc/YYYY-MM-DD` 目录中
- **文档命名规范** 格式为：`文档名称_YYYYMMDD_HHMM.md`
- **时间戳格式** 使用 `YYYYMMDD_HHMM` 格式，精确到分钟
- **根目录README** 仅用于记录项目规则和基本信息

### 2. git提交原则

- 使用中文创建提交
- 每一条提交信息由 **Header**, **Body** (可选) 和 **Footer** (可选) 组成。
- Header 详解
Header 是必填项，且长度不应超过 72个字符。
<type> (必填)
用于说明 commit 的类别，只允许使用以下 7 个标识：
Type	含义	说明
feat	✨ 新功能	引入新特性 (Features)
fix	🐛 修复	修复 Bug
docs	📚 文档	仅修改文档 (README, API doc)
style	🎨 格式	代码格式调整 (空格, 缩进, 分号)，不影响逻辑
refactor	♻️ 重构	既不修复错误也不添加功能的代码更改
perf	⚡️ 性能	提高性能的代码更改
test	✅ 测试	增加缺失的测试或修正现有的测试
chore	🔧 杂项	构建过程或辅助工具的变动 (依赖更新, webpack配置)

更详细的内容以md格式保存到doc目录下。同时需要遵守上述文档管理规则
