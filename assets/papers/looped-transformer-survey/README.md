# Looped Transformer 调研报告来源与原图说明

访问日期：2026-10-19。报告未进行独立训练与结果复现。所有数值按正文指向的原文表格核实。

## 全文版本与校验

|键|实际阅读版本|标题|HTML SHA-256|
|---|---|---|---|
|coconut|arXiv:2412.06769v4 [cs.CL] 23 Aug 2026|Training Large Language Models to Reason in a Continuous Latent Space|76b8fc2b5063df546c107112178bbf7a6059f2da6caa422bbc6df77564831ea9|
|computer|arXiv:2301.13196v1 [cs.LG] 30 Jan 2023|Looped Transformers as Programmable Computers|bcc0424f7844b1b4ae6a30f7312db14070e12e98a1d3d4d77917cc14c06b7f09|
|huginn|arXiv:2502.05171v1 [cs.LG] 07 Feb 2025|1Scaling by Thinking in Continuous Space|8eb3978d0c388338b6645a404a6b910fe20910da4087fca14f9d56933027c94e|
|latent|arXiv:2502.17416v1 [cs.CL] 24 Feb 2025|Reasoning with Latent Thoughts: On the Power of Looped Transformers|befbe9810c6dd9b7c2e822468689173669104e3cc94d7912c8b30800e8ec76a3|
|loopformer|arXiv:2602.11451v1 [cs.CL] 11 Feb 2026|LoopFormer: Elastic-Depth Looped Transformers for Latent Reasoning via Shortcut Modulation|431f9e9d21dc69ea29b99b0076399d146d11d703d2b73c3cbbbafe4ac13729d0|
|lotus|arXiv:2606.31779v2 [cs.LG] 13 Jul 2026|Bridging the Gap Between Latent and Explicit Reasoning with Looped Transformers|1b6b20ae2f7fca6a942bb010c89bee4a2c4a84990660e55f9dc8263efde553d5|
|melt|arXiv:2605.07721v3 [cs.CL] 28 Sep 2026|Memory-Efficient Looped Transformer: Decoupling Compute from Memory in Looped Language Models|07def032dee7f1dc776392c89a6f4cf0bd5c73aa5e6e7600b2a69069f7051389|
|mor|arXiv:2507.10524v3 [cs.CL] 25 Oct 2025|Mixture-of-Recursions: Learning Dynamic Recursive Depths for Adaptive Token-Level Computation|395bae2dc0c2e83ba0a34b61884f0287bb855feb6a214376630a5e05b10d4b85|
|ouro|2510.25741v1|Scaling Latent Reasoning via Looped Language Models|55c09b1672ac752e68e2076f980dc518cc40f8be458d4ee92e2def66c574d712|
|rltt|arXiv:2602.10520v3 [cs.LG] 28 May 2026|Prioritize the Process, Not Just the Outcome: Rewarding Latent Thought Trajectories Improves Reasoning in Looped Language Models|ed44fa3d231629eb37b78d69eaf7110ccdc1281a554a54acf783bb852a39b9a4|
|rrt|arXiv:2410.20672v3 [cs.CL] 28 Feb 2025|Relaxed Recursive Transformers: Effective Parameter Sharing with Layer-wise LoRA|ac7e6c1ca25d4cb2fde2c732c19c84aed6472eb89b45d448df3bfcf861e90a97|
|ut|arXiv:1807.03819v3 [cs.CL] 05 Mar 2019|Universal Transformers|012eb6616ed70ed978728af582232088a800eebd6723951278470d608a5b4c16|

## 原图文件

图像均为 arXiv HTML 版本中的原始 PNG，未裁剪、重绘、改色或修改数据。网页仅重新排布子图；完整图注可通过正文中的原文定位访问。报告图1=[3]图1；图2=[3]图3的六个子图；图3=[9]图5的三个子图；图4=[11]图1的两个子图。

|文件|原文位置|来源|许可|SHA-256|
|---|---|---|---|---|
|latent-S1-F1-1.png|latent S1.F1|[原文件](https://arxiv.org/html/2502.17416v1/Media/looping_illustration2.png)|CC BY 4.0|da527b825fc1943d1f2267b4c2085db6f8cbf276bb641603fa88a6a9c348eacf|
|latent-S3-F3-1.png|latent S3.F3|[原文件](https://arxiv.org/html/2502.17416v1/Media/depth_scaling_eval_perplexity.png)|CC BY 4.0|9f0719cd94fb6e8b3f49672cedfd2c51811cc5d8d4f7c7c8efb5233382700c65|
|latent-S3-F3-2.png|latent S3.F3|[原文件](https://arxiv.org/html/2502.17416v1/Media/depth_scaling_closedQA.png)|CC BY 4.0|811d1e49a14859e178fa1eca611714caf7fa79d9f3a7beb98af3fac5eea50b66|
|latent-S3-F3-3.png|latent S3.F3|[原文件](https://arxiv.org/html/2502.17416v1/Media/depth_scaling_openQA.png)|CC BY 4.0|91b85335ce9bb7d559269e9020ae323bc42159c4af563e70b2dc5e6c94a2d3ba|
|latent-S3-F3-4.png|latent S3.F3|[原文件](https://arxiv.org/html/2502.17416v1/Media/depth_scaling_eval_token_acc.png)|CC BY 4.0|aeb4e088365860a713013aab5d37c38fb73ed26a85a0cfd0635ee4e8f99acbea|
|latent-S3-F3-5.png|latent S3.F3|[原文件](https://arxiv.org/html/2502.17416v1/Media/depth_scaling_mwp.png)|CC BY 4.0|1b9fc2be90e6abddc04cce6c0de9e9b1d67a50b6bc9dc74e235ca5fc238946bf|
|latent-S3-F3-6.png|latent S3.F3|[原文件](https://arxiv.org/html/2502.17416v1/Media/depth_scaling_primitives.png)|CC BY 4.0|640a3644a3f42dca4a4c0b8fef9f6d010318e029bbfeeb5456d11f1d8a0a99d3|
|loopformer-S4-F5-1.png|loopformer S4.F5|[原文件](https://arxiv.org/html/2602.11451v1/shortcut_cka.png)|CC BY 4.0|c0df01f112978adef66c17049e74184eb392fa2f47649b7ac876ddec0703525a|
|loopformer-S4-F5-2.png|loopformer S4.F5|[原文件](https://arxiv.org/html/2602.11451v1/albert_ee_cka.png)|CC BY 4.0|1159c1ea5f26f56a104eccb988bd792495a1190c8152131754732c27d7bade34|
|loopformer-S4-F5-3.png|loopformer S4.F5|[原文件](https://arxiv.org/html/2602.11451v1/tmlt_ee_cka.png)|CC BY 4.0|989a50b66ecad6f50482524e17a995d8d1b35391e5eb62b1fb626983cc78c6bd|
|melt-S0-F1-1.png|melt S0.F1|[原文件](https://arxiv.org/html/2605.07721v3/figures/aime26_accuracy_vs_memory.png)|CC BY-NC-SA 4.0|00f2c637338bc17293bed8319bc86443051c2e8413540df9b7787af5f08df899|
|melt-S0-F1-2.png|melt S0.F1|[原文件](https://arxiv.org/html/2605.07721v3/figures/melt_kv_refinement_v3.png)|CC BY-NC-SA 4.0|ab6bb2cbc00bdcbf49948c44e0b368091071c341a3a12c7432921cef3354b1b7|

## 许可与署名

- [3] Saunshi N, Dikkala N, Li Z, Kumar S, Reddi SJ. Reasoning with Latent Thoughts: On the Power of Looped Transformers, arXiv:2502.17416v1. CC BY 4.0：https://creativecommons.org/licenses/by/4.0/。
- [9] Jeddi A, Ciccone M, Taati B. LoopFormer, arXiv:2602.11451v1. CC BY 4.0：https://creativecommons.org/licenses/by/4.0/。
- [11] Conchello Vendrell V, Padrés Masdemont A, Grillo N, et al. MELT, arXiv:2605.07721v3. 图像按 CC BY-NC-SA 4.0 非商业转载并保持同许可：https://creativecommons.org/licenses/by-nc-sa/4.0/。
- 许可信息根据实际阅读 HTML 顶部的 License 标识核对；图片所有权归原作者，本文文字、站点代码和其他素材不自动获得这些许可。

## 核心数据定位

- 加法对照：[3] v1 Table 1；深度外推：[8] v1 Table 10。
- 多预算 PPL/平均准确率：[9] v1 Table 1；CKA 为 Figure 5，不能解释为准确率。
- MELT 显存：[11] v3 Table 3；速度与 Max batch 矛盾：Appendix D Table 10；能力：Table 1。
- RLTT：[10] v3 Table 2 与 Table 9，保留不同 GRPO 基线，不跨表混算。
- LOTUS：[12] v2 Table 2，H100 NVL、batch=1、greedy。

## 需要保留的原文疑点

- Huginn v1 §3.1 输出行 R 与同段 coda 定义不一致，报告按文字意图用 C。
- Ouro v1 §3.4 式(5)与后续说明的门索引 t/t−1 不一致。
- LoopFormer v1 §3.3 正文称 logits 一致性，Algorithm 1 写隐藏状态距离。
- MELT v3 Table 3 与 Table 10 的 Max batch 顺序矛盾；Figure 1 图注称总内存，图轴为 KV Cache Memory。报告采用坐标轴口径，不自行修复批量数据。

这些疑点不阻止使用其他可直接核实的结果，但复现需核对实现或请求作者澄清。
