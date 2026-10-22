# DeepInfer 调研来源与原图

研究日期：2026-10-22。固定官方代码提交：`9bd9cf243fc53ef9afbf8f04d391d989117d6ab9`。

本报告依据官方文档与静态源代码阅读，没有下载模型权重、构建 CUDA/CANN 扩展、运行模型或复现性能。官方知乎技术文章访问返回 403，未声称读过其全文；对应系统细节依据仓库的完整 Q&A。

## 图像来源

作者：DeepSeek-AI。图像来自 DeepInfer 官方仓库 doc/images，原色、坐标和图例均保留，未裁剪、改色或重绘。仓库根许可证为 Apache-2.0；本目录保留 DeepInfer-LICENSE。未将该许可扩展到模型权重或其他第三方素材。

|报告图|原始文件|用途|
|---|---|---|
|图1|architecture_overview.png|完整内部参考系统；不代表全部组件已开放|
|图2|prefill_pareto.png|4张SM100、EP4DP4、128K上下文、140-token replay|
|图3|decode_pareto.png|64张SM100、EP64DP64；固定3草稿、接受率0.75换算|
|图4|wide_ep_decode_pareto.png|EP8与EP64的配置比较，冗余专家数量也不同|

图像和已读文件的固定链接及 SHA-256 见 research-manifest.json。所有图中精确坐标未从像素反推，报告仅描述趋势。动态验证的精确数据来自 Q&A 表格；模型准确率来自 eval/README.md。

## 基准口径

实测 step/s 与绘图 token/s 分开记录。plot_pareto.py 使用 tau=1+nextn*a，不是根据同一次真实业务输出直接累计 token。benchmark.py 强制负载均衡并剔除统计flush区间，属于受控稳态设置。动态长度验证表不等同于固定nextn=3图。

## 其他来源

- deepseek-recipe 官方 README；该项目本次记录提交 935817c66f5d6e64838f419692545f06787e485f，MIT。
- vLLM 官方 README，本次记录提交 9d61ade7f657833df27e43c4561455523c78c8fb。
- SGLang 官方 README，访问日期快照，未固定提交；因此仅比较公开定位，不给出版本级速度结论。
- TensorRT-LLM 官方 README，本次记录提交 af3e5eb257ff49cf31cb8ce441d46aed585e902d。
- 默认模型的 Hugging Face 官方模型页：deepseek-ai/DeepSeek-V4.1-Flash-1017；用于身份与许可核对，不将平台自动生成的加载示例当成性能保证。
