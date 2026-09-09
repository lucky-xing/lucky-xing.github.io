# 公司分析发布约定

每家公司使用一个 JSON 数据文件，位于 `finance/companies/data/`。字段包括 `slug`、`company`、`code`、`date`、`title`、`summary`、`verdict`、`cutoff` 和完整 Markdown `body`。

新增或更新报告后，在仓库根目录运行 `node scripts/build-companies.cjs`，它会生成公司目录、独立报告页并更新投资理财入口。同一公司后续复盘可更新现有档案，也可用新的 slug 保存独立版本。报告必须保留来源、分析时点、假设和风险限制，不能把历史价格描述成当前价格。
