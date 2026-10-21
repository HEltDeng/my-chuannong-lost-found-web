# 失物招领页面

用户于 2026-10-16 确认可交互版本后接入 Android。页面源码位于此目录，应用运行时只读取 `app/src/main/assets/lost-found/` 中的离线产物，不依赖 Vite 或电脑服务器。

使用 Node 24、npm 11：

```sh
npm ci
npm test
npm run build
```

`build` 先执行 TypeScript 检查和 Vite 打包，再将资源与许可文件同步到 Android assets。同步范围仅为 `assets/lost-found`，不会修改其他功能资源。随后按仓库 README 构建 APK。

- `src/App.tsx`：搜索、校区、寻物/招领、详情、发布、我的发布、编辑、完成、删除/撤销。
- `src/storage.ts`：IndexedDB 事务、校验和写入失败处理。
- `src/mobile.tsx`、`src/native.css`：实际手机上的滚动、底部面板、原生键盘和安全区域适配。没有模拟手机壳或模拟键盘。
- `tests/storage.test.mjs`：持久化、并发、归属限制、无效输入、写入失败及损坏数据保护。
- `public/assets/items`：已确认的 ImageGen 物品照片；图标来自 Radix，字体为 Noto Sans SC，许可随离线包提供。

Android 中使用独立的“我的川农账号”授权，通过 `src/online.ts` 和限定的原生桥接入本产品后台。发布和修改须审核后公开；处理通知、删除和完成状态与后台同步。连接失败不伪装发布成功。首次使用不再填充示例记录。

`src/storage.ts` 保留浏览器独立预览和已有本地记录的兼容能力，IndexedDB 写入仅在事务完成后反馈成功。本地预览没有跨设备同步；应用内在线服务以后台记录为准。旧照片资源保留用于既有记录显示，不作为新的运营内容分发。

Android 容器保留列表、详情、发布 Intent，只加载本功能随包文件；限定桥仅用于本产品允许的接口，不向网页提供学校密码或会话。系统文档选择器接收用户选择的 PNG/JPEG/WebP，网页限制单张 10 MB；上传仍需后台重新校验和处理。
