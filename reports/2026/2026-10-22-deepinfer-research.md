# DeepInfer 技术调研：DeepSeek 大规模推理引擎的架构、性能口径与部署边界

日期：2026-10-22　｜　AI / 模型结构洞察分析　｜　推理系统与源码调研　｜　版本 1.0

## 摘要

DeepInfer 是 DeepSeek 于 2026 年 10 月公开的大规模模型推理框架。其价值并非单一算子加速，而是将模型专属内核、注意力数据并行、专家并行与负载均衡、置信度驱动的投机验证、滑动窗口有界重放和 CPU/GPU 异步调度组合起来。本报告固定官方代码提交，阅读 README、完整部署 Q&A、性能及精度评测脚本，并追踪关键实现，分析公开引擎与内部完整服务的区别。

结论是：DeepInfer 为研究 DeepSeek-V4.1-Flash 的模型—系统协同提供了高价值参考，但当前公开版本不是开箱即用的完整线上服务，也不是面向任意模型和任意显卡的通用替代品。官方 decode 图使用实测执行步率加接受率假设进行吞吐换算，动态验证收益随并发而变；SWA 有界重放具有近似语义，不能由 mask/compact 等价测试推出对未截断模型完全无损。报告保留原始架构及性能图，给出成本模型、可追溯数据、实现边界和复现实验设计。

**关键词：** DeepInfer；DeepSeek；MoE 推理；专家并行；投机解码；SWA；KV cache；异步调度

## 1. 项目身份、时间与研究方法

### 1.1 最近发布的究竟是什么

官方项目为 [deepseek-ai/DeepInfer](https://github.com/deepseek-ai/DeepInfer)，不是同名第三方网站。本文区分三个对象：**DeepSeek-V4.1-Flash 是模型；DeepInfer 是执行模型的引擎；deepseek-recipe 是请求协议、提示模板、token 编解码和流式解析组件。** 三者组合仍不自动构成完整线上服务。

官方提交历史显示 initial commit 为 2026-10-20 04:09:42 UTC，即北京时间 10 月 20 日 12:09:42。本文读取的最新提交为 `9bd9cf243fc53ef9afbf8f04d391d989117d6ab9`，时间为 2026-10-21 12:55:43 +08:00，内容涉及 DeepEP 子模块更新及构建脚本调整。提交时间用于版本追踪，不等同于精确对外公告时间。

| 项目 | 本次核实内容 |
|---|---|
| 固定代码版本 | DeepInfer `9bd9cf2`，完整 SHA 见上文 |
| 包声明 | `pyproject.toml` 的 version 为 0.1.0，分类声明为 Beta |
| 默认模型 | `deepseek-ai/DeepSeek-V4.1-Flash-1017` |
| README 列出的硬件 | NVIDIA SM100 GPU、Huawei Ascend 950 NPU |
| 引擎许可 | Apache-2.0；模型官方页标示 MIT，二者许可分别判断 |
| 本报告证据 | 官方文档、关键代码静态阅读、原始图像、官方评测表 |
| 本报告未做 | 模型权重下载、CUDA/CANN 构建、GPU/NPU 实测、独立精度复现 |

### 1.2 来源优先级与缺口

以固定提交的 [README](https://github.com/deepseek-ai/DeepInfer/blob/9bd9cf243fc53ef9afbf8f04d391d989117d6ab9/README.md)、[部署 Q&A](https://github.com/deepseek-ai/DeepInfer/blob/9bd9cf243fc53ef9afbf8f04d391d989117d6ab9/doc/inference_deployment_qa.md)、[examples 说明](https://github.com/deepseek-ai/DeepInfer/blob/9bd9cf243fc53ef9afbf8f04d391d989117d6ab9/examples/README.md)、[评测说明](https://github.com/deepseek-ai/DeepInfer/blob/9bd9cf243fc53ef9afbf8f04d391d989117d6ab9/eval/README.md)为主要依据。涉及算法时再核对 C++ 调度、TileLang 分配内核、EPLB 策略和 YoCo 实现，不把功能列表直接当作性能证据。

官方 Q&A 链接的知乎技术长文访问返回 403，本报告没有读到其全文，不以二手转述补齐。对照框架仅比较官方文档中的定位和公开接口，不制造同条件性能排名。主要引用定位与文件 SHA-256 记录于[来源清单](/assets/papers/deepinfer-research/README.md)和[研究清单](/assets/papers/deepinfer-research/research-manifest.json)。

本文分别标明**官方描述、代码观察、报告推导与复现建议**。官方自述的线上系统规模及效果，没有独立审计支撑，不表述为第三方已经验证的事实。

## 2. 首要边界：公开引擎与完整服务

### 2.1 已开放的能力

当前 README 列出：专属内核、模型及采样运行时；Attention DP / balanced CP；MoE EP＋EPLB；DSpark 与置信度调度验证；SWA bounded replay；异步调度；batch-invariant inference；确定性采样；regex、JSON schema 和 EBNF 结构化输出。

代码与文档明确承认主要源自 vLLM，并借鉴 SGLang、TensorRT-LLM。因此它不是“首次发明连续批处理、投机解码或调度重叠”；更值得研究的是这些机制如何针对指定模型和硬件共同设计。

### 2.2 尚未包含的服务层

| 层次 | 当前公开边界 | 对部署的含义 |
|---|---|---|
| 模型执行、采样、设备内存管理 | 引擎中有实现 | 可以运行离线批推理 |
| 分页块／状态缓存基础结构 | `block_manager.hpp`、cache engine 等存在 | 不能说“代码中没有 KV cache” |
| 跨请求、跨机器持久 KV 系统 | README 列为完整服务尚缺部分 | 不能直接复制内部多日缓存命中服务 |
| VE / Prefill / Decode 服务拆分 | 多数必要引擎侧功能已有；完整服务未包含 | 不能将接口或钩子等同于可部署的整套服务 |
| 数据并行副本的集群负载均衡 | 当前发布不含完整组件 | 需自行建设入口、路由和资源管理 |
| HTTP 服务及协议衔接 | offline wrapper 并非在线 API server | recipe 提供转换逻辑，调用方仍提供 HTTP 和推理 |

**源码交叉核对：** `deepinfer/engine/llm_engine.py` 中有缓存初始化与 `init_pd_split`、`do_save_kvcache` 等扩展钩子，部分为虚方法；这与“引擎接口存在、内部基础设施未完整开放”的边界一致。

<figure class="paper-figure" id="fig-architecture">
<a href="/assets/papers/deepinfer-research/architecture_overview.png" target="_blank" rel="noopener"><img src="/assets/papers/deepinfer-research/architecture_overview.png" alt="DeepSeek官方完整推理系统参考架构，包含Recipe、入口、VE/Prefill/Decode负载均衡、EPLB与3FS缓存" loading="lazy"></a>
<figcaption>图 1．官方完整参考系统架构。来源：DeepSeek-AI，固定提交的 doc/images/architecture_overview.png；仓库 Apache-2.0，图像未修改。黑箭头表示请求路径，蓝箭头表示缓存传输。该图描绘的范围大于本次开放引擎：不能据图认定入口、3FS 缓存和所有集群负载均衡代码均已开放。<a href="https://github.com/deepseek-ai/DeepInfer/blob/9bd9cf243fc53ef9afbf8f04d391d989117d6ab9/doc/inference_deployment_qa.md">原始说明</a>。</figcaption>
</figure>

## 3. 统一性能模型：它在优化什么

本节是**报告建立的分析模型**，不是官方论文中的编号公式。输入为请求 $r$，输入长度 $n_r$、需新计算的后缀 $u_r$、输出长度 $m_r$、并发和到达过程。输出是生成结果及延迟、吞吐、资源消耗。

### 3.1 延迟拆解

$$
TTFT_r=T_{queue}+T_{protocol}+T_{cache}+T_{VE}+T_{prefill}+T_{first\ sample}. \tag{1}
$$

其中各项单位为秒；该加和是概念拆解，实际可重叠阶段不能简单重复相加。每步解码时间近似由 CPU、设备计算、通信和同步的关键路径决定。理想重叠可写成：

$$
T_{step}\gtrsim\max(T_{CPU},T_{GPU+comm})+T_{unhidden},\qquad v_{user}\approx\frac{\tau}{T_{step}}. \tag{2}
$$

$\tau$ 是每请求每步最终发出的平均 token 数，$v_{user}$ 单位为 token/s/user。这个关系解释为什么既要提高每步推进长度，又要消除 CPU 造成的设备空闲。

### 3.2 系统目标与瓶颈

有意义的目标是在质量与尾延迟约束下最大化有效输出吞吐，而非单独最大化某算子的 FLOPs：

$$
\max\;\frac{\text{满足质量与SLO的有效输出token}}{\text{GPU秒}}
\quad\text{s.t.}\quad P95(TTFT)\le L_1,\;P95(TBT)\le L_2. \tag{3}
$$

Prefill 偏向大批矩阵计算，decode 更容易受权重访存、注意力 KV 访问和通信限制。该分类不是所有长度和并发下都成立。DeepInfer 的组合设计分别处理这些瓶颈，但某阶段的加速只有占据端到端关键路径时才能完整转化为用户收益。

## 4. 并行组织与内核协同

### 4.1 Attention DP 与 Wide-EP

官方当前生产配置说明：prefill 使用较小 EP/DP，decode 在 scale-up 域内使用 EP64–128 / DP64–128；视觉编码单独部署。这里的 EP64DP64 是**同一批 64 张卡在不同算子阶段采用不同组织**，不是 $64\times64$ 张卡。benchmark 中 $DP=EP/CP$，其示例 CP=1 时即 DP=EP。

Attention DP 让不同 rank 处理不同请求；MoE 部分通过 EP 把这些 token 汇入专家计算，再组合返回。它用更宽的专家分片减少单卡专家权重负担，并为专家 GEMM 提供更好的批量形状；代价是更大通信域、集体同步和故障影响范围。

代码允许 balanced CP，不等于官方当前线上配置正在使用 CP。Q&A 明确当前不使用 TP/CP；README 的“支持”和生产部署的“采用”需区分。

### 4.2 专家数与访存的近似账本

令逻辑路由专家数为 $E$、冗余副本数为 $R$、EP 规模为 $P$，平均每卡物理专家数近似为：

$$
N_{expert/GPU}=\frac{E+R}{P}. \tag{4}
$$

官方图中的 EP8 使用 $384+32$，即每卡 52 个；EP64 使用 $384+64$，即每卡 7 个。这是物理专家数量的算术比较，不能直接等同于总显存或端到端延迟缩小 $52/7$ 倍，因为 attention、共享专家、KV、通信缓冲等不在该式内。

扩大 EP 在高速互联下可能有利，在低速跨机网络上可能变差。Q&A 推荐 decode 大规模域，并不意味着任何 64 张卡的组网都能重现相同曲线。

### 4.3 EPLB：复制热点并调整放置

`deepinfer/model_executor/eplb/policy.py` 将逻辑专家与物理副本区分：先根据历史 token 负载贪心添加冗余副本，再按多个历史 step 的峰值 rank 负载放置物理专家。可将其目标概括为：

$$
\min_{placement}\sum_{s\in\mathcal W}\max_{p\in[1,P]}\sum_{e\mapsto p}load_{e,s},\qquad
\#experts(p)\le capacity. \tag{5}
$$

这是对代码目标的统一重写，不是全局最优性证明。收益是降低最慢 rank 造成的等待；代价是额外 HBM、统计、权重搬迁和布局更新。Q&A 的 `moe_lb` 定义为最慢 rank／均值，越接近 1 越均衡；不是模型准确率。

EPLB 与外部请求负载均衡也不同：前者调整一个专家通信组内部的专家放置，后者决定请求进入哪个引擎／哪个 rank。一个不能替代另一个。

### 4.4 内核栈

| 组件 | 官方列出的作用范围／阅读方式 |
|---|---|
| FlashMLA | 注意力相关高性能内核；具体使用须结合 profile |
| DeepGEMM | GEMM／MoE 计算相关内核 |
| DeepEP | 专家并行通信 |
| TileKernels、DeepSelect | 专属运行时算子及选择相关实现 |
| TileLang 内核 | 包括置信度调度、索引与状态相关融合算子 |
| DeepInfer 自身 C++/Python 层 | 请求状态、调度、缓存接口、模型执行和采样组织 |

这些库名字不能自动解释为每一步都被调用；应查看真实 trace。官方 Q&A 还指出公开与内部内核并非绝对一致，包括一处未开放的 FlashMLA SASS 优化；相应百分数是官方自述，不是本报告实测。

## 5. DSpark：将验证计算分配给更可能被接受的草稿

### 5.1 固定长度的浪费与预算选择

投机解码先生成草稿，再由目标模型验证。后面的草稿只有在前缀接受时才有价值。设请求 $i$ 第 $j$ 个草稿条件接受概率为 $p_{i,j}$，则草稿前缀被接受的预测概率可写为：

$$
c_{i,j}=\prod_{k=1}^{j}p_{i,k},\qquad
\mathbb E[A_i(\ell_i)]\approx\sum_{j=1}^{\ell_i}c_{i,j}. \tag{6}
$$

式 (6) 是解释 GPU 累乘实现的报告重写，依赖 Confidence Head 的概率可校准；不是说独立接受事件真实严格成立。

给每请求至少一个主模型位置、额外验证预算为 $q-N$ 时，报告可将优化写为：

$$
q^*=\arg\max_q\frac{N+\sum_{(i,j)\in\mathcal S(q)}c_{i,j}}{\widehat T_{forward}(q)+\widehat T_{sampler}},\qquad
\sum_i(1+\ell_i)=q. \tag{7}
$$

`csrc/engine/mtp_varlen.hpp` 按接受率和性能曲线选择总预算；`tilelang_ops/cuda/schedule_mtp_varlen.py` 在 GPU 上累乘置信度、比较全局排名，并将预算转成每请求验证长度。每请求的草稿必须保留前缀语义，不能任意只验证远端位置。

**异步难点：** CPU 预调度下一轮时，最新置信度可能尚未返回。实现区分不同轮次的统计，用较早反馈选总预算，再在 GPU 根据更近反馈分配请求长度。陈旧估计、排序开销、低并发和场景迁移都可能减少收益。

### 5.2 官方动态验证数据：低并发不一定更快

以下精确数值来自固定提交 Q&A 的 speculative decoding 表；单位为官方估算 tok/s/rank，不是本报告新跑出的数字。

| 并发 seq/rank | 固定 5 验证长度 | 动态验证长度 | 固定接受长度 | 动态接受长度 | 固定吞吐 | 动态吞吐 | 动态收益 |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 16 | 5 | 4.44 | 3.32 | 3.24 | 4,891 | 4,816 | −1.5% |
| 32 | 5 | 3.65 | 3.25 | 3.17 | 8,964 | 9,111 | +1.6% |
| 48 | 5 | 3.94 | 3.30 | 3.26 | 12,032 | 12,467 | +3.6% |
| 60 | 5 | 3.58 | 3.30 | 3.21 | 13,730 | 14,466 | +5.4% |
| 72 | 5 | 3.24 | 3.29 | 3.12 | 14,962 | 15,961 | +6.7% |
| 96 | 5 | 3.24 | 3.30 | 3.15 | 16,817 | 18,660 | +11.0% |

**官方结果：** 较高并发下减少验证长度，接受长度变化相对小，获得吞吐收益。**报告判断：** 在低并发下验证较少并不足以抵消额外开销；不能把“少验证约 30%”写成“端到端快 30%”。例如并发 60 时验证长度减少 $(5-3.58)/5=28.4\%$，但吞吐收益为 5.4%，二者分母与意义不同。

### 5.3 关于分布保持与确定性

“使用投机解码”本身不足以证明与无草稿生成逐 token 一致或完全分布等价；需要核对采样修正、随机数使用、验证依赖和退出条件。本报告未完成这套形式化证明，不能用通用投机解码理论替代对 DSpark 所有路径的审计。

官方确定性采样的较强使用条件是 NVIDIA、`DEEPINFER_BATCH_INVARIANT=1`、`DEEPINFER_ENABLE_MTP_VARLEN=0`，并固定 `SamplingParams.seq_seed`。不应同时声称“开启动态验证”和“满足官方这组确定性配方”。

## 6. SWA 有界重放与缓存：最需要区分精确和近似的部分

### 6.1 为什么可以少算 decoder prefill

在模型的 CED / YoCo 相关结构中，部分后层消费由前部状态提供的压缩／共享 KV；重建后层局部 SWA 状态仍需要计算。若试图精确重建堆叠局部注意力，多层有效依赖范围可随层数扩大。

bounded replay 只重算后缀，并将重放区间内的注意力限制在边界之后。设后缀起点 $s$、SWA 窗口 $w$，重放位置 $i$ 的可见区间为：

$$
\mathcal K_i=[\max(s,i-w+1),i]. \tag{8}
$$

这与“把原模型所有历史都精确重算一遍”不同。官方 Q&A 明确称其重建的是 approximate SWA KV。对固定层数、固定窗口与后缀长度，代价对**完整上下文长度**可以有界；不是对模型层数、隐藏维度和所有其他变量都为常数。

### 6.2 128、134 与 140 不是同一个参数

| 数值 | 来源和含义 |
|---|---|
| 128 token | Q&A 的 SWA 窗口／存储块粒度及其重放解释 |
| 134 token | Q&A 的窗口加 6 个投机回退余量，以及 state slot 长度 |
| 140 token | README 默认 decoder compact replay 保留后缀；必须覆盖窗口与回退 |

配置值可能留有额外余量，不应根据 128 或 134 随意改掉默认 140。`deepinfer/model_executor/models/v4_modules/yoco.py` 与输入元数据模块处理 compaction 的状态重排；其正确性取决于模型配置和状态边界。

### 6.3 mask / compact 的等价不等于对完整模型无损

`examples/yoco/README.md` 提供两层检查：L1 比较可见键、SWA pivot、store slot、压缩索引；L2 在固定 teacher-forcing 轨迹下比较 logprob、top-K，特定模式还比较 confidence。

**mask** 让全部位置仍计算，但应用截断可见域；**compact** 只执行需要保留的部分。它们可能在同一截断语义下等价，但共同偏离未截断全量计算。因此还需第三组 `off` 对照，量化长文本质量、logprob 偏差和输出变化。

源码中 `llm_engine.py` 还会在 YoCo truncation 开启时关闭 `prompt_logprobs`，并有说明抢占可引起结果变化。这些是实际接口和复现边界，不能只展示吞吐收益。

### 6.4 KV 存储是另一层系统工程

官方内部系统区分设备中的运行缓存、主机中的 SWA state 和 3FS 上的分页块 KV；这些并不等同于当前仓库已经开放的持久缓存产品。缓存命中要先做前缀匹配，再取数、换入和计算；命中率高也可能被慢存储或传输抵消。

报告用以下不等式表达缓存复用的净收益条件：

$$
T_{match}+T_{fetch}+T_{swap}+T_{replay}<T_{recompute\ saved}. \tag{9}
$$

这是解释式，不是线上所有操作都串行执行。官方系统通过异步取数、共享主机内存和传输重叠降低暴露成本。只有部署了相应基础设施，才能讨论内部多日缓存命中带来的整体收益。

## 7. 异步调度、数值稳定与结构化输出

### 7.1 “zero-overhead”指减少暴露空洞

同步路径为调度 → forward → sample → CPU 后处理 → 下一轮调度。GPU 等待 CPU 结果处理与调度时形成空洞。异步路径将下一轮调度、前一轮后处理和当前设备计算交错。

`deepinfer/engine/llm_engine.py` 的 `step`、`_execute_model_async_step`、`post_process` 与 `csrc/engine/zos.*` 承担相关路径。报告的近似收益表达为：

$$
S_{overlap}\approx\frac{T_{CPU}+T_{GPU}}{\max(T_{CPU},T_{GPU})+T_{unhidden}}. \tag{10}
$$

这不是保证值。“零开销”应理解为尽量隐藏 CPU 调度成本，不是 CPU 不耗时、同步不存在或所有负载均获固定加速。更复杂的异步状态也增加了回退、结束、错误传播和缓存释放的实现要求。

### 7.2 batch invariance 与复现

不同批形状可能改变归约、内核选择和浮点误差，继而改变采样输出。batch-invariant 模式针对批组成变化保持模型结果稳定，但其支持平台与附加开关必须遵循 README。固定随机种子也不能消除模型版本、硬件实现和近似计算路径不同造成的差异。

建议分别测试 logits 差异、贪心 token 一致性、固定 seed 采样一致性与任务分数；这些是四个不同层次。正确性回归的 PPL 样本检查也不能替代真实任务评估。

### 7.3 结构化输出与 deepseek-recipe

DeepInfer 的 SO 将约束编译成自动机，逐步生成合法 token 掩码，再约束采样。格式合法不保证内容正确，自动机编译开销与约束复杂度也应计入首包延迟。

[deepseek-recipe 官方 README](https://github.com/deepseek-ai/deepseek-recipe) 的边界很明确：提供 Messages、Chat Completions、Responses 等协议转换与解析；调用者提供模型推理、工具执行、HTTP 传输。其示例 server 使用 mock inference，不能当作完整模型服务。

Q&A 的特殊 token 处理区分真实控制 token ID 和用户文本中长得相同的字符，有助于防止文本伪装控制符；这并不意味着解决所有语义提示注入。结构约束也只有后端实际执行 constrained decoding 时才获得相应保障，不能仅在 prompt 中写一个 schema 就宣称强制遵守。

## 8. 官方基准的逐图解读与计量审查

### 8.1 Prefill 图：每步时间不是完整 TTFT

<figure class="paper-figure" id="fig-prefill">
<a href="/assets/papers/deepinfer-research/prefill_pareto.png" target="_blank" rel="noopener"><img src="/assets/papers/deepinfer-research/prefill_pareto.png" alt="官方Prefill曲线：4卡SM100，EP4DP4，128K上下文，140token decoder有界重放，横轴每步延迟" loading="lazy"></a>
<figcaption>图 2．官方非缓存输入吞吐—单步 prefill 延迟曲线。来源：固定提交 README / doc/images/prefill_pareto.png，DeepSeek-AI，Apache-2.0；未修改。条件为 4 张 SM100、EP4DP4、384+32 专家、131,072 上下文、140-token decoder bounded replay；点标签为每 DP rank 的 prefill token batch。纵轴为 tokens/s/GPU，横轴为 ms/prefill step。<a href="https://github.com/deepseek-ai/DeepInfer/blob/9bd9cf243fc53ef9afbf8f04d391d989117d6ab9/examples/sweep/plot_pareto.py">绘图实现</a>。</figcaption>
</figure>

**图中观察：** 增大 batch 后吞吐上升并逐渐饱和，单步延迟也增加。**边界：** 横轴不是排队、缓存匹配、全部 chunk 以及网络传输后的 TTFT；不能将该图某点说成“任意 128K 请求首字仅需该毫秒数”。图中没有 vLLM、SGLang 或 Ascend 曲线，不能从中宣称相对它们的速度倍率。

### 8.2 Decode 图：实测执行步率＋接受率换算

<figure class="paper-figure" id="fig-decode">
<a href="/assets/papers/deepinfer-research/decode_pareto.png" target="_blank" rel="noopener"><img src="/assets/papers/deepinfer-research/decode_pareto.png" alt="官方Decode曲线：64卡SM100，EP64DP64，固定3草稿，按0.75接受率换算吞吐与单用户速度" loading="lazy"></a>
<figcaption>图 3．官方输出吞吐—交互速度曲线。来源：固定提交 README / doc/images/decode_pareto.png，DeepSeek-AI，Apache-2.0；未修改。条件为 64 张 SM100、EP64DP64、384+64 专家、131,072 上下文、nextn=3 fixed；标题注明 per-token acceptance 75% → τ=3.25。点标签为每 DP rank 的请求数，不是全组总请求数。<a href="https://github.com/deepseek-ai/DeepInfer/blob/9bd9cf243fc53ef9afbf8f04d391d989117d6ab9/examples/sweep/plot_pareto.py">口径定义</a>。</figcaption>
</figure>

`plot_pareto.py` 的 `decode_tau` 与 `decode_axes` 直接定义：

$$
\tau_{plot}=1+d\,a,\qquad
v_{plot}=SPS\,\tau_{plot},\qquad
Q_{plot}=SPS\,K\,\tau_{plot}/CP. \tag{11}
$$

其中 $d$ 是草稿数，$a$ 为传给绘图脚本的接受率，$K$ 为每 DP rank 并发，SPS 为执行 step/s。$d=3,a=0.75$ 得 3.25。**这是官方绘图计量方式，不是本报告推测。** 固定长度 benchmark 原始吞吐还按 $1+d$ 全接受计数，绘图再换口径。

这里的 $a$ 应理解为与平均草稿接受数一致的汇总比例；若把它理解成每一级条件接受概率并假设每级都相同，则前缀接受模型会给出 $1+a+a^2+a^3=2.734375$，与 3.25 不同。报告不认定图必然错误，而是要求复现明确“接受率”的定义，不能把两种含义混用。

因此该图是**受控实测步率与接受率假设的组合估计**，不能表述成真实线上请求直接统计得到的 token 流量。脚本还断言 `mtp_varlen` 必须关闭；动态模式不能直接再次乘同一因子。

**读图取舍：** 并发提高通常增加每卡吞吐，同时降低单用户速度。不能把最高吞吐点和最快单用户点拼成“同时达到”的单一性能数字。原始 JSONL 不随这些图一同给出，本报告不从像素拟合精确坐标，也不伪造误差条。

### 8.3 Wide-EP：有价值的配置对照，但不是纯单变量消融

<figure class="paper-figure" id="fig-wideep">
<a href="/assets/papers/deepinfer-research/wide_ep_decode_pareto.png" target="_blank" rel="noopener"><img src="/assets/papers/deepinfer-research/wide_ep_decode_pareto.png" alt="官方Wide EP比较：EP8DP8与EP64DP64，不同专家冗余数量，输出吞吐对单用户速度" loading="lazy"></a>
<figcaption>图 4．官方 EP8 与 EP64 decode 比较。来源：固定提交 Q&A / doc/images/wide_ep_decode_pareto.png，DeepSeek-AI，Apache-2.0；未修改。蓝线为 EP64DP64、384+64 专家，橙线为 EP8DP8、384+32 专家，其他图示条件包括 131,072 上下文、固定 nextn=3、0.75 接受率换算。纵轴已按 GPU 归一化。<a href="https://github.com/deepseek-ai/DeepInfer/blob/9bd9cf243fc53ef9afbf8f04d391d989117d6ab9/doc/inference_deployment_qa.md">原始说明</a>。</figcaption>
</figure>

**图中观察：** EP64 配置在所测范围展示更好的吞吐—交互速度前沿，支持 Wide-EP 在该互联及模型配置下的价值。**混杂因素：** 设备数量、EP/DP 组织、专家冗余数量及内存形态一起变化；不能据图严格分解“只改 EP”的因果收益。没有故障率、尾延迟、能耗、动态流量或跨数据中心条件下的完整对照。

### 8.4 基准脚本主动去掉了哪些干扰

`examples/benchmark.py` 读取 SPS 的稳态窗口并丢弃与 EPLB 统计 flush 冲突的区间；sweep 固定 `PROFILE=0`，因为 profiler 会改变耗时；测量还设置 `DEEPINFER_FORCE_LOAD_BALANCE=1`。同一上下文先建立共享前缀，再构造后缀请求。

这些设置适合刻画受控执行上限，但会弱化真实流量不均衡、冷缓存、统计更新和故障的影响。真实系统评价应另报包含这些成本的全程统计；不能把剔除区间后的均值冒充线上 P95/P99。

### 8.5 精度表是部署 sanity check，不是引擎带来的模型能力提升

固定提交 `eval/README.md` 报告：

| 数据集 | 题目数 | 每题采样 | 官方 Pass@1 参考值 |
|---|---:|---:|---:|
| AIME 2026 | 30 | 32 | 99.9% |
| GPQA Diamond | 198 | 8 | 93.4% |
| HLE-Full | 2,500，其中 342 图像题 | 1 | 42.6% |

AIME／GPQA 的 Pass@1 是多次采样的平均单次正确率，并非 pass@32 或 pass@8。生成与评分分开，默认使用 LLM judge；AIME／GPQA 也可规则评分，HLE 不支持规则 judge。只有 `coverage_complete=true` 时汇总有效。

**结论边界：** 表格帮助检查部署是否基本正常；没有开启／关闭各项优化的完整精度消融，不能归因于引擎使模型“更聪明”。小题集、高分区间、采样随机性和 judge 差异也需保留。

### 8.6 官方线上规模与经济数字如何使用

Q&A 自述单集群每天服务 155 trillion tokens，并给出每 GPU-hour 38 美元收入等数字。报告将其保留为**官方系统级自述**：未明确拆分缓存输入、未缓存输入、输出及集群 GPU 总量，不能与上述 decode 输出 tok/s/GPU 直接对照；收入不是成本或利润，也不能据此推导公开引擎的单 token 成本。

## 9. 与 vLLM、SGLang、TensorRT-LLM 的关系

以下是官方公开定位对比，不是同条件性能测试。对照项目持续更新，具体模型、硬件与功能组合须核对版本。

| 维度 | DeepInfer 本次快照 | vLLM | SGLang | TensorRT-LLM |
|---|---|---|---|---|
| 重心 | 指定 DeepSeek 模型的专属执行路径和生产经验 | 多模型推理与服务生态 | 大模型、多模态与 agentic serving 等工作负载 | NVIDIA 平台优化内核与运行时 |
| 本次硬件边界 | README 列 SM100 与 Ascend 950 | 官方列多平台及插件 | 官方列多类 GPU/NPU/TPU/CPU 等 | 以 NVIDIA 生态为主 |
| 直接可用服务接口 | 当前公开 offline wrapper；需补服务层 | 官方提供 API server 等 | 官方提供启动服务及配套文档 | 官方运行时与部署生态 |
| KV／路由 | 引擎基础设施有实现，内部持久缓存和集群负载均衡不完整 | 已有缓存、批处理及并行机制 | 已有多种缓存与服务机制 | 已有多种缓存、并行与调度优化 |
| 能否据本次图判定最快 | 不可以 | 没有同条件曲线 | 没有同条件曲线 | 没有同条件曲线 |

**报告判断：** DeepInfer 更适合作为指定模型和硬件条件下的专属优化参考与候选执行后端。已有完整服务生态的框架具有接入面和运维成熟度方面的价值；它们也可以吸收同类优化。因为当前没有同版本、同权重、同精度、同硬件、同流量的直接对照，本报告不作“全面替代”或“普遍快若干倍”的结论。

官方对照入口：[vLLM README](https://github.com/vllm-project/vllm)、[SGLang README](https://github.com/sgl-project/sglang)、[TensorRT-LLM README](https://github.com/NVIDIA/TensorRT-LLM)。

## 10. 部署要求与适用性

### 10.1 环境不应只看一句 Python 要求

| 项目 | 官方要求／已读文件 |
|---|---|
| 操作系统、编译器 | Linux，GCC ≥13 |
| Python | README 要求 3.12；包元数据为 ≥3.12，应优先遵从已测 3.12 |
| NVIDIA | SM100，CUDA 13；当前 requirements 锁定 torch 2.13.0+cu132 和 flash-attn-4 4.0.0b34 |
| Ascend | Ascend 950、CANN 9.2；锁定 torch 2.13.0+cpu、torch-npu 2.13.0rc1 |
| NVIDIA 构建动作 | build.sh 会重装 NCCL 2.32.3 并构建 vendor／本地扩展 |
| 模型文件 | 对应 config、权重及评测需要的 encoding 文件 |
| 服务扩展 | HTTP、认证、请求限流、集群路由、持久缓存与观测等需另行集成 |

H100/H200、消费卡、旧 Ascend 等未被当前 README 列为支持目标；这表示未获得本发布的支持保证，不等于证明任何修改后都不可能运行。支持 Ascend 也不等于 NVIDIA 的吞吐图可以转用到 NPU。

### 10.2 最小能运行与最小高效生产单元不同

仓库测试中 NVIDIA 离线配置为 EP4/CP2，Ascend 测试为 EP16/CP8；这反映给定测试权重、显存和实现的回归配置，不能推广成所有负载下的最低卡数保证。

Q&A 所说“最小高效部署单元”约为 64 张 prefill＋64 张 decode，是其推荐生产形态及 P:D 资源比例的结果，**不是 `offline_inference.py` 必须使用 128 张卡**。prefill 图用 4 张卡，decode 图用 64 张卡，亦非测得同一个 68 卡端到端系统的完整结果。

### 10.3 谁值得投入

- **已有 SM100／Ascend 950 集群并部署相应 DeepSeek 模型的团队：** 值得做同硬件 A/B，尤其关注 Wide-EP、融合 MoE、replay 与协议一致性。
- **AI Infra 研究者：** 适合研究计算预算分配、状态缓存与调度—内核协同，重点验证非理想流量及故障条件。
- **只有一般工作站或需要立即提供多模型 API 的团队：** 先评估模型和硬件支持、服务层开发量；不能把这次发布理解为通用低门槛运行包。

以上是基于项目边界的适用性判断，不构成采购建议。

## 11. 可复现方案与研究议题

本节为**报告建议**，未执行模型实验。先在独立 Linux 环境固定提交与模型 revision，记录子模块 SHA、固件、驱动、CUDA/CANN、编译参数、网络拓扑、功耗限制和所有 `DEEPINFER_*` 环境变量；不要在共享工作环境直接运行会替换 NCCL 的构建脚本。

### 11.1 分层验收

1. **功能：** 使用离线示例测试文本和多模态，确认正常 EOS、结构化输出、取消及失败回收。
2. **数值：** 跑仓库短／长 PPL 回归；另比较 batch invariant、不同批形状、固定 seed、抢占和迁移。
3. **replay：** `off / mask / compact` 三组，既检查两种截断执行等价，也测相对完整路径的准确率和概率偏移。
4. **性能：** 先复现官方稳态 sweep，再使用真实到达 trace、冷热缓存混合和长尾输出，记录全程数据。
5. **服务：** 补齐 API 和 cache 服务后再测 TTFT/TBT、P95/P99、好请求吞吐、取消率、故障恢复及多租户隔离。

### 11.2 有意义的消融矩阵

| 实验 | 控制变量 | 要检验的问题 |
|---|---|---|
| 无草稿／固定 3／固定 5／动态验证 | 相同模型、请求与采样目标；记录实际接受数 | DSpark 的净收益来自哪里，低并发何时不划算 |
| 有／无异步调度 | 固定 batch、内核、图捕获设置 | 空洞减少是否真正转成端到端收益 |
| EP8／EP64 | 匹配总 GPU 数或报告资源差异；分别固定冗余策略 | 通信、专家分片与冗余复制的独立贡献 |
| EPLB 关闭／开启 | 同路由 trace、同副本数 | 峰值负载、更新开销与热点迁移速度 |
| replay off／mask／compact | 相同后缀、窗口与输入 | compaction 执行优化与近似质量代价分别是多少 |
| 暖缓存／冷缓存／缺 SWA 状态 | 同请求和存储带宽 | 存储命中是否被取数／重放成本抵消 |
| 均匀流量／突发／热点漂移 | 相同长期到达率 | 离线前沿能否迁移到线上 SLO |

### 11.3 计量与报告格式

把执行 SPS、验证 token 数、真实接受 token 数、最终输出 token 数分别写入日志。实际有效吞吐建议直接计数：

$$
Q_{actual}=\frac{\sum_r\#\text{最终提交的有效输出token}_r}{G\,\Delta t}. \tag{12}
$$

$G$ 为参与计费／运行的全部设备数，$\Delta t$ 为包含指定开销的墙钟时间，单位是 token/s/GPU；必须说明是否包含排队、缓存填充、统计更新和失败。若另外报告 clean steady-state 数值，明确标记，不替换全程结果。

精度评测应固定数据版本、输出上限、采样种子、reasoning effort、judge 模型和 prompt；核对 coverage。AIME 等有限题集应给不确定性分析，不能因 960 条采样而把 30 个题目的任务覆盖当成 960 道独立题。

### 11.4 最值得继续研究的方向

**预算与质量联合优化。** Confidence Head 预测的不仅要校准接受率，还要在真实硬件和异步反馈下形成稳定收益；应分析陈旧估计和漂移。

**近似缓存语义的可控性。** replay 后缀长度、回退、状态缺失和抢占如何共同影响长上下文质量，需建立独立于吞吐的误差边界。

**大 EP 的可用性成本。** 更大的通信组会放大单设备故障影响，故障情况下的有效好请求吞吐可能改变正常运行时的前沿。

**协议一致性的端到端验证。** 相同 token 结果经过不同 API 协议、流式分块与工具参数解析后，是否仍保持一致，应通过金标准 trace 验证，而非仅测试模型输出字符串。

## 12. 综合结论

DeepInfer 的实质是将指定模型、专属内核、MoE 并行、缓存语义和调度执行联合优化。公开代码具有研究和工程参考价值，也提供了性能复现入口；但完整线上基础设施尚未一并开放，不能把内部服务的所有效果归结为安装这个引擎即可获得。

当前最有证据支持的三点是：Wide-EP 在官方所测配置下改善前沿；置信度驱动验证在较高并发下有额外收益而低并发未必；bounded replay 可以降低特定模型的后层 prefill 工作量，但涉及近似语义。最需要避免的三种误读是：将绘图换算值当真实线上直接计数、将少验证比例当端到端加速比例、将公开 offline engine 当完整生产集群。

对用户最实际的下一步，是依据手头硬件和服务需求决定是否做同条件验证。没有相应硬件时，可以先完成代码、调度模型和离线 trace 研究；有相应集群时，最终验收应以真实输出质量、SLO、总设备时间与故障恢复后的好请求吞吐为准。

## 参考资料与版本

访问日期均为 2026-10-22。以下前 11 项固定到同一 DeepInfer SHA；原图、来源与许可已在正文逐项标注。编号用于阅读导航，不意味着每个文件是一篇独立论文。

1. DeepSeek-AI. [DeepInfer README](https://github.com/deepseek-ai/DeepInfer/blob/9bd9cf243fc53ef9afbf8f04d391d989117d6ab9/README.md)：身份、开放边界、硬件与构建、原始基准图。
2. DeepSeek-AI. [Inference deployment Q&A](https://github.com/deepseek-ai/DeepInfer/blob/9bd9cf243fc53ef9afbf8f04d391d989117d6ab9/doc/inference_deployment_qa.md)：系统形态、并行、存储、动态验证表及内部服务自述。
3. DeepSeek-AI. [examples/README.md](https://github.com/deepseek-ai/DeepInfer/blob/9bd9cf243fc53ef9afbf8f04d391d989117d6ab9/examples/README.md) 与 [benchmark.py](https://github.com/deepseek-ai/DeepInfer/blob/9bd9cf243fc53ef9afbf8f04d391d989117d6ab9/examples/benchmark.py)：稳态窗口、缓存前缀、计量与干扰排除。
4. DeepSeek-AI. [run_sweep.sh](https://github.com/deepseek-ai/DeepInfer/blob/9bd9cf243fc53ef9afbf8f04d391d989117d6ab9/examples/sweep/run_sweep.sh) 与 [plot_pareto.py](https://github.com/deepseek-ai/DeepInfer/blob/9bd9cf243fc53ef9afbf8f04d391d989117d6ab9/examples/sweep/plot_pareto.py)：固定参数、接受率换算与绘图。
5. DeepSeek-AI. [eval/README.md](https://github.com/deepseek-ai/DeepInfer/blob/9bd9cf243fc53ef9afbf8f04d391d989117d6ab9/eval/README.md)：任务、采样、judge 与参考分数。
6. DeepSeek-AI. [mtp_varlen.hpp](https://github.com/deepseek-ai/DeepInfer/blob/9bd9cf243fc53ef9afbf8f04d391d989117d6ab9/csrc/engine/mtp_varlen.hpp)：动态验证预算选择与反馈轮次。
7. DeepSeek-AI. [GPU confidence scheduler](https://github.com/deepseek-ai/DeepInfer/blob/9bd9cf243fc53ef9afbf8f04d391d989117d6ab9/deepinfer/model_executor/layers/tilelang_ops/cuda/schedule_mtp_varlen.py)：累乘、全局排名与长度分配。
8. DeepSeek-AI. [EPLB policy](https://github.com/deepseek-ai/DeepInfer/blob/9bd9cf243fc53ef9afbf8f04d391d989117d6ab9/deepinfer/model_executor/eplb/policy.py)：副本选择与贪心放置。
9. DeepSeek-AI. [YoCo runtime](https://github.com/deepseek-ai/DeepInfer/blob/9bd9cf243fc53ef9afbf8f04d391d989117d6ab9/deepinfer/model_executor/models/v4_modules/yoco.py) 与 [等价测试说明](https://github.com/deepseek-ai/DeepInfer/blob/9bd9cf243fc53ef9afbf8f04d391d989117d6ab9/examples/yoco/README.md)。
10. DeepSeek-AI. [LLMEngine](https://github.com/deepseek-ai/DeepInfer/blob/9bd9cf243fc53ef9afbf8f04d391d989117d6ab9/deepinfer/engine/llm_engine.py)：缓存、服务钩子、调度及 prompt logprob 边界。
11. DeepSeek-AI. [模型回归配置](https://github.com/deepseek-ai/DeepInfer/blob/9bd9cf243fc53ef9afbf8f04d391d989117d6ab9/tests/models/test_offline_inference.py)、[build.sh](https://github.com/deepseek-ai/DeepInfer/blob/9bd9cf243fc53ef9afbf8f04d391d989117d6ab9/build.sh)、[包元数据](https://github.com/deepseek-ai/DeepInfer/blob/9bd9cf243fc53ef9afbf8f04d391d989117d6ab9/pyproject.toml)。
12. DeepSeek-AI. [deepseek-recipe README，935817c](https://github.com/deepseek-ai/deepseek-recipe/blob/935817c66f5d6e64838f419692545f06787e485f/README.md)：协议和后端责任边界。
13. DeepSeek-AI. [默认模型官方页](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash-1017)：模型身份与许可；平台自动加载示例不是本文实测。
14. vLLM. [官方说明，9d61ade](https://github.com/vllm-project/vllm/blob/9d61ade7f657833df27e43c4561455523c78c8fb/README.md)。
15. SGLang. [官方说明，访问日期快照](https://github.com/sgl-project/sglang/blob/main/README.md)；未固定提交，仅用于定位比较。
16. NVIDIA. [TensorRT-LLM 官方说明，af3e5eb](https://github.com/NVIDIA/TensorRT-LLM/blob/af3e5eb257ff49cf31cb8ce441d46aed585e902d/README.md)。

## 附录：阅读与使用说明

本文式 (1)–(10)、(12) 是报告解释／分析模型；式 (11) 是官方绘图代码的等价重写。所有精确性能表注明来源；图中未标注精确数值的点只描述趋势。没有将 GPU 图片曲线移作 Ascend 结果，没有将模型得分归因为引擎独立创新，也没有将官方经济自述当作成本核算。

原图来自固定提交的官方仓库，采用仓库根 Apache-2.0 许可并保留署名与 LICENSE；图像内容未修改。DeepInfer、模型、recipe 和各 vendor 的许可范围分别判断。报告的本地资料包包含 HTML、Markdown、原图及来源清单，不包含模型权重或未经核验的第三方安装包。
