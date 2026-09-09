# 每日财经发布约定

本栏目由「每日8点财经分析」任务维护。以北京时间的报告日期归档，试阅版明确标注。不要把其他任务内容、邮件配置、私人信息或凭证发布到网站。

1. 在仓库根目录先检查 `git status --short`，确认没有他人的未提交更改，再 `git pull --ff-only`。有冲突时保留现有文件，不能强制覆盖。
2. 每期新增 `finance/daily/data/YYYY-MM-DD.json`，UTF-8，字段为 `date`、`title`、`summary`、`cutoff`、`body`（完整 Markdown 正文），可选 `edition`。日期为北京时间，截止时间必须如实填写。正文保留直接来源链接和数据限制。无报告时不生成虚构归档。同日重跑更新同一文件，不创建重复日期；内容完全一致时不作无意义提交。
3. 在仓库根目录运行 `node scripts/build-daily.cjs`。脚本生成日期详情页、倒序目录、相邻日期链接和投资理财入口，并保留历史报告。
4. 检查每期正文、来源、表格、日期与目录链接，运行 `git diff --check`。只提交本次改动的 `finance/daily`、`finance.html`；不要提交其他人的改动，也不要强制推送。
5. 提交并推送到 `https://github.com/lucky-xing/lucky-xing.github.io.git` 的 `main`。已有用户授权自动公开发布财经报告。
6. 通过 GitHub Pages 构建状态核实此次提交发布成功，再验证 `https://lucky-xing.github.io/finance/daily/YYYY-MM-DD.html` 和目录可访问。失败则保留本地报告，明确告知发布失败，不声称已上线。

原始 JSON 可直接维护。渲染支持段落、Markdown 链接、加粗、行内代码、标题、无序列表和表格；不执行原始 HTML。网站发布时间取决于任务生成及 GitHub Pages 完成时间，不保证精确到 8 点整。
