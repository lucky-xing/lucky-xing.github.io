# 用户 GitHub 网站实现约定

## 定位与复用

- 仓库：`https://github.com/lucky-xing/lucky-xing.github.io.git`。
- 站点：`https://lucky-xing.github.io/`；Pages 当前使用 `main` 根目录，但先核对实际设置。
- 当前任务中如已有正确 checkout，检查远端、工作区与指令后复用；否则在当前工作区获取独立副本。不要依赖某次聊天的绝对工作路径。
- 仓库规范：`reports/paper-research/README.md`；结构参考：`reports/paper-research/template.md`；生成/检查：`scripts/render-paper-report.py`。
- 满意基准：`posts/2026/10/18/pilot-based-radio-positioning-mapping.html`，源文件 `reports/2026/2026-10-18-pilot-based-radio-survey.md`。

## 分类与样式

通感栏目 `communication/isac/index.html` 属于 `communication.html`。其他研究主题用其对应分类，不能为了复用代码都归入通感。维护新文章卡片、总数、父/子栏目入口、首页最新研究与 `ARTICLE-CATEGORIES.md`。

复用当前分类页页眉/导航/页脚、根 `style.css` 与 `theme-motion.js`。新报告共享 `assets/paper-report.css`；已有基准报告仍使用 `assets/isac-reading.css`，不要因新任务重写其已确认样式。

公式组件为本地 `assets/vendor/mathjax/tex-svg-full.js`，保留 LICENSE。原图路径 `assets/papers/<slug>/`，附来源说明；不重绘数据。报告源保存至 `reports/YYYY/`，网页保存至 `posts/YYYY/MM/DD/`。

## 验证发布

生成器的 `check` 子命令检查结构、锚点、图像与本地资源；进一步运行 `git diff --check`。科学内容和浏览器渲染另行审查。

读取原文并完成文章后，在本次请求及用户既定流程授权范围内提交并推送，只包含本任务文件。核对远端 SHA，等待相同 SHA 的 Pages 运行成功，再访问实际文章与栏目链接。

浏览器检查 `mjx-container` 数量与预期数学表达式是否一致、`[data-mjx-error]` 是否为零；滚动到原图章节，确认 `complete` 且 `naturalWidth > 0`。检查正文、图注、公式、表格在桌面和窄屏中的可读性；整页不横向溢出，宽公式/表格自己滚动。无法进行的检查要说明，不能声称做过。

使用系统现有 GitHub 认证。沙箱内 `gh auth status` 曾因联网限制误报 Token 无效；应先核实 DNS/网络，并在获准联网环境复查，再判断是否真的需要用户重新认证。不得把 Token 写入规范、源码、URL 或命令参数。
