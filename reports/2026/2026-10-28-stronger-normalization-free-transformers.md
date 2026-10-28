# Stronger Normalization-Free Transformers：Derf 如何替换归一化，以及它究竟强在哪里

这篇论文问的是一个具体的结构问题：Transformer 中依赖激活统计量的 LayerNorm / RMSNorm，能否由独立作用于每个元素的函数替代，并得到更好的任务结果？作者给出的方案是 **Dynamic erf（Derf）**。它保持张量形状，增加两个每层共享的可学习标量，用误差函数压缩激活，再做逐通道仿射变换。

本报告阅读 **arXiv:2512.10938v2（2026-03-31，22 页，含附录 A–F）**，并交叉核查作者代码。论文发表于 CVPR 2026，作者为 Mingzhi Chen、Taiming Lu、Jiachen Zhu、Mingjie Sun、Zhuang Liu。正式会议版页码为 27418–27428；下文页码、公式号、表号、图号均按实际阅读的 arXiv v2。研究与代码核验日期：2026-10-28。[论文与版本记录](https://arxiv.org/abs/2512.10938) · [完整原文](https://arxiv.org/html/2512.10938v2) · [CVPR 会议记录](https://openaccess.thecvf.com/content/CVPR2026/html/Chen_Stronger_Normalization-Free_Transformers_CVPR_2026_paper.html) · [作者代码](https://github.com/zlab-princeton/Derf)

## 1. 先给判断：值得做结构消融，尚不足以全面替代大模型归一化

最有说服力的贡献，是把“用一个 S 形函数代替归一化”的经验，推进为**函数性质实验 → 候选函数搜索 → Derf → 跨任务验证**的完整研究链。它在 ViT、DiT、语音预训练和 DNA 建模上取得一致的小幅收益；同时展示了更高的训练集损失与更好的下游表现，支持一种隐式正则化解释。

但应把结论限制在证据范围内：

- **语言建模没有超过 LayerNorm。** GPT-2 124M 的验证损失是 LN 2.94、DyT 2.97、Derf 2.94；没有给出更大语言模型、长上下文推理或指令任务结果。
- **归一化统计被去掉，不代表整网无归一化。** wav2vec 2.0 保留输入端 GroupNorm 和卷积特征提取器之后的 LayerNorm；注意力 Softmax 也没有被取消。
- **没有证明端到端训练或推理显著加速。** 附录 F 的自定义 Triton 单算子测试大体接近；15k 隐藏维度的前向均为 0.42 ms，反向 Derf 0.73 ms、LN 0.74 ms。
- **“泛化更好”是受实验支持的机制假说，不是定理。** 没有报告系统的多随机种子置信区间、分布外鲁棒性或大规模理论保证。

本报告建议：优先把 Derf 当作**从头训练时值得比较的结构选项**。对于已经训练好的 LN 模型，直接替换后保持权重不变，并不是论文验证的使用方式。

## 2. 问题建模：到底替换了什么计算

### 2.1 张量、未知参数与训练目标

以常见 Pre-LN Transformer 为说明对象，隐藏状态写成 $X\in\mathbb R^{B\times T\times C}$：$B$ 是批大小，$T$ 是 token 数，$C$ 是隐藏通道数。归一化或替代算子 $N$ 保持同一形状。下面的残差方程是本报告用于定位替换位置的标准写法，不是原文新增公式：

$$
U^{(l)}=X^{(l)}+\operatorname{Attn}_l(N_{l,a}(X^{(l)})),\qquad
X^{(l+1)}=U^{(l)}+\operatorname{FFN}_l(N_{l,f}(U^{(l)})).
$$

最终输出头前还可能有 $N_{\rm final}$。原文第 5 节将注意力前、FFN 前和最终归一化一一替换为 Derf，保留注意力、FFN 与残差路径；并非把 FFN 中的 GELU / SwiGLU 简单改名。

网络权重与替代层参数共同通过原任务损失训练。用监督分类举例，本报告写为：

$$
\min_{\Theta,\Psi}\;\frac{1}{n}\sum_{i=1}^{n}
\ell_{\rm CE}(F_{\Theta,\Psi}(u_i),y_i),\qquad
\Psi=\{\alpha_l,s_l,\gamma_l,\beta_l\}_{l}.
$$

这里 $u_i,y_i$ 是样本与标签，$\Theta$ 是其余网络参数；$\Psi$ 为所有 Derf 层参数。图像生成换成扩散训练目标，语言建模换成自回归 token 预测，语音和 DNA 则沿用相应模型的预训练目标。**作者没有另加一个“让激活服从高斯分布”的损失，也没有学习输入的均值方差估计器。**

### 2.2 LayerNorm：每个 token 内存在通道耦合

对单个 token 的 $x\in\mathbb R^C$，原文式（1）–（2）为：

$$
\mu(x)=\frac1C\sum_{k=1}^{C}x_k,\qquad
\sigma^2(x)=\frac1C\sum_{k=1}^{C}(x_k-\mu(x))^2,
$$

$$
\operatorname{LN}(x)_c=\gamma_c\frac{x_c-\mu(x)}{\sqrt{\sigma^2(x)+\epsilon}}+\beta_c.
$$

参数 $\gamma,\beta\in\mathbb R^C$ 可学习，统计量 $\mu,\sigma^2$ 则随当前 token 改变。某个通道变化会通过统计量影响其他通道。这需要沿归一化轴做 reduction；它不等于必须跨 GPU 同步，也不应把 BatchNorm 的小批次问题直接套给 LN。

RMSNorm 不减均值，标准关系可写为（本报告补充，并非原文式（1）的严格同式）：

$$
\operatorname{RMSNorm}(x)_c=
\gamma_c\frac{x_c}{\sqrt{C^{-1}\sum_k x_k^2+\epsilon}}.
$$

**原文阅读注意：**第 2 节称多种归一化服从一个“减均值再缩放”的统一范式，这对 RMSNorm 不能照字面套用。v1 图 1 图注还曾把 LN 的轴描述反了；v2 已改为“每个 token 沿通道轴归一化”，本报告使用正确的 v2 定义。[原文第 2 节](https://arxiv.org/html/2512.10938v2#S2)

### 2.3 从统计变换转为逐元素参数变换

DyT 的原文式（3）是：

$$
\operatorname{DyT}(x)_c=\gamma_c\tanh(\alpha x_c)+\beta_c.
$$

它用一个层内共享标量 $\alpha$ 控制输入尺度，用饱和函数抑制极端值。Derf 再引入共享位移 $s$ 并更换函数。一个元素的输出只依赖自身输入和已学习参数；训练时参数仍会从所有样本、token 获得梯度，但前向不计算当前激活的组统计量。

因此问题已转化为：**怎样选择函数形状及可学习变换，既避免训练不稳定，又提高验证性能？**搜索对象是函数设计，而非新的注意力连接方式。

## 3. 四种函数性质：证据是什么，不能外推成什么

原文第 3 节固定 ViT-Base / ImageNet-1K，用统一形式 $y=\gamma f(\alpha x)+\beta$（式（4））改造 tanh、erf、arctan，观察 top-1 与训练情况。这一阶段尚没有最终 Derf 的可学习位移 $s$。

<figure class="paper-figure" id="function-properties">
<a href="/assets/papers/stronger-normalization-free-transformers/activation_properties.svg" target="_blank" rel="noopener"><img src="/assets/papers/stronger-normalization-free-transformers/activation_properties.svg" alt="原文图2：零中心、有界、中心敏感与单调性的函数形状比较" width="1433" height="245" loading="lazy"></a>
<figcaption>原文图 2，arXiv v2：四类性质的对照示意。蓝色满足、红色不满足；这是性质示意，不是性能曲线。来源：Chen 等，Stronger Normalization-Free Transformers，<a href="https://arxiv.org/html/2512.10938v2#S2.F2">图 2</a>。原图权利归作者或相应权利人，本文作研究评论引用。</figcaption>
</figure>

### 3.1 零中心：轻微偏移可接受，大偏移容易失败

作者做横移与纵移，原文式（5）：

$$
f_{\rm horiz}(x)=f(x+\lambda_h),\qquad
f_{\rm vert}(x)=f(x)+\lambda_v.
$$

表 1 中，erf 横移 $\lambda_h=0$ 时为 82.6%，$+0.1$ 为 82.7%，$+1$ 降到 82.1%，$\pm2$ 均训练失败；纵移 $+1$ 为 81.6%。这支持“较接近零中心是良好起点”，却不能证明所有稳定网络必须严格奇对称。

尤其应区分 **函数形状的零中心** 与 **实际输出样本均值为零**：即使 $f$ 是奇函数，只要输入分布不对称或含偏置，输出均值也不必为零；最终 Derf 还有 $s$ 和 $\beta$，并未强制样本中心化。

### 3.2 有界性：压缩尾部有帮助，但不是收敛的必要条件

式（6）将无界函数裁剪：

$$
f_{\rm clip}(x)=\operatorname{clip}(f_u(x),-\lambda_u,\lambda_u).
$$

表 2 中，arcsinh 原版 82.2%，裁剪范围 $\lambda_u=1$ 或 2 时为 82.4%；线性函数原版失败，裁剪后可以训练。另一方面，arcsinh 和 logsign 本来就是无界且能够收敛，不能把“有界”宣布为数学必要条件。

作者还向有界函数中混入线性项。原文式（7）同时出现未下标的 $\lambda$ 和 $\lambda_b$；按文字的混合含义，本报告等价整理为：

$$
g(x)=(1-\lambda_b)f_b(x)+\lambda_b x,\qquad 0<\lambda_b<1.
$$

表 3 中 erf 从 82.6% 降为 $\lambda_b=0.01$ 时 82.4%、0.1 时 82.3%，0.5 时失败。表 4 的 logquad 是**所测函数族**中增长最快仍收敛者，不是证明了适用于一切网络的增长率上界。基函数有界也不保证整条残差流有界：残差累加、线性投影和可学习仿射参数仍可改变整体尺度。

### 3.3 中心敏感：不要把大量小激活直接压成零

作者在原点周围构造死区。把文字实验用标准数学形式重写为：

$$
g_\lambda(x)=
\begin{cases}
f(x-\lambda),&x>\lambda,\\
0,&|x|\le\lambda,\\
f(x+\lambda),&x<-\lambda.
\end{cases}
$$

这利用基函数 $f(0)=0$ 保持边界连续。表 5 中 erf 的准确率从无死区 82.6%，变为 $\lambda=1$ 时 82.1%、2 时 81.3%，3 时失败。小信号被压平后，局部梯度也消失，这是合理的解释；但这一干预还改变了整体函数形状，作者也承认难以完全独立隔离“中心敏感性”。

<figure class="paper-figure result-figure" id="center-sensitivity">
<a href="/assets/papers/stronger-normalization-free-transformers/center_sensitivity_training.png" target="_blank" rel="noopener"><img src="/assets/papers/stronger-normalization-free-transformers/center_sensitivity_training.png" alt="原文图7：不同中心死区宽度下的训练损失曲线" width="1467" height="950" loading="lazy"></a>
<figcaption>原文图 7，arXiv v2，附录 A：以 erf 为基函数，比较死区宽度对训练损失的影响，保留原始坐标和图例。<a href="https://arxiv.org/html/2512.10938v2#A1.F8">原文定位</a>。正文附录 A.2 引用“图 8”存在编号不一致，这里的中心敏感曲线按实际图注记为图 7。原图权利归作者或相应权利人，本文作研究评论引用。</figcaption>
</figure>

读图时比较相同步数附近的损失：较大的死区总体损失更高，与准确率下降相符。这是训练拟合受影响的证据，不是 Derf 相对 LN 的泛化曲线，也不能从这里推出某个死区宽度在所有模型中都会失败。

### 3.4 单调性：递增并非唯一可行方向

表 6 中，erf 与负 erf 分别为 82.6%、82.5%；tanh 与负 tanh 都为 82.5%。非单调的 sin、dampx、dampexp 分别为 81.6%、80.7%、81.2%。递增或递减都可以工作，所测非单调函数较差。

这些是有价值的设计倾向，但不是四条互相独立、必要且充分的公理。比如后续候选中的 cubsign 在原点导数为零、logquad 在零附近也是二次增长；“无有限宽死区”不等于“原点导数必须非零”。四条经验性质筛选出候选空间，却仍无法预测谁最好，因此还需要搜索。

## 4. 方法转换：从性质筛选到 Derf 及其梯度

### 4.1 搜索的是有限候选集，不是证明全局最优函数

原文第 4 节、表 7 和附录 B 构造 16 个候选，包括自然 S 形函数、基本函数变形、截断无界函数、比值饱和函数。每个都用式（8）加入同样的参数化：

$$
y_c=\gamma_c f(\alpha x_c+s)+\beta_c.
$$

在 ViT-B top-1 与 DiT-B/4、DiT-L/4 FID 上筛选。带位移的 erf 为 82.8% / 63.23 / 43.94，带位移 tanh 为 82.6% / 63.71 / 45.48。erf 在这个有限候选集与这些训练配置里最好；不存在对所有可用函数的穷举保证。搜索使用验证指标，也意味着独立任务与独立数据上的后续验证更重要。

注意表 7 的 tanh 含 $s$，不是主结果表中没有 $s$ 的标准 DyT；例如表 9 的 DyT-B/4 是 63.94，不能混用 63.71 来计算主实验增益。

### 4.2 Derf 的完整定义与参数维度

原文式（9）–（10）：

$$
\operatorname{erf}(z)=\frac{2}{\sqrt\pi}\int_0^z e^{-t^2}\,dt,
\qquad
\operatorname{Derf}(x)_c=\gamma_c\operatorname{erf}(\alpha x_c+s)+\beta_c.
$$

其中 $\alpha,s\in\mathbb R$ 是**每个替代层各自拥有、在该层所有 token 和通道间共享**的标量；$\gamma,\beta\in\mathbb R^C$ 是通道向量。输入输出仍是 $B\times T\times C$。若原层有完整仿射参数，Derf 有 $2C+2$ 个参数，比 LN 的 $2C$ 多 2 个；不能称完全零额外参数。DiT 的非仿射层与条件调制须按原架构处理，不能机械给每层都添加独立仿射向量。

“Dynamic”表示尺度与位移可学习，不表示每个新样本都重新估计统计量。其默认初始化为：

$$
\alpha_0=0.5,\quad s_0=0,\quad\gamma_{c,0}=1,\quad\beta_{c,0}=0.
$$

erf 与高斯 CDF 的标准关系是 $\operatorname{erf}(z)=2\Phi(\sqrt2z)-1$。使用高斯积分函数并不假设激活真的服从高斯，更不意味着自动把它变成标准正态。

### 4.3 为什么可能稳定：局部保留小信号，尾部饱和

以下为本报告对式（10）的求导，不是作者新增实验。令 $z_c=\alpha x_c+s$：

$$
\frac{\partial y_c}{\partial x_j}
=\mathbf1_{c=j}\,\gamma_c\alpha\frac{2}{\sqrt\pi}e^{-z_c^2},
\qquad
\frac{\partial y_c}{\partial s}=\gamma_c\frac{2}{\sqrt\pi}e^{-z_c^2},
\qquad
\frac{\partial y_c}{\partial\alpha}=\gamma_c x_c\frac{2}{\sqrt\pi}e^{-z_c^2}.
$$

这揭示三个机制：激活之间的直接 Jacobian 为对角结构；零附近有非零斜率；大输入被压到接近 $\pm1$，但梯度也随之接近零。默认初始化时，零点的输入斜率是 $1/\sqrt\pi\approx0.564$（本报告计算），而同样 $\alpha=0.5$ 的 DyT 为 0.5，说明即使初值相同，训练动态也不同。

位移 $s$ 把敏感中心移到 $x=-s/\alpha$（$\alpha\ne0$）；它可以轻微调整响应区域，过大则会让大量输入进入饱和区。论文实现没有将 $\alpha$ 强制为正，也没有为 $\gamma$ 施加符号约束。因此不能声称每个通道始终严格递增，或每层都具备固定的全局 Lipschitz 常数。

去掉 reduction 有工程吸引力，但 erf 的计算、参数梯度归约与 kernel 融合依然有成本。前向逐元素独立，并不等于反向完全无需归约：共享 $\alpha,s$ 和通道参数的梯度仍需汇总。

### 4.4 实际求解链与适配条件

| 阶段 | 输入 → 操作 → 输出 | 必须注意 |
|---|---|---|
| 定位归一化层 | 原架构 → 区分 Transformer 内部层、输入归一化与条件调制 → 替换清单 | 语音保留输入归一化，DiT 保留条件仿射语义 |
| 参数化 | 相同形状激活 → $\alpha x+s$ → erf → 通道仿射 | 广播轴、dtype、device、无仿射情形要匹配 |
| 初始化 | $\alpha=0.5,s=0,\gamma=1,\beta=0$ → 初始网络 | GPT-2 另搜 $\alpha$，不适用“一套初值全任务” |
| 任务训练 | 原始数据与损失 → 联合反向传播 → 已学习参数 | 这不是拟合一个 LN 输出的蒸馏问题 |
| 验证与部署 | 固定参数逐元素变换 → 原任务输出 | 测分布变化、饱和比例与端到端吞吐，不能只看函数 FLOPs |

## 5. 实验协议：比较是否公平，哪些设置会改变结论

主要结果来自作者训练，并非本报告重新训练复现。表中数据整理自原文第 6 节和附录 C–D；附录没有为所有模型提供完整随机种子、方差、总搜索 GPU 时或统一硬件型号，不能虚构统计显著性。

| 任务 / 模型 | 数据与指标 | 原文关键训练条件 |
|---|---|---|
| ViT-B / L | ImageNet-1K，top-1 越高越好 | 300 epoch；AdamW；LR 0.004；有效 batch 4096；20 epoch warmup；weight decay 0.05；EMA 0.9999 |
| ViT 正则化 | 同上 | label smoothing 0.1、mixup 0.8、cutmix 1.0、random erase 0.25；drop-path B 0.15 / L 0.5；AdamW $\beta_2$ 为 B 0.999 / L 0.95 |
| DiT-B/4、L/4、XL/2 | ImageNet-1K 生成，FID 越低越好 | 80 epoch；batch 256；AdamW；weight decay 0；三种 LR $10^{-4},2\times10^{-4},4\times10^{-4}$ 都试，报告各自最佳 |
| wav2vec 2.0 B / L | LibriSpeech，预训练验证损失 | 400k / 250k updates；LR $5\times10^{-4}$ / $3\times10^{-4}$；所有方法改用 FP32；保留两处输入相关归一化 |
| HyenaDNA / Caduceus | GRCh38 预训练，GenomicBenchmarks 子任务平均准确率 | 序列长度 1024 / 131072；batch 1024 / 8；10k / 50k steps；默认归一化 LN / RMSNorm |
| GPT-2 124M | OpenWebText，验证损失 | 300k iterations；上下文 1024；有效 batch 491520 tokens；AdamW LR $6\times10^{-4}$；梯度裁剪 1.0；BF16 |

四点可比性说明尤其重要：

1. **DiT 除函数替换外还有初始化差异。** 附录 C 明确保留 LN 模型的零初始化，对逐元素函数模型去掉零初始化。学习率搜索是各方法都做，但零初始化并不相同；结果反映适配后方案的收益，不能解释成“只替换一个算子、其余逐项一致”的严格因果实验。
2. **GPT-2 搜索了初始化。** attention 前的 $\alpha$ 在 $\{0.5,1,2,4\}$ 中尝试，其他层在 $\{0.1,0.3,0.5,1\}$ 中尝试。搜索开销需纳入复现预算。
3. **代码里还有 GPT-2 输入缩放。** 固定代码提交的 `language model/model_derf.patch` 在 DyT / Derf 分支为 token 与位置 embedding 之和增加可学习 `shared_scale`，初始化 $\sqrt C$；LN 分支不使用。这是源码核查所得的实现细节，论文实验摘要未充分强调，不应把 GPT-2 结果简单称作单层函数的孤立消融。[固定版本补丁](https://github.com/zlab-princeton/Derf/blob/2d068e910da7cd1938b3371f7132c42c6ea24e3d/language%20model/model_derf.patch)
4. **DNA 模型并非全部是标准 Transformer。** HyenaDNA 和 Caduceus 扩大了实验架构范围，但不应据此宣称已经证明所有 Transformer 或所有现代大模型都适用。

## 6. 真实结果对比：强在哪些任务，改善有多大

### 6.1 图像分类：稳定的百分点改善，不是数量级跃升

<figure class="paper-figure result-figure" id="vit-results">
<a href="/assets/papers/stronger-normalization-free-transformers/table08-vit.png" target="_blank" rel="noopener"><img src="/assets/papers/stronger-normalization-free-transformers/table08-vit.png" alt="原文表8截图：ViT-B和ViT-L的LN、DyT、Derf准确率比较" width="1455" height="234" loading="lazy"></a>
<figcaption>原文表 8 截图，arXiv v2 PDF 第 9 页；完整保留表格及原注，只去除周围无关正文。来源：<a href="https://arxiv.org/html/2512.10938v2#S6.T8">原文表 8</a>。原图权利归作者或相应权利人，本文作研究评论引用。</figcaption>
</figure>

| 模型 | LN | RMSNorm | GN | DyT | Derf | 相对 LN / DyT |
|---|---:|---:|---:|---:|---:|---|
| ViT-B | 82.3% | 82.4% | 82.5% | 82.5% | **82.8%** | +0.5 / +0.3 个百分点 |
| ViT-L | 83.1% | 83.0% | 83.1% | 83.6% | **83.8%** | +0.7 / +0.2 个百分点 |

RMSNorm 与 GN 来自附录表 22。两个尺度上方向一致，且收益不只来自“选了较弱 LN 基线”。但相对 DyT 的余量只有 0.2–0.3 个百分点，没有误差条时应保留随机性判断。原表把差值写成百分号，本报告明确改为**百分点**，避免与相对百分比混淆。

### 6.2 图像生成：FID 改善清楚，训练方案有适配

<figure class="paper-figure result-figure" id="dit-results">
<a href="/assets/papers/stronger-normalization-free-transformers/table09-dit.png" target="_blank" rel="noopener"><img src="/assets/papers/stronger-normalization-free-transformers/table09-dit.png" alt="原文表9截图：三个DiT模型的FID结果" width="1455" height="276" loading="lazy"></a>
<figcaption>原文表 9 截图，arXiv v2 PDF 第 9 页，保留全部模型及原注。来源：<a href="https://arxiv.org/html/2512.10938v2#S6.T9">原文表 9</a>。原图权利归作者或相应权利人，本文作研究评论引用。</figcaption>
</figure>

| 模型 | LN | RMSNorm | DyT | Derf | 比 LN 降低的 FID |
|---|---:|---:|---:|---:|---:|
| DiT-B/4 | 64.93 | 65.08 | 63.94 | **63.23** | 1.70 |
| DiT-L/4 | 45.91 | 45.02 | 45.66 | **43.94** | 1.97 |
| DiT-XL/2 | 19.94 | 20.76 | 20.83 | **18.92** | 1.02 |

对 DiT-L/4，$(45.91-43.94)/45.91\approx4.29\%$ 是本报告计算的相对 FID 下降，**不是图像质量提高 4.29%，也不是分类准确率改善**。不同模型的斜杠后数字对应不同 patch 配置，不应跨行把 FID 差额全归因于归一化方法。DyT 在 XL/2 上还比 LN 差，说明并非任意统计无关的 S 形函数都稳定占优。

### 6.3 语音与 DNA：收益跨域，但指标不能混说

| 任务 / 模型 | 默认 Norm | DyT | Derf | 原文来源与解释 |
|---|---:|---:|---:|---|
| wav2vec 2.0 Base | 1.95 | 1.95 | **1.93** | 表 10：预训练验证损失，非识别 WER |
| wav2vec 2.0 Large | 1.92 | 1.91 | **1.90** | 表 10：预训练验证损失，非识别准确率 |
| HyenaDNA | 85.2% | 85.2% | **85.7%** | 表 11：GenomicBenchmarks 子任务平均准确率，默认 LN |
| Caduceus | 86.9% | 86.9% | **87.3%** | 表 11：默认 RMSNorm；附录表 25 的 LN 为 87.0% |

这些结果说明方法不只对 ImageNet 搜索任务有效。但语音损失下降不自动等于下游识别 WER 改善；DNA 的子任务均值也不能说明每个子任务都改善。论文没有给出此处各子任务完整方差和最差任务表现。

### 6.4 语言建模：匹配 LN，优于 DyT

<figure class="paper-figure result-figure" id="language-results">
<a href="/assets/papers/stronger-normalization-free-transformers/table12-language.png" target="_blank" rel="noopener"><img src="/assets/papers/stronger-normalization-free-transformers/table12-language.png" alt="原文表12截图：GPT-2的Derf和LN验证损失均为2.94" width="1455" height="198" loading="lazy"></a>
<figcaption>原文表 12 截图，arXiv v2 PDF 第 10 页，保留持平结果及原注。来源：<a href="https://arxiv.org/html/2512.10938v2#S6.T12">原文表 12</a>。原图权利归作者或相应权利人，本文作研究评论引用。</figcaption>
</figure>

GPT-2 的 LN / RMSNorm / DyT / Derf 为 **2.94 / 2.95 / 2.97 / 2.94**（表 12、26）。这些是保留两位小数后的验证损失，不足以证明 Derf 严格优于 LN；与 RMSNorm 的 0.01 差距同样没有统计显著性证据。更大的模型、更长序列、不同 tokenizer 和预训练预算都尚待验证。

## 7. “泛化更强”如何得到：训练集损失证据与解释限度

作者第 6.1 节没有直接拿训练日志 loss 比较，而是训练结束后切到 evaluation 模式，在训练数据上重新测量。ViT 关闭 drop-path、mixup、cutmix、label smoothing 和增强，使用标准测试预处理，尽量排除随机正则化的即时影响。[原文第 6.1 节](https://arxiv.org/html/2512.10938v2#S6.SS1) · [附录 E](https://arxiv.org/html/2512.10938v2#A5)

<figure class="paper-figure result-figure" id="fitting-results">
<a href="/assets/papers/stronger-normalization-free-transformers/table13-fitting.png" target="_blank" rel="noopener"><img src="/assets/papers/stronger-normalization-free-transformers/table13-fitting.png" alt="原文表13截图：所有模型的evaluation模式训练损失均为Norm低于Derf低于DyT" width="1455" height="579" loading="lazy"></a>
<figcaption>原文表 13 截图，arXiv v2 PDF 第 10 页；保留全部模型、数值和图注。来源：<a href="https://arxiv.org/html/2512.10938v2#S6.T13">原文表 13</a>。原图权利归作者或相应权利人，本文作研究评论引用。</figcaption>
</figure>

例如 ViT-B 的训练集 loss 为 LN 0.2623、Derf 0.2681、DyT 0.2714，而验证准确率方向相反。作者观察到跨架构的 $L_{\rm train}^{\rm Norm}<L_{\rm train}^{\rm Derf}<L_{\rm train}^{\rm DyT}$，由此提出：Derf 相对 LN 的收益主要来自泛化，相对 DyT 则兼有更好的拟合。

这个解释合理，但应注意：

- 较高训练损失描述的是**这些训练配方得到的拟合结果**，不能严格证明函数类本身的表达能力更低；优化轨迹、尺度与超参数同样影响它。
- LN 在推理时仍使用当前输入的 token 统计量，并不是像 BatchNorm 一样简单“依赖保存的训练统计”。差异是**当前样本自适应的变换**与**训练后固定的逐元素映射**。
- DiT 只测前 100 个训练 batch 的 MSE，而非全训练集；附录 E 的预处理还包含随机水平翻转，因此不是所有架构都完全确定性评估。扩散损失与 FID 也不是同一个目标，不能直接做数值差来构造“泛化 gap”。
- GPT-2 的验证损失只持平，不能被“所有任务泛化都更好”的概括掩盖。尚缺 OOD、分布漂移、校准与多种子研究。

最稳妥的表述是：**训练拟合变差而部分验证指标变好，为隐式正则化假说提供了经验支持；具体因果机制尚未被充分隔离。**

## 8. 消融追踪：收益来自 erf，还是只是多了位移参数

### 8.1 加入位移有效，但不能解释所有优势

原文表 14：

| 基函数 | ViT-B 无 $s$ | 有 $s$ | DiT-B/4 FID 无 $s$ | 有 $s$ |
|---|---:|---:|---:|---:|
| erf | 82.6% | **82.8%** | 63.39 | **63.23** |
| tanh | 82.5% | **82.6%** | 63.94 | **63.71** |
| satursin | 82.4% | **82.6%** | 65.28 | **63.90** |
| arctan | 82.3% | **82.4%** | 67.41 | **67.07** |

即使同样加入 $s$，erf 仍优于 tanh；所以“多一个参数”不是完整解释。但 erf 无 $s$ 相对 tanh 无 $s$ 的 ViT-B 差距只有 0.1 个百分点，仍需关注方差。表 15 的 erf 标量与通道向量 $s$ 都是 82.8%，支持采用较简单的标量，不是证明向量位移在任何任务都无用。原文第 7.1 节一次将该对比误指向表 16，本报告按实际表注使用表 15。

### 8.2 tanh 近似 erf：值得补充一个重参数化疑问

原文式（11）用固定缩放来近似 erf：

$$
\min_{\varepsilon}\int_{-\infty}^{\infty}
\left|\tanh(\varepsilon x)-\operatorname{erf}(x)\right|\,dx,
\qquad \varepsilon\approx1.205.
$$

表 16 中，ViT-B 的 tanh / 缩放 tanh / erf 是 82.6% / 82.7% / 82.8%；DiT-L 为 45.48 / 45.13 / 43.94。简单缩放未追平 erf，支持具体形状有作用。

**本报告进一步分析：**如果层内 $\alpha$ 原本可以自由学习，那么 $\tanh(\varepsilon(\alpha x+s))=\tanh(\alpha'x+s')$，其中 $\alpha'=\varepsilon\alpha,s'=\varepsilon s$。固定缩放不扩大这一函数类，只改变初始化和优化的参数尺度；若缩放仅作用于输入，类似结论也成立。因此这个实验不能被解释成独立证明表达能力有差距。更有区分力的补充实验，是匹配初始斜率、有效位移和优化器参数尺度后再比较。

## 9. 效率原图：消除统计 reduction 的收益有多大

<figure class="paper-figure result-figure" id="runtime-results">
<a href="/assets/papers/stronger-normalization-free-transformers/forward_backward_new.svg" target="_blank" rel="noopener"><img src="/assets/papers/stronger-normalization-free-transformers/forward_backward_new.svg" alt="原文图13：DyT、Derf和LayerNorm单算子的前向与反向运行时间" width="711" height="280" loading="lazy"></a>
<figcaption>原文图 13，arXiv v2，PDF 第 22 页、附录 F：自定义 Triton kernel 的单层前向 / 反向耗时，横轴为隐藏维度（千），纵轴为毫秒。保留全部曲线及图例。来源：<a href="https://arxiv.org/html/2512.10938v2#A6.F13">原文图 13</a>。原图权利归作者或相应权利人，本文作研究评论引用。</figcaption>
</figure>

作者在相同 batch、序列长度以及可比精度、融合与访存条件下，测试多种隐藏宽度。曲线主要重合：前向与 LN 接近；反向小隐藏维度时 Derf 可能略慢，维度较大时略快；Derf 与 DyT 几乎一致。这比“逐元素一定快很多”的推论更保守，也更有实际价值。

| 隐藏维度 15k，表 27 | 前向 ms | 反向 ms |
|---|---:|---:|
| Derf | 0.42 | 0.73 |
| DyT | 0.42 | 0.73 |
| LN | 0.42 | 0.74 |

按表中舍入数，反向耗时下降 $(0.74-0.73)/0.74\approx1.35\%$，为本报告计算，量级很小且受舍入影响。不能据此声称端到端吞吐提升 1.35%，更不能把这一单层算子差额外推为全网显著加速。

论文未在该附录充分给出可复核的 GPU 型号、具体 batch / 序列值、kernel 版本、误差条和整网吞吐。若归一化只占总时间一小部分，局部收益还会被 Amdahl 效应稀释；相反，某些设备的 reduction 特别昂贵时也可能更受益，需实测。

## 10. 代码核查与复现：最容易遗漏的地方

已读取作者仓库固定提交 `2d068e910da7cd1938b3371f7132c42c6ea24e3d` 的 ViT、DiT Derf 实现和 GPT-2 补丁；这里只做代码审阅与论文数值核查，未重跑模型训练。仓库采用 MIT 许可证，论文 arXiv 版本使用 perpetual non-exclusive license；二者不能混称为“整篇论文 CC BY”。[固定代码树](https://github.com/zlab-princeton/Derf/tree/2d068e910da7cd1938b3371f7132c42c6ea24e3d) · [代码许可](https://github.com/zlab-princeton/Derf/blob/2d068e910da7cd1938b3371f7132c42c6ea24e3d/LICENSE)

### 10.1 实现确实简单，替换边界却需要逐模型确认

ViT 的 `Dynamic_erf` 定义了 `alpha`、`shift`、`weight`、`bias`，前向先调用 `torch.erf(alpha*x+shift)`，然后做通道仿射；支持通道在末尾和图像通道优先布局。递归转换器识别 `nn.LayerNorm`，用新建模块替换；**没有将旧归一化权重拷贝过去**。这与从头训练吻合，但不能当作预训练模型保持功能不变的转换器。[ViT 实现](https://github.com/zlab-princeton/Derf/blob/2d068e910da7cd1938b3371f7132c42c6ea24e3d/ViT/dynamic_erf.py)

DiT 版本额外保留 `elementwise_affine` 开关：原层不带仿射时只输出 erf，条件调制仍由模型处理。GPT-2 使用自定义 LayerNorm，不能期待 ViT 的通用递归函数识别所有替代类，需要按照补丁修改。[DiT 实现](https://github.com/zlab-princeton/Derf/blob/2d068e910da7cd1938b3371f7132c42c6ea24e3d/DiT/dynamic_erf.py)

实际工程中还要检查参数初始化的 device / dtype、checkpoint key、优化器对标量的 weight decay 策略、多轴 `normalized_shape` 与条件归一化。作者函数是可用起点，不能无条件视为所有模型的安全自动迁移工具。

### 10.2 建议按三层验证推进

1. **算子层：**验证前向数值、解析 / 自动梯度、广播轴及极大输入饱和；同时测 FP32 与 BF16 的误差、共享参数梯度 reduction，避免只用推理前向判断成本。
2. **小规模训练层：**在同一 ViT 配方对 LN、DyT、tanh+$s$、erf 无 $s$、完整 Derf 做比较，至少多个独立随机种子；记录训练失败比例、top-1 均值与标准差、eval-mode 训练损失。小数据或短训练只作为先导，不与论文完整 ImageNet 数字并列称复现成功。
3. **完整模型层：**锁定训练步数、数据顺序、增强、EMA、学习率搜索预算与初始化；复核论文主结果，再测吞吐、显存、总 GPU 时间及部署精度。DiT 同时做“原文各自适配设置”和“完全相同初始化”两组，区分工程效果与因果归因。

作者 ViT README 给出 PyTorch 2.5.1、timm 1.0.15 的环境示例；ViT-B 使用 4 节点×8 进程、每卡 batch 128，ViT-L 使用 8×8、每卡 batch 64，都得到有效 batch 4096。这是复现资源配置示例，不是本报告实际使用的硬件，也不是唯一可行配置；不同设备可用梯度累积保持有效 batch。[作者复现说明](https://github.com/zlab-princeton/Derf/blob/2d068e910da7cd1938b3371f7132c42c6ea24e3d/ViT/README.md)

### 10.3 最有价值的后续消融与压力测试

| 研究疑问 | 建议干预 | 应记录的证据 |
|---|---|---|
| erf 的形状是否比优化尺度更重要？ | 匹配初始局部斜率；重参数化 tanh；匹配 $s$ 与标量优化器设置 | 多种子准确率、早期梯度范数、收敛速度与最终 loss |
| 位移是否导致饱和或分布漂移敏感？ | 冻结 / 学习 / 限制 $s$，输入尺度乘 0.1–10 并加偏置 | $\alpha,s,\gamma$ 的层间分布、$|\alpha x+s|>3$ 的比例、验证退化 |
| 泛化解释是否成立？ | 调整增强、weight decay、数据量、label noise，对照 LN 与 Derf | eval-mode 训练指标、同目标验证指标、OOD 与校准误差 |
| GPT-2 持平依赖哪些附加设置？ | 输入 `shared_scale` 开关×归一化类型；相同初始化搜索预算 | 验证 NLL、训练失败率、训练成本；更大模型与长序列后再外推 |
| 去掉归约是否改善实际系统？ | 相同设备 / 精度 / 融合条件，对比 kernel 与整网 | 前向与反向时延、tokens/s、显存、功耗与编译成本 |
| 全替换是否必要？ | 只替换 attention 前、FFN 前、最终层，再组合 | 每处替换的边际收益与相互作用，避免盲目全替换 |

## 11. 研究价值与适用结论

这项工作最值得跟进的不是“erf 是新的万能激活”，而是：**统计归一化中的某些稳定训练作用，可以由简单参数化的逐元素压缩承担，而且在若干任务上获得更好的精度与泛化取舍。**它降低了结构复杂度，为逐元素 kernel、分布漂移分析和正则化机制研究提供了明确对象。

现有证据支持在 ViT、DiT 等从头训练模型中进行认真消融；对于大语言模型、预训练 checkpoint 迁移、完全无归一化的语音系统，以及端到端大幅提速，证据仍不足。真正有价值的下一步，是在匹配初始化与搜索预算后验证收益能否跨规模保持，同时解释为何在 GPT-2 上只持平、在视觉上却更明显。

## 参考资料、版本与图像说明

1. Chen, M. 等，**Stronger Normalization-Free Transformers**，CVPR 2026，27418–27428。[会议条目](https://openaccess.thecvf.com/content/CVPR2026/html/Chen_Stronger_Normalization-Free_Transformers_CVPR_2026_paper.html)
2. 实际精读版本：[arXiv v2 HTML](https://arxiv.org/html/2512.10938v2) / [PDF](https://arxiv.org/pdf/2512.10938v2)，2026-03-31，22 页，含附录 A–F。v1 为 2025-12-11；v2 修正 LN 轴描述，并包含本报告引用的计算成本附录，不把旧版内容误作最新证据。[版本记录](https://arxiv.org/abs/2512.10938)
3. 作者官方代码：[zlab-princeton/Derf](https://github.com/zlab-princeton/Derf)，本报告审阅提交 `2d068e910da7cd1938b3371f7132c42c6ea24e3d`。代码与论文的实现差异单独说明，未宣称跑通或复现训练。
4. 本文选取原文图 2、图 7、图 13 与表 8、9、12、13 的局部原始材料作研究评论。SVG / PNG 为原文资源；表格从 v2 PDF 截取，保留完整数值与原注。未重绘数据或删去不利结果。论文使用 arXiv perpetual non-exclusive license，原图版权仍属原权利人；这里不宣称开放再授权。完整原文及其他材料请从上述官方来源访问。
