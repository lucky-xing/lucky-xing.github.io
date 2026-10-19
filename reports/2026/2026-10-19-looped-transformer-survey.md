# Looped Transformer 科研调研报告：共享参数、潜在推理与自适应计算

日期：2026-10-19　｜　AI / 模型结构洞察分析　｜　文献综述与研究设计　｜　版本：1.0

## 摘要

循环式 Transformer（Looped Transformer）通过在深度方向重复应用共享参数模块，使计算深度不再与独立参数数量绑定。本报告围绕三个问题展开：重复计算为何能改善推理；参数节省能否转化为计算、缓存与延迟收益；如何使一个模型适应不同推理预算。依据 12 篇代表性论文的公开全文，报告建立统一的状态递推、训练和成本模型，比较固定循环、深度条件化、提前退出、token 路由、缓存复用以及潜在轨迹监督，并以受控算法任务、语言建模、数学推理和实际系统测量构成证据链。

现有证据支持：共享参数循环在部分任务上具有良好的参数效率，且通过专门训练可改善预算适应性；但循环本身不减少有效层执行次数，深度外推可能退化，KV cache 仍可能随循环数增长。不同研究的训练数据、输出预算和评分协议差异较大，不宜将跨论文分数合并为统一排名。本报告特别核对 MELT 的 2026 年 9 月修订版，区分全局共享缓存与局部逐轮缓存，并记录原文表格的内部不一致。报告不包含独立模型训练或第三方复现实验，结论限于可核实的文献证据与明确标记的分析推导。

**关键词：** 循环 Transformer；深度递归；参数共享；潜在推理；测试时计算；提前退出；KV cache

## 1. 研究范围与文献方法

### 1.1 术语与边界

本文的 LoopTransformer 指 Looped / Recursive / Recurrent-depth Transformer 架构族，不指某个同名个人代码仓库。其共同特征是沿计算深度复用权重并更新连续状态；具体实现可以循环一层、多个层组成的模块或模型的中间部分。Universal Transformer 提供早期代表性形式 [1]；可编程计算研究提供表达能力构造 [2]；随后研究扩展到语言模型训练、预算适应与工程实现。

“潜在推理”是更大的集合。Coconut 将末层隐藏状态作为后续连续输入，计算仍沿后续位置推进 [6]；共享骨干的深度循环则在同一组位置反复计算。二者可以结合，但不能混称。本文也不讨论“让普通聊天模型反复修改答案”的外部提示词循环。

### 1.2 文献纳入、来源与证据等级

本报告采用问题导向的代表性文献综述，不宣称完成 PRISMA 意义下的系统综述或覆盖所有最新预印本。检索使用 Looped Transformer、Recursive Transformer、recurrent depth、latent reasoning、adaptive computation 等关键词；优先选择直接提出结构、训练目标、受控实验或系统测量的一手论文。检索截止日为 2026-10-19。

| 编号 | 研究对象 | 本报告使用的全文版本 | 在证据链中的作用 |
|---|---|---|---|
| [1] | Universal Transformers | arXiv:1807.03819v3 | 深度递归和动态停止的基础 |
| [2] | Looped Transformers as Programmable Computers | arXiv:2301.13196v1；同时核对 ICML 2023 出版入口 | 构造性表达能力 |
| [3] | Reasoning with Latent Thoughts | arXiv:2502.17416v1 | 受控任务及模型归纳偏置 |
| [4] | Huginn / Recurrent Depth | arXiv:2502.05171v1 | 较大规模预训练与推理计算扩展 |
| [5] | Relaxed Recursive Transformers | arXiv:2410.20672v3 | 已有模型改造与深度专属 LoRA |
| [6] | Coconut | arXiv:2412.06769v4 | 连续思考的相关路线 |
| [7] | Mixture-of-Recursions（MoR） | arXiv:2507.10524v3 | token 路由、缓存与系统吞吐 |
| [8] | Ouro / LoopLM | arXiv:2510.25741v1 | 大规模训练、退出目标与外推边界 |
| [9] | LoopFormer | arXiv:2602.11451v1 | 预算条件化和轨迹一致性 |
| [10] | RLTT | arXiv:2602.10520v3 | 潜在轨迹的强化学习信号 |
| [11] | MELT | arXiv:2605.07721v3，2026-09-28 | 缓存复用、局部窗口与实测成本 |
| [12] | LOTUS | arXiv:2606.31779v2，2026-07-13 | 显式步骤对齐和潜在推理加速 |

使用固定版本是为保证引用可复核，不代表每一篇都是截止日最新修订版。公开 HTML 全文、公式与表格构成本报告的阅读依据；未逐一核对所有论文的正式会议版，也没有审计所有训练数据。原始文件校验值与解析版本记录在随报告提供的来源清单中。

本文将证据区分为：**构造性理论**（说明存在某类网络）、**受控实验**（隔离部分结构因素）、**跨模型比较**（展示实际能力但混合数据与训练因素）、**系统测量**（仅对给定硬件和软件成立）。下文的“作者结果”“原文疑点”“本报告推导”和“研究建议”分别标注。

## 2. 统一问题建模

### 2.1 输入、状态、输出与符号

任务是在前缀 $x_{1:n}$ 下估计下一个 token 的分布。训练集为 $\mathcal D$，词表为 $\mathcal V$，序列长度为 $n$。模型可以生成多个输出 token；每个生成位置内部又可以运行多轮。本文用 $i$ 表示 token 位置，用 $t$ 表示循环轮次，避免将两种“时间”混淆。

| 符号 | 含义与维度 | 是否已知 |
|---|---|---|
| $x_{1:n}$ | 输入 token，取值于 $\mathcal V^n$ | 训练／推理输入 |
| $H^{(t)}$ | 第 $t$ 轮隐藏状态，$\mathbb R^{n\times d}$ | 前向计算得到 |
| $B_\theta$ | 由 $k$ 个层组成的共享模块 | $\theta$ 待学习 |
| $T_i$ | 位置 $i$ 的执行轮数，整数 | 固定预算或策略决定 |
| $W$ | 输出头，按行向量约定为 $\mathbb R^{d\times |\mathcal V|}$ | 待学习／可能与嵌入绑定 |
| $q_\phi(t\mid x)$ | 恰好于第 $t$ 轮退出的概率 | 退出策略预测 |
| $C,M,\tau$ | FLOPs、内存字节数与实测时间 | 分别度量，不混作一个指标 |

隐藏状态和 logits 没有物理量纲；轮数为计数；交叉熵采用自然对数时单位为 nat/token。所有性能表中的百分数均遵循相应原文评价口径。

### 2.2 从普通深模型到共享循环

下面是**统一记号的等价重写**，对应 [3] §2 的 $(k\otimes T)$ 表达和 [8] 原文式 (1)，不是额外提出的新架构：

$$
H^{(0)}=E(x_{1:n}),\qquad H^{(t+1)}=B_\theta(H^{(t)};e_t),\qquad p_i^{(t)}=\operatorname{softmax}(H_i^{(t)}W). \tag{1}
$$

$e_t$ 为可选深度／步长条件，基础模型可以不用。主体参数数目主要取决于 $k$，有效层执行次数为 $kT$。每轮接收不同状态，因此共享参数不意味着每轮执行结果相同。因果语言模型的模块仍须满足因果掩码，不能因循环而获得未来 token。

<figure class="paper-figure" id="fig-architecture">
<a href="/assets/papers/looped-transformer-survey/latent-S1-F1-1.png" target="_blank" rel="noopener"><img src="/assets/papers/looped-transformer-survey/latent-S1-F1-1.png" alt="Saunshi 等原文图1：同参数、循环与同有效深度三种结构比较" loading="lazy"></a>
<figcaption>图 1．共享循环的比较框架。原图：[3] v1 Figure 1，CC BY 4.0；未修改图像。左侧为同参数浅模型，中间为重复执行共享模块，另一比较对象为同有效深度的非共享模型。注意图示的参数／FLOPs 比例主要描述主体层，不能替代完整训练和部署账单。<a href="https://arxiv.org/html/2502.17416v1#S1.F1">原文图注与定位</a>。</figcaption>
</figure>

### 2.3 学习目标与计算约束

固定轮数模型可以直接优化下一 token 交叉熵。为统一刻画自适应计算，本报告补充如下**研究问题形式**，并不声称所有论文都使用这个损失：

$$
\min_{\theta,\phi}\;\mathbb E_{x\sim\mathcal D,\,T\sim q_\phi}[\ell(x;\theta,T)]
\quad\text{s.t.}\quad \mathbb E[C(x,T)]\le C_{\max},\quad M(x,T)\le M_{\max}. \tag{2}
$$

对应的拉格朗日分析形式为任务损失加 $\alpha\mathbb E[C]$。降低平均轮数、缩小独立参数规模和减小缓存分别影响不同成本，不能相互替代。真实延迟还取决于核函数、访存、批大小和路由，因此 FLOPs 约束不能保证延迟约束。

主要假设是：训练和推理的状态接口一致；不同轮次允许共享参数；上下文信息在迭代中仍可访问；模型在目标预算附近受过训练。主要不确定性包括数据分布、初始化、优化随机性、采样和评分器误差；状态收敛不等于答案正确。

## 3. 方法分类与求解链

### 3.1 固定循环与持续注入输入

**求解链：** 输入前缀 → 嵌入／输入处理 → 共享模块运行若干轮 → 输出头 → 交叉熵训练。梯度在多个共享调用处累积；可以使用激活重计算或截断反向传播控制训练内存，但会改变算力消耗或梯度覆盖范围。

Huginn 将模型分为 prelude、recurrent core 与 coda。按 [4] §3.1 原文式 (1) 的意图整理为：

$$
e=P(x),\quad s_0\sim\mathcal N(0,\sigma^2I),\quad s_{t+1}=R_\theta(e,s_t),\quad p=C(s_T). \tag{3}
$$

每轮注入 $e$ 可为递归提供输入锚点。其训练使用变化的循环次数并限制反向传播覆盖的迭代区间，不能把它等同于“固定四轮、全展开反传”的所有循环模型。适用条件是状态更新可稳定训练；失败包括忽略递归、状态塌缩或增加迭代却不改进任务输出。

**原文记号说明：** [4] v1 HTML §3.1 的输出行写成 $R(s_r)$，但同段文字明确输出由 coda 处理。本报告使用 $C(s_T)$ 表达其文字定义，保留这一记号差异供复核。

### 3.2 已有模型改造：放松完全共享约束

直接把预训练模型首尾相接会改变层输入分布，无法保证有用递归。RRT [5] 从已有模型中构造共享模式，再以深度专属低秩修正保留分工。用统一记号概括为：

$$
W_t=W_{\rm shared}+A_tB_t,\quad A_t\in\mathbb R^{d_{out}\times r},\quad B_t\in\mathbb R^{r\times d_{in}},\quad r\ll\min(d_{in},d_{out}). \tag{4}
$$

**求解链：** 预训练权重 → 选择循环与初始化方式 → 共享骨干＋低秩适配 → 恢复训练 → 测量质量与成本。新增修正参数降低完全共享造成的约束，也意味着整体参数不再严格与轮数无关。其适用性需与同预算剪枝、蒸馏或较小非共享模型比较，不能只与原始大模型比较。

### 3.3 学习退出：从条件停止概率到离散分布

Ouro [8] §3.2–3.4 学习每轮停止概率，再在预训练后单独训练退出门。以下用 $\eta$ 表示部署阈值，避免与分布 $q$ 混淆：

$$
q_\phi(t\mid x)=\lambda_t(x)\prod_{j<t}(1-\lambda_j(x)),\qquad
T_{exit}=\min\{t:\sum_{s\le t}q_\phi(s\mid x)\ge\eta\}. \tag{5}
$$

有限深度实现必须处理最后一轮剩余概率质量，例如在最后轮强制停止；不能默认有限个 hazard 项自然加和为 1。原文算法也提供达到最大轮数后的兜底返回。

训练阶段 I 的目标为 [8] 原文式 (3)：

$$
\mathcal L_{I}=\sum_tq_\phi(t\mid x)\mathcal L_t-\beta H(q_\phi). \tag{6}
$$

熵项鼓励探索深度，**自身并不是线性的计算惩罚**。阶段 II 用停止梯度后的相邻轮损失改进作为门训练信号，对应原文式 (4)–(5)。输入真实标签只发生于训练，部署时根据状态预测退出；不能在推理中直接读取真实损失决定停不停。

**原文疑点：** [8] 式 (5) 使用当前轮门 $\lambda^{(t)}$，后续解释段落又写成 $\lambda^{(t-1)}$。复现时应核对代码中的对齐约定，不宜根据文字自行推断索引。本文不将二者静默视为完全一致。

### 3.4 预算条件化：LoopFormer 的不同长短轨迹

LoopFormer [9] §3 为每轮提供归一化进度 $u_{t-1}$ 和步长 $\Delta_t$，而非只改变执行次数：

$$
H^{(t)}=B_\theta(H^{(t-1)};u_{t-1},\Delta_t),\qquad
\sum_{t=1}^{T}\Delta_t=1. \tag{7}
$$

**求解链：** 同一训练样本 → 完整轨迹与随机较短轨迹 → 两种预测损失＋停止梯度的一致性目标 → 更新共享参数 → 部署时选择预算和步长。短路径也被训练为完成整个归一化过程，区别于仅在固定长路径中途截断。

其总目标在原文 §3.3 写为长轨迹损失、短轨迹损失和一致性损失的加权和；但正文称一致性对齐 logits，Algorithm 1 写的是隐藏状态平方距离。本文只采用两处共同支持的“长短轨迹自蒸馏”解释，精确复现前必须核对官方实现。该歧义会影响温度、归一化与损失尺度。

### 3.5 token 级路由：将计算分配给需要的位置

MoR [7] 的输入是当前位置状态，路由器决定是否继续进入共享模块；后续轮只对部分活动 token 执行计算，并结合选择性缓存或缓存共享。其创新组合是**参数共享＋计算选择＋执行组织**，不是单独加一个退出概率。

如果训练时仍为所有 token 完整计算所有轮，只在最终损失上模拟停止，则路由不会自动减少训练 FLOPs。推理实现也需要处理某些历史 token 没有较深缓存的情况。活动集合、容量限制、路由负载和连续深度批处理都会影响吞吐，必须按实际实现测量。

### 3.6 内部轨迹监督：RLTT 与 LOTUS

RLTT [10] §3 将中间轮次的预测分布纳入策略优化。它提供更直接的轮次监督，但“GRPO 只用最后轮输出”不意味着早期轮完全没有梯度：最终轮损失仍可沿递归图反传。改进机制应通过同预算消融与梯度诊断验证。

LOTUS [12] §3 使用预留潜在位置和显式 CoT 步骤对齐。**求解链：** 问题与潜在前缀 → 多轮潜在更新 → 训练时用步骤标签监督相关位置 → 结合答案预测训练 → 推理时直接利用潜在状态生成答案。它依赖推理步骤监督，不能据此声称“不需要 CoT 数据”。能从状态读出步骤也不等于读出的文字完整解释了因果计算。

## 4. 成本与稳定性：报告补充分析

### 4.1 参数、FLOPs 与缓存分别核算

设单个层有 $p$ 个主体参数，共享模块包含 $k$ 层，执行 $T$ 轮；$P_0$ 是非循环部分参数。忽略适配器时：

$$
P_{loop}\approx P_0+kp,\qquad P_{deep}\approx P_0+kTp. \tag{8}
$$

但在相同宽度、序列长度与注意力方式下，两者的主体层执行数均为 $kT$。因此，同有效深度的参数节省不等于 FLOPs 节省。输出头、门、额外监督前向以及训练反传都需要额外记账。

普通逐轮 KV 缓存的近似字节数为：

$$
M_{KV}\approx 2bBnkT h_{kv}d_h. \tag{9}
$$

其中 $b$ 是每元素字节数，$B$ 是批大小，$h_{kv}$ 为 KV 头数，$d_h$ 为每头维度；2 分别对应 K、V。该式排除分页、对齐、工作区和临时张量。量化与 GQA 会改变系数，不能仅按总参数量推测缓存。

**示例计算，非论文实验：** $b=2$、$B=1$、$n=32768$、$k=24$、$T=4$、$h_{kv}=8$、$d_h=128$ 时，式 (9) 为 12 GiB；$T=1$ 时为 3 GiB。这说明共享权重仍可能伴随显著缓存开销，不表示任何具体模型就采用这些配置。

### 4.2 MELT 的全局缓存与局部逐轮窗口

[11] v3 §3.2 使用门控状态更新，历史远端 token 共享缓存，最近 $w$ 个 token 保留每轮缓存。用本文统一符号给出**复杂度重写**：

$$
M_{MELT}=O\big(k[(n-w)_+ + T\min(n,w)]h_{kv}d_h\big). \tag{10}
$$

因此，当 $n\gg w$ 时主要长历史缓存不随 $T$ 增长，但局部窗口仍含 $Tw$ 项；不能说全部推理内存与 $T$ 严格无关。论文实验采用 $w=50$。其原文窗口复杂度段落有变量记号混用，本式按“每层、每 token、每循环”的文字定义重写，常数与工作区未计入。

### 4.3 为什么更多循环可能无益

将一次更新局部线性化，本报告得到：

$$
\delta H^{(T)}\approx J_{T-1}J_{T-2}\cdots J_0\,\delta H^{(0)},\qquad J_t=\frac{\partial B_\theta}{\partial H}\bigg|_{H^{(t)}}. \tag{11}
$$

该式用于解释扰动与梯度，不是某篇论文的收敛定理。雅可比连乘可能放大或衰减；残差、归一化、输入注入和深度条件会改变它。即便达到稳定不动点，也不保证该点对应正确答案。对上下文／深度条件化模型，不能直接套用单一自治系统的全局收敛结论。

### 4.4 评价目标应该是质量—成本前沿

对于输出长度 $m$、平均循环数 $\bar T$，递归部分的层调用量近似与 $mk\bar T$ 成正比。这是本报告的计算代理，不能替代测量。一个模型虽然输出更少 token，但每个 token 执行更多轮，总延迟可能上升；反过来，批处理与并行潜在位置也可能让更多 FLOPs 获得较低延迟。

建议比较 $Q(C)$、$Q(M)$、$Q(\tau)$ 三条前沿。只有相同质量约束下成本下降，或相同预算下质量提高，才能支撑对应的效率主张。

## 5. 实验设置与指标口径

### 5.1 代表性研究的可比性

| 研究 | 数据与规模 | 主要对照与指标 | 可支持的结论／限制 |
|---|---|---|---|
| [3] 受控推理 | 三位数多操作数加法、p-hop、符号 i-GSM；训练不使用显式推理链 | 同参数与同层执行预算；准确率 | 隔离深度需求较清楚，合成任务不能代表全部语言能力 |
| [4] Huginn | 3.5B 参数、800B token | 多循环预算、公开模型；PPL、数学／代码指标 | 说明十亿参数级可训练；跨模型的数据量与训练配方不完全相同 |
| [7] MoR | 135M–1.7B 范围 | 等数据／等训练 FLOPs，路由与缓存变体 | 支持其测试规模下的结构与系统组合收益 |
| [8] Ouro | 1.4B／2.6B，约 7.7T token | 固定深度、退出策略、较大模型；准确率／pass@k | 能力证据较广；独立参数量不代表等计算 |
| [9] LoopFormer | 去重 The Pile 子集，25B token | 不同循环／预算与共享基线；PPL 和 10 项平均准确率 | 可检验预算弹性；训练多轨迹开销须另计 |
| [10] RLTT | Ouro-Thinking 上的数学后训练 | 与 GRPO／SFT 比较，固定任务预算 | 提供同骨干训练方法对照；不能与长输出协议跨论文排序 |
| [11] MELT v3 | Ouro 权重适配；32K 样本，8×H100 80GB、90 小时 | 32K 最大输出、LightEval 0.8.1；能力与缓存／速度 | 适配训练约 720 GPU-hour；继承的预训练成本不包含在内 |
| [12] LOTUS | 多个语言模型骨干，步骤监督 | 显式 CoT、连续潜在基线；任务准确率与分阶段延迟 | 依赖具体潜在预算、硬件与监督数据 |

上表均是原文设置摘要，硬件信息未在本报告逐项抽取的工作不猜测。不同论文中“同 FLOPs”有时是层数代理，有时是总训练预算，需要回到各自附录核算。

### 5.2 指标定义

交叉熵平均为 $\bar\ell$ 时，困惑度 $\mathrm{PPL}=\exp(\bar\ell)$；只有 tokenizer、数据及归约方式一致时才适合比较。准确率的“百分点差”与相对提升率应区分。

生成代码常用的 pass@k 无偏估计形式为：

$$
\widehat{\mathrm{pass@}k}=1-\frac{\binom{N-c}{k}}{\binom{N}{k}}, \tag{12}
$$

$N$ 为采样数，$c$ 为通过样本数，需满足估计条件。不同论文可能使用不同采样／汇总方式，不能把 pass@10 当作单次回答准确率。

TTFT 指首 token 延迟；decode tok/s、端到端吞吐、峰值显存和总生成时间应分别报告。长推理还应统计被长度截断比例、答案抽取失败比例及质量随预算的曲线。若原文“±”的统计含义未明确核实，则保留符号，不擅自解释成 95% 置信区间。

## 6. 原文结果与证据分析

### 6.1 受控任务：额外深度的确可以代替部分独立参数

下表摘取 [3] v1 Table 1 的 32 个三位数操作数加法结果。训练覆盖的操作数数量为 2、4、8、16、32，不能把 32 项结果称作未见长度泛化。

| 结构 | 主体参数比例 | 层执行计算比例 | 准确率（%） |
|---|---:|---:|---:|
| 普通 2 层 | 2× | 2× | 38.8 |
| 2 层循环 6 次 | 2× | 12× | 99.5 |
| 普通 12 层 | 12× | 12× | 100.0 |

**作者结果：** 循环模型在该任务上接近同有效深度基线。**本报告判断：** 该结果支持“计算深度重要且可复用”，但不能证明循环在同算力下普遍优于非共享深模型。

<figure class="paper-figure" id="fig-scaling">
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:12px">
<a href="/assets/papers/looped-transformer-survey/latent-S3-F3-1.png" target="_blank" rel="noopener"><img src="/assets/papers/looped-transformer-survey/latent-S3-F3-1.png" alt="原图3子图：验证困惑度随有效深度变化" loading="lazy"></a>
<a href="/assets/papers/looped-transformer-survey/latent-S3-F3-2.png" target="_blank" rel="noopener"><img src="/assets/papers/looped-transformer-survey/latent-S3-F3-2.png" alt="原图3子图：闭卷问答随有效深度变化" loading="lazy"></a>
<a href="/assets/papers/looped-transformer-survey/latent-S3-F3-3.png" target="_blank" rel="noopener"><img src="/assets/papers/looped-transformer-survey/latent-S3-F3-3.png" alt="原图3子图：开卷问答随有效深度变化" loading="lazy"></a>
<a href="/assets/papers/looped-transformer-survey/latent-S3-F3-4.png" target="_blank" rel="noopener"><img src="/assets/papers/looped-transformer-survey/latent-S3-F3-4.png" alt="原图3子图：token准确率随有效深度变化" loading="lazy"></a>
<a href="/assets/papers/looped-transformer-survey/latent-S3-F3-5.png" target="_blank" rel="noopener"><img src="/assets/papers/looped-transformer-survey/latent-S3-F3-5.png" alt="原图3子图：数学文字题随有效深度变化" loading="lazy"></a>
<a href="/assets/papers/looped-transformer-survey/latent-S3-F3-6.png" target="_blank" rel="noopener"><img src="/assets/papers/looped-transformer-survey/latent-S3-F3-6.png" alt="原图3子图：基础任务随有效深度变化" loading="lazy"></a>
</div>
<figcaption>图 2．任务类型与深度缩放。完整展示 [3] v1 Figure 3 的六个原始子图，CC BY 4.0；图像未改动，以响应式网格重新排布。原图比较非共享深度缩放与循环缩放。各图的指标和纵轴不同，应分别阅读，不能把曲线垂直距离当作统一提升百分比。<a href="https://arxiv.org/html/2502.17416v1#S3.F3">原文图注与实验说明</a>。</figcaption>
</figure>

**读图观察：** 各子图的循环曲线与非共享基线响应不同，在这些同有效深度比较中，循环模型仍存在明显质量差距。由于循环模型使用更少独立参数，该图适合分析参数与深度的取舍，不能单凭它声称循环更会利用知识；[3] 对等困惑度的相关分析位于另一个 Figure 2。**代价与残留问题：** 图不能隔离所有训练优化因素，也不能据曲线声称统一 SOTA，或断言循环增加了事实存储容量。

### 6.2 深度外推：Ouro 的反例

[8] v1 Table 10 的 Ouro-1.4B base 在 MMLU 5-shot 下：

| 循环轮数 | 1 | 2 | 3 | 4 | 5 | 8 |
|---|---:|---:|---:|---:|---:|---:|
| MMLU（%） | 41.21 | 60.43 | 66.71 | 67.45 | 66.64 | 64.49 |

4→8 轮下降 **2.96 个百分点**，由表中 67.45−64.49 自行计算。主训练最终使用四轮；更深执行属于外推。它说明可执行深度与有效深度不同，不否定通过额外训练获得预算适应性的可能性。

### 6.3 预算弹性：LoopFormer 并非在所有预算都胜出

[9] v1 Table 1，主体模块三层，最大八轮：

| 推理层执行预算 | 模型 | Pile PPL ↓ | 10 项平均准确率（%）↑ |
|---|---|---:|---:|
| 24× | 普通 24 层 | 9.49 | 45.27 |
| 24× | 普通共享循环，3×8 | 10.91 | 42.88 |
| 24× | LoopFormer，3×8 | 10.28 | 44.81 |
| 12× | 普通 12 层 | 9.98 | 44.93 |
| 12× | LoopFormer，3×4 | 11.12 | 43.73 |
| 6× | 普通 6 层 | 11.13 | 42.73 |
| 6× | 朴素提前退出，3×2 | 12.61 | 40.97 |
| 6× | LoopFormer，3×2 | 14.30 | 40.36 |

**作者结果：** 专门训练可以改善部分预算的共享模型表现。**本报告判断：** 24× 下仍有非共享基线差距，6× 下也不能声称全面优于朴素提前退出。层执行预算不是包含双轨迹训练的端到端训练 FLOPs。

<figure class="paper-figure" id="fig-cka">
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px">
<a href="/assets/papers/looped-transformer-survey/loopformer-S4-F5-1.png" target="_blank" rel="noopener"><img src="/assets/papers/looped-transformer-survey/loopformer-S4-F5-1.png" alt="LoopFormer原图5a：LoopFormer轮次表示的CKA相似度" loading="lazy"></a>
<a href="/assets/papers/looped-transformer-survey/loopformer-S4-F5-2.png" target="_blank" rel="noopener"><img src="/assets/papers/looped-transformer-survey/loopformer-S4-F5-2.png" alt="LoopFormer原图5b：Base-Loop-EE-Cons的CKA相似度" loading="lazy"></a>
<a href="/assets/papers/looped-transformer-survey/loopformer-S4-F5-3.png" target="_blank" rel="noopener"><img src="/assets/papers/looped-transformer-survey/loopformer-S4-F5-3.png" alt="LoopFormer原图5c：TMLT-EE的CKA相似度" loading="lazy"></a>
</div>
<figcaption>图 3．不同共享模型跨轮次表示的 CKA 相似度。[9] v1 Figure 5 的全部三个原始子图，CC BY 4.0；仅重新排布，未修改色标、坐标或数据。CKA 度量表示相似性，不能直接当作准确率或因果解释。<a href="https://arxiv.org/html/2602.11451v1#S4.F5">原文完整图注</a>。</figcaption>
</figure>

**读图观察：** 对照的后续轮次更相似，LoopFormer 保持了更明显的轮次差异。**解释边界：** 表示仍在变化不意味着变化有益；须结合上表的任务结果。该分析是相关性诊断，不是对推理机制的因果证明。

### 6.4 MELT：显存收益与速度代价同时存在

[11] v3 Table 3 与 Appendix D Table 10，单张 H100、200-token 提示、32K-token 生成条件下：

| 模型 | 峰值显存（原文 GB） | KV 缓存（原文 GB） | decode tok/s |
|---|---:|---:|---:|
| Ouro-1.4B-Thinking | 26.58 | 23.71 | 13.5 |
| MELT-1.6B | 9.23 | 5.96 | 8.5 |
| Qwen3-1.7B | 6.74 | 3.30 | 41.6 |

报告计算：Ouro/MELT 峰值显存比为 $26.58/9.23\approx2.88$，KV 比为 $23.71/5.96\approx3.98$；MELT 相对 Ouro 的解码吞吐比为 $8.5/13.5\approx0.63$。因此，这组实现展示了显著缓存节省，但**没有展示单流解码加速**。不同模型的注意力头共享、参数量和执行实现亦不相同。

**原文内部不一致：** Table 3 的 Max batch 列给 Ouro/MELT 为 11/3，Table 10 则为 3/11；后者与更低单样本显存的直觉一致，但本文不据此替作者修正。最大批量结论留待官方代码或作者澄清。原文 GB 单位沿用，不转换成 GiB。

<figure class="paper-figure" id="fig-melt">
<a href="/assets/papers/looped-transformer-survey/melt-S0-F1-1.png" target="_blank" rel="noopener"><img src="/assets/papers/looped-transformer-survey/melt-S0-F1-1.png" alt="MELT v3原图1左：AIME26准确率与KV缓存内存的关系" loading="lazy"></a>
<a href="/assets/papers/looped-transformer-survey/melt-S0-F1-2.png" target="_blank" rel="noopener"><img src="/assets/papers/looped-transformer-survey/melt-S0-F1-2.png" alt="MELT v3原图1右：共享缓存跨循环更新示意" loading="lazy"></a>
<figcaption>图 4．缓存节省如何影响受内存限制的推理。[11] v3 Figure 1 的左右两幅原图，CC BY-NC-SA 4.0；未修改图像，分上下展示。左图横轴实际标为 KV Cache Memory，纵轴为 AIME26 pass@1；原图注称总内存，二者存在口径差异，本报告按坐标轴解释为 KV 缓存前沿，右图解释共享缓存的更新；右图为高层示意，不能据此忽略正文说明的最近 50-token 逐轮窗口。<a href="https://arxiv.org/html/2605.07721v3#S0.F1">原文完整图注与来源</a>。</figcaption>
</figure>

**读图解释：** 固定内存时，可允许的生成长度因模型而异，因此前沿反映“缓存结构＋可用输出预算”的联合效果，不是固定输出长度的纯结构准确率对照。**残留错误：** 模型仍有非零错误率；曲线没有给出独立训练重复的全部不确定性。所示收益不等于任何硬件上的固定倍率加速。

能力方面，v3 Table 1 的 MATH-500 为 Ouro 94.4±1.0、MELT 93.4±1.1，HumanEval+ 为 76.8±3.3、84.8±3.0。不同任务存在取舍，且这个版本使用 HumanEval+，不能沿用旧版的 HumanEval 命名和旧版数字。

### 6.5 RLTT 与 LOTUS：训练信号和潜在并行值得分开验证

[10] v3 Table 2 的同骨干对照中，Ouro-2.6B 的 MATH-500 为 base 75.6、GRPO 79.0、RLTT 86.0；这是该论文的受限输出预算和确定性评分协议。Table 9 的逐轮测试又报告 GRPO 71.6、RLTT 86.0。**本文不把两个表中的 GRPO 基线混用**；如果复现，应核实附录测试配置的差异。不能把 86.0 与 [11] 的长输出 MATH-500 分数直接比较并判断谁更强。

[12] v2 Table 2，GSM8K、Llama-3.2-3B-Instruct、单张 H100 NVL、batch=1、greedy：

| 阶段 | LOTUS（ms/样本） | 显式 CoT（ms/样本） |
|---|---:|---:|
| 问题预填充 | 16.7 | 15.9 |
| 思考 | 133.0 | 338.8 |
| 答案 | 31.5 | 29.5 |
| 合计 | 181.2 | 384.2 |

报告计算：思考阶段加速 $338.8/133.0\approx2.55$ 倍，整体为 $384.2/181.2\approx2.12$ 倍。其加速利用了潜在位置的并行处理，不代表所有共享循环模型都能获此收益，也不是原生任意预算推理的证明。

## 7. 综合评价：哪些结论已经成立

| 命题 | 文献支持程度 | 依据与边界 |
|---|---|---|
| 某些算法任务需要深度但不需要同等增长的独立参数 | 较强 | [2] 构造＋[3] 受控实验；不等于所有语言任务 |
| 循环提高部分推理任务的参数效率 | 较强 | 同参数实验与大规模能力结果；需计入多轮计算 |
| 循环自动减少 FLOPs 或端到端延迟 | 不成立为一般命题 | 结构本身增加重复计算；[11] 实测存在速度代价 |
| 推理时无限增加轮数会持续提升能力 | 缺乏支持 | [8] 给出深度外推下降；[9] 需要专门预算训练 |
| 权重共享自动使 KV cache 恒定 | 不成立 | [11] 针对缓存单独修改，v3 仍有局部逐轮缓存 |
| 潜在状态能读出文字即证明因果忠实 | 不充分 | 可读出信息与实际决策路径并不等价 |
| 新 scaling 轴已经取代参数与数据 scaling | 证据不足 | 缺少覆盖广泛规模、预算和数据的统一等成本比较 |

本文的判断是：这一方向已有超越概念演示的实证基础，但其最可靠优势首先是参数利用效率。能否成为更好的系统方案，取决于训练稳定性、预算泛化、缓存策略和执行引擎的联合优化。

## 8. 复现方案、消融与压力测试

本节全部为**本报告提出的研究设计**，不是上述论文已经完成的实验。

### 8.1 最小可行实验矩阵

先固定 tokenizer、训练文本、数据顺序、上下文长度、输出评分器及精度，至少设置三种对照：同主体参数浅模型、共享循环模型、同有效深度非共享模型。分别执行“同训练 token”与“同训练 FLOPs”两套实验，不能以同 token 冒充同预算。

| 组别 | 设置 | 要回答的问题 |
|---|---|---|
| A | $k$ 层，1 轮 | 同参数的基础能力 |
| B | $k$ 层，$T$ 轮 | 增加重复计算的收益 |
| C | $kT$ 层，非共享 | 同有效深度下共享是否损失质量 |
| D | B＋轮次／步长条件 | 差异来自可感知深度还是更多计算 |
| E | D＋长短轨迹训练 | 预算变化是否依然稳健 |
| F | E＋学习退出／token 路由 | 是否获得实际平均计算下降 |
| G | F＋缓存复用 | 显存收益与准确率／速度取舍 |

资源受限时先采用小型 decoder 验证；规模、层数、训练量应由预算反推，而非复制一个未经估算的十亿参数配方。使用已有模型改造时补充同成本蒸馏或剪枝基线，计入教师训练／推理成本和恢复训练成本。

### 8.2 数据与评价

受控任务选择多操作数加法、多跳关系和带组合规则的符号任务；训练长度与外推长度分开，保留未见关系组合。语言建模使用固定去重验证集；数学和代码使用固定题目版本、答案抽取器、测试用例及解码预算。至少运行 3 个训练随机种子作为起点；正式统计需结合方差和预算确定样本量。

每个设置报告质量均值与离散度、训练 FLOPs 与 GPU-hour、平均／P95 循环次数、输出 token 数、截断率、峰值显存、KV 大小、TTFT、单流与并发吞吐。记录软件提交、GPU、驱动、编译和核函数版本。模型加载后的权重显存不能冒充总运行峰值。

### 8.3 决定性的消融与失败判据

1. **深度泛化：** 训练允许的预算内与预算外分别扫轮数，绘制准确率、PPL 和延迟；出现性能下降即否定“单调改善”的强主张。
2. **退出可靠性：** 比较固定深度、随机预算、状态差阈值、预测分布变化和学习门；比较同平均 FLOPs 下的质量，并检查错误高置信样本。
3. **潜在监督：** 最终轮损失、各轮同权重损失、轨迹加权目标分别训练；匹配额外输出头前向与训练预算。
4. **缓存：** 逐轮缓存、仅最终缓存、门控共享、共享＋局部窗口；同时扫窗口长度和长上下文，不能只测短提示。
5. **因果作用：** 在中间轮施加匹配幅度的状态替换／扰动，检查答案改变与被读出的步骤是否一致；使用随机子空间等对照排除通用扰动效应。
6. **执行收益：** 同一硬件测 batch=1 与多并发；若路由节省理论 FLOPs 却增加延迟，应报告调度开销而不是仅报理论速度。

### 8.4 优先研究方向

**优先一：预测额外一轮的收益。** 将“何时停止”从状态是否变化转成继续计算的期望质量收益与延迟代价，重点测试分布外可靠性。

**优先二：稳定的多预算状态接口。** 比较输入注入、深度适配、步长条件和轨迹一致性，衡量它们对预算内与预算外泛化的不同作用。

**优先三：缓存与路由协同。** 深度不一致的历史 token 如何被检索、何时保留局部逐轮状态，必须和执行系统一起设计。

**优先四：把内部可解释性转化成可检验假设。** 潜在读出只是观测工具；能否预测失败、指导干预、改善训练，才是进一步的研究价值。

## 9. 结论

Looped Transformer 为模型提供了独立于参数规模的计算深度调节方式。理论构造和受控实验解释了它为何适合部分迭代任务，较大规模语言模型说明了可训练性，预算条件、轨迹监督和缓存复用则在补齐实际使用条件。

现阶段最稳妥的结论是：共享循环可以节省独立权重并改善部分推理任务，但能力、FLOPs、显存和时间必须分开验证；训练过的预算变化和任意增加深度也必须区分。未来工作的有效验收标准应是统一预算下的质量—成本前沿，以及可复核的稳定性和失败边界。

## 参考文献

以下均为一手论文或正式出版入口。编号对应正文，访问日期均为 2026-10-19。具体解析版本、全文校验值和图像来源另见[来源清单](/assets/papers/looped-transformer-survey/README.md)。

1. Dehghani M, et al. **Universal Transformers**. arXiv:1807.03819, 2018. [全文](https://arxiv.org/html/1807.03819v3)；[论文记录](https://arxiv.org/abs/1807.03819)。
2. Giannou A, Rajput S, Sohn J-Y, et al. **Looped Transformers as Programmable Computers**. ICML 2023, PMLR 202:11398–11442. [正式出版页](https://proceedings.mlr.press/v202/giannou23a.html)；[全文](https://arxiv.org/html/2301.13196v1)。
3. Saunshi N, Dikkala N, Li Z, Kumar S, Reddi S J. **Reasoning with Latent Thoughts: On the Power of Looped Transformers**. arXiv:2502.17416v1, 2025. [全文](https://arxiv.org/html/2502.17416v1)。
4. Geiping J, McLeish S, Jain N, et al. **Scaling up Test-Time Compute with Latent Reasoning: A Recurrent Depth Approach**. arXiv:2502.05171v1, 2025. [全文](https://arxiv.org/html/2502.05171v1)；[官方代码](https://github.com/seal-rg/recurrent-pretraining)。
5. Bae S, et al. **Relaxed Recursive Transformers: Effective Parameter Sharing with Layer-wise LoRA**. arXiv:2410.20672; ICLR 2025. [全文](https://arxiv.org/html/2410.20672v3)；[正式出版入口](https://proceedings.iclr.cc/paper_files/paper/2025/hash/54d6a55225cebbdc16fbb0e45c5bdf2b-Abstract-Conference.html)。
6. Hao S, Sukhbaatar S, Su D, et al. **Training Large Language Models to Reason in a Continuous Latent Space**. arXiv:2412.06769. [全文](https://arxiv.org/html/2412.06769v4)；[官方代码](https://github.com/facebookresearch/coconut)。
7. Bae S, Kim Y, Bayat R, et al. **Mixture-of-Recursions: Learning Dynamic Recursive Depths for Adaptive Token-Level Computation**. arXiv:2507.10524v3, 2025. [全文](https://arxiv.org/html/2507.10524v3)。
8. Zhu R-J, Wang Z, Hua K, et al. **Scaling Latent Reasoning via Looped Language Models**. arXiv:2510.25741v1, 2025. [全文](https://arxiv.org/html/2510.25741v1)；[作者项目页](https://ouro-llm.github.io/)。
9. Jeddi A, Ciccone M, Taati B. **LoopFormer: Elastic-Depth Looped Transformers for Latent Reasoning via Shortcut Modulation**. arXiv:2602.11451v1, 2026. [全文](https://arxiv.org/html/2602.11451v1)。
10. Williams J, Tureci E. **Prioritize the Process, Not Just the Outcome: Rewarding Latent Thought Trajectories Improves Reasoning in Looped Language Models**. arXiv:2602.10520v3, 2026. [全文](https://arxiv.org/html/2602.10520v3)；[官方代码](https://github.com/jonwill8/RLTT)。
11. Conchello Vendrell V, Padrés Masdemont A, Grillo N, et al. **Memory-Efficient Looped Transformer: Decoupling Compute from Memory in Looped Language Models**. arXiv:2605.07721v3, 2026-09-28. [全文](https://arxiv.org/html/2605.07721v3)。
12. Fan Y, Svete A, Lee K. **Bridging the Gap Between Latent and Explicit Reasoning with Looped Transformers**. arXiv:2606.31779v2, 2026-07-13. [全文及作者信息](https://arxiv.org/html/2606.31779v2)。

## 附录：版本与使用说明

本报告的数学式 (1)、(3)–(7) 是对各方法的统一记号整理，并在正文指出原文位置；式 (2)、(8)–(12) 及示例成本计算为报告分析，不是新增实验结果。所有结果表都注明原文表号；未进行跨论文统计合并。

图 1、2 引自 [3]，图 3 引自 [9]，采用 CC BY 4.0；图 4 引自 [11]，采用 CC BY-NC-SA 4.0，原图及其转载遵守非商业和相同方式共享条款。图像所有权归原作者；许可不延伸到其他第三方商标或素材。本站研究文字与论文图像的许可范围分别判断。完整原图子图未裁切，不改变不利数据、坐标或色标，重新排布已在图注说明。

报告补充了先前口头综述未覆盖的版本差异和负面证据：MELT v3 的局部逐轮窗口、较慢单流解码及 Max batch 表格矛盾；LoopFormer 最低预算下的性能限制；RLTT 主表与逐轮表的不同基线。这些差异应在后续引用时保留。
