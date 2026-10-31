# TaperNorm：门控移除归一化与 Pre-Norm Transformer 的尺度锚定

这篇论文最值得研究的，不只是“归一化能否删掉”，而是：**为什么内部归一化可以被静态映射替代，最终输出归一化却往往更难删除？**作者用 TaperNorm 实现平滑移除，再通过输出处的径向梯度分析解释二者的区别，并提出固定目标尺度损失作为另一种锚定方式。

实际精读版本：**Gated Normalization Removal and Scale Anchoring in Pre-Norm Transformers，arXiv:2602.10408v2，2026-05-19，15 页，含附录 A–D**。作者为 Andrei Kanavalau、Carmen Amo Alonso、Sanjay Lall，来自 Stanford。当前官方条目未给出已接收会议或期刊信息，本文按预印本分析，不自行补造发表状态。[版本记录](https://arxiv.org/abs/2602.10408) · [v2 全文](https://arxiv.org/html/2602.10408v2) · [v2 PDF](https://arxiv.org/pdf/2602.10408v2)

v1 的题目是 *Gated Removal of Normalization in Transformers Enables Stable Training and Efficient Inference*。v2 不仅换题目，还把效率证据改为 **带 KV cache 的解码微基准，融合后最高 1.18× 吞吐**。不要混用 v1 无 KV cache、last-token logits 模式的 1.22× 数字。研究核验日期：2026-10-31。

## 1. 研究结论与证据强度

这项工作给出了一条清楚的研究链：标准 Pre-Norm 网络 → 全局门控插值 → warmup 期间校准静态分支 → 内部归一化移除 → 观察最终层移除失败 → 用输出尺度的径向梯度解释 → 引入固定目标辅助损失。

主要结论应分成三个层次：

- **较强的局部数学结论：**理想零次齐次的最终归一化，使损失对最后隐藏向量的径向梯度为零；没有最终归一化、且正确类别具有正 margin 时，交叉熵沿放大方向仍能下降。结论有明确条件，并非全网训练稳定性定理。
- **有限规模上的训练证据：**TinyStories 1M–30M、深度 8 的模型，Internal-Taper 的验证损失比基线高约 0.7%–1.5%；全移除配合辅助损失也可工作，但更脆弱，9M 的一个异常种子被排除。
- **特定部署条件下的效率证据：**30M 模型在单张 H100、BF16、KV-cached 解码中，未融合约 1.10–1.14×，融合约 1.15–1.18× 吞吐。没有证明十亿级预训练、长上下文或生产服务都能达到这个收益。

本报告的判断是：**保留最终归一化、仅移除内部归一化，是当前证据最稳妥的工程选择；全删主要是有价值的机制研究，不能仅凭相近均值视为同样可靠。**

## 2. 问题建模：内部层和最终层分别做什么

### 2.1 输入、输出、参数与目标

原文第 3.1 节采用 token 行向量约定。隐藏状态 $H\in\mathbb R^{T\times d}$，批维省略；$T$ 是序列长度，$d$ 是隐藏宽度，$V$ 是词表大小。第 $j$ 个 Pre-Norm block 为：

$$
H^{(j,1)}=H^{(j,0)}+\operatorname{Attn}_j\!\left(N_j^A(H^{(j,0)})\right),
$$

$$
H^{(j,2)}=H^{(j,1)}+\operatorname{MLP}_j\!\left(N_j^M(H^{(j,1)})\right),
\qquad H^{(j+1,0)}=H^{(j,2)}.
$$

内部归一化位于残差分支的入口。最终归一化位于输出头之前：

$$
Z=N_{\rm final}(H^{(L,0)})W_{\rm out},
\quad W_{\rm out}\in\mathbb R^{d\times V},
\qquad \ell(z,y)=-\log\operatorname{softmax}(z)_y.
$$

已知量是网络结构、语言建模数据、原始归一化定义与训练预算；预训练实验学习全部权重，GPT-2 实验从已有 checkpoint 微调。新增参数包括各层静态分支增益、校准系数，以及辅助损失的固定目标。门值是外部调度量，不是对每个 token 学出来的路由决策。

### 2.2 标准归一化：当前 token 的统计量参与前向

对 $h\in\mathbb R^{1\times d}$，原文式（1）–（2）：

$$
\operatorname{LN}(h)=\frac{h-\mu_h\mathbf1^\top}{\sigma_h}D_\gamma+\beta,
\quad \mu_h=d^{-1}\sum_i h_i,
\quad \sigma_h=\sqrt{d^{-1}\sum_i(h_i-\mu_h)^2+\varepsilon},
$$

$$
\operatorname{RMSNorm}(h)=\frac{h}{r(h)}D_\gamma,
\qquad r(h)=\sqrt{\|h\|_2^2/d+\varepsilon},\quad D_\gamma=\operatorname{diag}(\gamma).
$$

$\gamma,\beta$ 为逐特征参数，$r,\sigma$ 是当前 token 的标量统计。LN 的中心化和尺度除法会耦合通道，RMSNorm 只做尺度归一化。本文讨论的是这些操作的移除，不是取消注意力 Softmax、SwiGLU 或残差连接。

### 2.3 三种实验配置，不能把“内部全删”叫成“整个模型无归一化”

| 配置 | 内部归一化 | 最终归一化 | 用途 |
|---|---|---|---|
| Baseline | 保留 | 保留 | 标准 RMSNorm / LN 参照 |
| Internal-Taper | 门控退化并可融合 | 保留 | 默认方案，保留输出处隐式尺度锚 |
| All-Taper | 门控退化并可融合 | 也移除 | 研究全无归一化的可行性，依赖更强的显式锚定 |

两种 Taper 都可另开 / 关固定目标辅助损失。论文主比较中的 Internal-Taper 也带辅助损失，因此不能把它相对基线的全部变化孤立归因于删层。

## 3. 方法：从动态归一化到可融合的静态分支

### 3.1 一个全局门，多个各自学习的分支

原文式（3）定义 RMSNorm 版本：

$$
\operatorname{TaperNorm}(h;g)=
g\frac{h}{r(h)}D_\gamma+(1-g)c\,hD_{\widetilde\gamma}.
$$

其中 $g\in[0,1]$ 在所有选定层、token 间共享；$c$ 是**每层独立**的校准标量；$\gamma,\widetilde\gamma\in\mathbb R^d$ 分别属于归一化和静态分支。共享门不等于所有层共用同一个缩放系数。

- $g=1$：完全等于标准归一化，先获得稳定的早期训练动力学。
- taper 起点：估计 $c$，复制 $\widetilde\gamma\leftarrow\gamma$，冻结 $c$。
- $0<g<1$：逐步降低归一化分支权重，两个增益向量继续参与训练。
- $g=0$：只剩 $c\,hD_{\widetilde\gamma}$，不再计算 RMS 统计，且能融合进相邻线性投影。

冻结的是 $c$，不是整个静态分支。最终它在推理时固定，并不表示从校准到训练结束都没有学习。

全局余弦调度按原文文字整理为下面的实现形式，$k_s,k_e$ 是 taper 起止步：

$$
g(k)=\begin{cases}
1,&k\le k_s,\\
\tfrac12\left(1+\cos\left(\pi\frac{k-k_s}{k_e-k_s}\right)\right),&k_s<k<k_e,\\
0,&k\ge k_e.
\end{cases}
$$

这里 gate warmup 与学习率 warmup 可以有不同终点；GPT-2 Medium、XL 的两个时间点就不相同。它不是先删第一层、训一段、再删第二层的逐层日程。

### 3.2 校准系数来自一维最小二乘，不是直接取平均倒数 RMS

在 taper 起点，希望归一化与静态分支尽可能接近。令 $A(h)=hD_\gamma/r(h)$，$B(h)=hD_\gamma$。原文式（4）、附录 A.5：

$$
c^\star=\arg\min_c\mathbb E\|A(h)-cB(h)\|_2^2
=\frac{\mathbb E[\|hD_\gamma\|_2^2/r(h)]}{\mathbb E[\|hD_\gamma\|_2^2]}.
$$

推导把二次目标展开：

$$
J(c)=\mathbb E\|A\|^2-2c\mathbb E\langle A,B\rangle+c^2\mathbb E\|B\|^2,
\quad J'(c)=0\Rightarrow
c^\star=\frac{\mathbb E\langle A,B\rangle}{\mathbb E\|B\|^2}.
$$

它按当前 $\gamma$ 加权后的激活能量对齐。$\mathbb E[1/r(h)]$ 一般不是这个最优值；也不是 DaMN 那样逐通道匹配输入输出均值与方差。需要 $\mathbb E\|B\|^2>0$，数值实现给分母加小正数 $\delta$。

warmup 期间用 EMA 累积两种期望（附录 A.6）：

$$
u_k=(1-\mu)u_{k-1}+\mu a_k,\quad
v_k=(1-\mu)v_{k-1}+\mu b_k,
\qquad
\widehat u_n=\frac{u_n}{1-(1-\mu)^n},\quad
\widehat v_n=\frac{v_n}{1-(1-\mu)^n},
$$

$$
a_k=\widehat{\mathbb E}[\|hD_\gamma\|^2/r(h)],\quad
b_k=\widehat{\mathbb E}[\|hD_\gamma\|^2],\qquad
c\leftarrow\frac{\widehat u_n}{\widehat v_n+\delta}.
$$

$\mu$ 是新观测的权重，不能误用成常见“0.99 旧值权重”的另一种 EMA 参数约定。训练中的分布和 $\gamma$ 会变化，故 EMA 对齐是实用初始化；它不保证随后门控中间态的所有统计都一致，更不保证在域外数据上精确复制原归一化。

### 3.3 LN 版本保留了线性中心化，融合时不能漏掉

GPT-2 使用附录 B 的 TaperLN，原文式（6）：

$$
\operatorname{TaperLN}(h;g)=\beta+
g\frac{h-\mu_h\mathbf1^\top}{\sigma_h}D_\gamma
+(1-g)c(h-\mu_h\mathbf1^\top)D_{\widetilde\gamma}.
$$

它与简单逐元素仿射不完全一样。令固定中心化投影 $P=I-d^{-1}\mathbf1\mathbf1^\top$，则 $g=0$ 时：

$$
\operatorname{TaperLN}(h;0)=hA+\beta,
\qquad A=cPD_{\widetilde\gamma}.
$$

虽然显式计算 $h-\mu_h$ 仍可能执行 token 均值归约，但它整体是固定线性映射，因此**折叠之后**不必保留均值计算。不能把它错写为只有 $cD_{\widetilde\gamma}$，否则漏掉中心化项，改变模型函数。LN 校准系数相应把式（4）中的 $h,r(h)$ 换成 $\bar h=hP,\sigma_h$（原文式（7））。

### 3.4 折叠如何兑现部署收益

若下一步为 $x\mapsto xW+b$，RMS 版本可设 $W'=cD_{\widetilde\gamma}W$；LN 版本应设：

$$
W'=AW=cPD_{\widetilde\gamma}W,\qquad
b'=\beta W+b.
$$

用投影的低秩结构可避免显式构造密集 $P$。下面是本报告等价重写：

$$
PD_{\widetilde\gamma}W=
D_{\widetilde\gamma}W-rac1d\mathbf1\left(\mathbf1^\top D_{\widetilde\gamma}W\right).
$$

注意力 Q/K/V 和 MLP 的所有相关输入投影都要正确处理，残差旁路语义不应被改变。最终层若融合到与 embedding 绑定的输出权重，不能悄悄同时改变输入 embedding：可能需要解除共享或保留等价输出映射，参数和部署代价需单独核查。论文的效率实验保留最终 RMSNorm，没有证明全删输出层的融合与权重共享在任意实现中都无额外成本。

## 4. 为什么最终归一化特殊：三条命题的完整逻辑

### 4.1 径向方向是什么意思

对于输出前隐藏向量 $h$，沿着 $h\mapsto ah$ 改变长度但不改变方向，是径向变化。一个形式上的小梯度步 $h^+=h-\eta\nabla_h\ell$ 满足：

$$
\|h^+\|^2-\|h\|^2=-2\eta\langle\nabla_h\ell,h\rangle+O(\eta^2).
$$

所以内积小于零时，沿负梯度会倾向增加隐藏向量长度。这是输出处的局部分析；真实训练更新的是网络权重，不是把 $h$ 当作独立参数直接做一步 SGD。

### 4.2 命题 4.1：零次齐次归一化阻断径向梯度

若 $N(ah)=N(h)$ 对所有 $a>0$ 成立，称为零次齐次。理想 $\varepsilon=0$ 的 RMSNorm 和 LN 在其定义域满足此性质。对 $a$ 求导，并使用链式法则得到原文命题：

$$
\frac{d}{da}N(ah)\bigg|_{a=1}=0
\quad\Longrightarrow\quad
\langle\nabla_h\ell(N(h)W_{\rm out},y),h\rangle=0.
$$

即仅放大最终隐藏向量，不会直接改变归一化后 logits；损失不能沿这一个自由度继续下降。LN 只要求非零方差，单说 $h\ne0$ 还不足以排除常数向量的退化情况；LN 的固定偏置 $\beta$ 不破坏正比例缩放不变性。

**三个限定：**实际 $\varepsilon>0$ 时只近似成立；$\gamma$ 和输出权重仍可学习、增长；所以最终归一化不是把所有 logits 的绝对幅度永久固定，也不是对全网所有参数方向施加范数界。

对无偏置 RMSNorm，本报告进一步推导有限 $\varepsilon$ 的泄漏量：

$$
\langle\nabla_h\ell,h\rangle
=\frac{\varepsilon}{r(h)^2}\langle\nabla_z\ell,z\rangle,
\qquad z=\frac{h}{r(h)}D_\gamma W_{\rm out}.
$$

当信号能量远大于 $\varepsilon$ 时径向分量受到强抑制；在近零激活处不能直接当作精确为零。

### 4.3 命题 4.2：没有最终归一化，正确预测仍可通过放大降低交叉熵

设 $z=hW_{\rm out}$，$p=\operatorname{softmax}(z)$，目标类别为 $y$。交叉熵的梯度是 $\nabla_z\ell=p-e_y$，因此：

$$
\langle\nabla_h\ell,h\rangle
=\langle\nabla_z\ell,z\rangle
=\sum_i p_i z_i-z_y.
$$

若正确类别具有正 margin：$m=z_y-\max_{j\ne y}z_j>0$，原文证明：

$$
\sum_i p_i z_i-z_y\le-(1-p_y)m<0.
$$

这表示即使分类方向已经正确，增大 logit 差距仍能降低交叉熵；作者称为 **logit chasing**。对固定分离方向 $z$，$\ell(az,y)=\log(1+\sum_{j\ne y}e^{-a(z_y-z_j)})$ 随 $a\to\infty$ 可趋近零，这解释了纯尺度增长的诱因。

但命题要求正 margin。预测错误或存在其他损失、正则化时，径向符号不必相同。它不证明任何全删模型都会无限发散，也不证明真实非线性、AdamW 动力学等价于独立更新最后隐藏向量。

### 4.4 命题 4.3：用固定目标尺度产生恢复力

原文式（5）对最终归一化之前的残差流施加：

$$
\mathcal L_{\rm aux}=\lambda\mathbb E_{b,t}\left(s(h_{b,t})-s_{\rm tgt}\right)^2,
\qquad \mathcal L=\mathcal L_{\rm CE}+\mathcal L_{\rm aux}.
$$

RMS 版本 $s(h)=r(h)$，LN 版本 $s(h)=\sigma_h$；只对非 padding token 求平均。$s_{\rm tgt}$ 来自门控 warmup 期间批均值尺度的偏差校正 EMA，在 taper 起点冻结。它是训练出的一个**固定标量目标**，不是每个新 batch 都跟着增长的移动靶。

RMS 情形的原文命题 4.3：

$$
\nabla_h\mathcal L_{\rm aux}=
\frac{2\lambda(r(h)-s_{\rm tgt})}{dr(h)}h,
\qquad
\langle\nabla_h\mathcal L_{\rm aux},h\rangle=
\frac{2\lambda(r(h)-s_{\rm tgt})}{dr(h)}\|h\|^2.
$$

超过目标时，梯度下降把尺度向内拉；低于目标时向外推。它与交叉熵的径向压力相反，但总损失的平衡不必恰在 $s_{\rm tgt}$，也不自动保证所有权重有界。LN 情形恢复方向为 $h-\mu_h\mathbf1^\top$（附录 A.4），约束的是中心化尺度，不直接钉住均值方向。

### 4.5 为什么“各 token 尺度一致”还不够

Baroni 对照使用随当前 batch 定义的目标 $\widehat\sigma$，惩罚位置尺度相对均值的差异。若所有 token 的尺度一起变大，该项依然可能为零；固定目标损失则会增长。这就是“尺度一致性”与“绝对尺度锚定”的差异。

原文附录 D 写：$\mathcal L_{\rm Baroni}=\lambda\mathbb E(\sigma_{b,t}-\widehat\sigma)^2$，所选位置排除首 token、padding 和 end-of-text。这个掩码与本文辅助项的非 padding 掩码也不完全一样，复现时不能只改损失名称而忽略计算范围。

## 5. 原始曲线：理论机制是否在训练中可见

### 5.1 训练 loss 相近，不等于最终验证完全无损

<figure class="paper-figure result-figure" id="training-curves">
<a href="/assets/papers/tapernorm-scale-anchoring/embed_512_only_keep_final_train_loss.png" target="_blank" rel="noopener"><img src="/assets/papers/tapernorm-scale-anchoring/embed_512_only_keep_final_train_loss.png" alt="原文图1a：30M宽度512模型的Baseline与Internal-Taper辅助损失训练曲线" width="1036" height="658" loading="lazy"></a>
<figcaption>原文图 1(a)，arXiv v2 PDF 第 6 页的左面板，使用作者原始 PNG，保留坐标与图例。Baseline 与 Internal-Taper（保留最终 RMSNorm，带尺度损失）训练轨迹接近。来源：<a href="https://arxiv.org/html/2602.10408v2#S5.F1">原文图 1</a>。Kanavalau 等，CC BY 4.0；只拆分原有面板，未改动曲线。</figcaption>
</figure>

该面板对应 $d=512$ 的运行。两条曲线高度接近，说明内部门控没有造成明显训练损失断崖；但必须与验证表一起看，不能把视觉重合直接称为相同泛化或严格等价。论文没有在这里证明训练更快、训练 FLOPs 更低；混合阶段反而包含两条分支和统计跟踪。

### 5.2 Logit 范数：最终层是否移除，比内部是否移除更关键

<figure class="paper-figure result-figure" id="logit-curves">
<a href="/assets/papers/tapernorm-scale-anchoring/embed_512_logit_l2_sum.png" target="_blank" rel="noopener"><img src="/assets/papers/tapernorm-scale-anchoring/embed_512_logit_l2_sum.png" alt="原文图1b：六种配置的平均logit二范数，移除最终归一化而无锚时增长显著" width="1036" height="690" loading="lazy"></a>
<figcaption>原文图 1(b)，arXiv v2，原始 PNG。纵轴为对数尺度的平均 logit 二范数，虚线涉及最终层移除，阴影为跨种子 2.5–97.5 百分位范围。保留所有六种配置。来源：<a href="https://arxiv.org/html/2602.10408v2#S5.F1">原文图 1</a>。CC BY 4.0，未重绘数据。</figcaption>
</figure>

红、紫两条无显式锚的虚线增长明显更快；棕色 All-Taper + aux 则回到较温和的组。这支持输出尺度锚定的重要性。注意蓝色基线和保留最终归一化的曲线自身也增长，所以证据不是“加锚后 logits 永远不长”，而是**抑制额外的失控尺度增长通道**。

六个种子形成的百分位阴影不是基于大样本的总体置信区间，且平均 logit 范数并不等于置信度校准误差。它们是机制诊断，不能替代验证 NLL、最坏序列损失和下游评估。

### 5.3 梯度：辅助损失缓解分组差异，但不证明因果机制唯一

<figure class="paper-figure result-figure" id="gradient-curves">
<a href="/assets/papers/tapernorm-scale-anchoring/embed_512_gradnorms_groups_grid.png" target="_blank" rel="noopener"><img src="/assets/papers/tapernorm-scale-anchoring/embed_512_gradnorms_groups_grid.png" alt="原文图2：按注意力QKV输出投影和MLP参数类型分组的平均梯度范数" width="2085" height="576" loading="lazy"></a>
<figcaption>原文图 2，arXiv v2 PDF 第 7 页，作者原始 PNG。四幅图分别为 attention QKV、attention 输出投影、MLP 两组权重的跨 block 平均梯度范数，保留全部图例。来源：<a href="https://arxiv.org/html/2602.10408v2#S5.F2">原文图 2</a>。CC BY 4.0。</figcaption>
</figure>

无锚全删的曲线，在若干权重类型上与保留最终归一化的组分开；加固定目标损失后，差距大幅缩小。这与径向分析相容，但较小梯度不自动表示训练更好，平均梯度也会掩盖个别层和 token 的异常。论文未通过这些图排除所有其他优化因素。

## 6. TinyStories：配置、结果、异常种子与计算成本

### 6.1 原文训练条件

| 项目 | 原文第 5.1 节、附录 C |
|---|---|
| 数据 | TinyStories；自训 SentencePiece 词表 10k；拼接流中采随机连续窗口；next-token prediction |
| 结构 | 深度 8；所有宽度都用 16 heads；宽度 64 / 128 / 256 / 512；RoPE、SwiGLU、MLP 扩展因子 4；线性层无 bias；输入输出 embedding 共享 |
| 序列和 batch | 上下文 512；batch 16，即每优化步 8192 个输入 token 位置 |
| 优化 | AdamW，$\beta=(0.9,0.95)$，峰值 LR $3\times10^{-4}$；5% 线性 LR warmup，再余弦降到零；全局梯度裁剪 1.0 |
| 正则化 | 无 dropout、无 weight decay；辅助损失开启时 $\lambda=0.1$ |
| 门控 | LR warmup 期间 $g=1$，其后衰减到训练终点；EMA 新样本权重 $\mu=0.01$ |
| 步数 | $d=64,128$：500k；$d=256$：750k；$d=512$：1M |
| 重复与评估 | 每配置 6 seeds；最终 tapered 模型以 $g=0$ 评估；表中报告均值 ± 标准差 |
| 硬件时间 | 单张 H100；各宽度单次运行约 4.3 / 4.8 / 8.2 / 15.4 小时，使用 eager PyTorch 并记录诊断 |

8192×步数对应处理约 40.96 / 40.96 / 61.44 / 81.92 亿 token 位置（本报告计算），不是同样数量的独立新数据，也不表示不同模型训练预算相同。每个宽度下的方法使用相同训练日程；跨宽度比较同时改变了步数。

### 6.2 完整验证结果：小幅退化而非普遍胜出

<figure class="paper-figure result-figure" id="tinystories-results">
<a href="/assets/papers/tapernorm-scale-anchoring/table01-tinystories.png" target="_blank" rel="noopener"><img src="/assets/papers/tapernorm-scale-anchoring/table01-tinystories.png" alt="原文表1完整截图：各模型规模的验证损失与9M排除异常种子的说明" width="1200" height="282" loading="lazy"></a>
<figcaption>原文表 1，arXiv v2 PDF 第 7 页。完整保留 9M All-Taper 排除一个异常种子的注释。来源：<a href="https://arxiv.org/html/2602.10408v2#S5.T1">原文表 1</a>。CC BY 4.0，PDF 原表截图，未改数值。</figcaption>
</figure>

| 规模 | Baseline | Internal-Taper + aux | All-Taper + aux |
|---|---:|---:|---:|
| 1M | 2.1538 ± 0.0025 | 2.1852 ± 0.0040（+1.46%） | 2.1930 ± 0.0035（+1.82%） |
| 3M | 1.7561 ± 0.0010 | 1.7828 ± 0.0029（+1.52%） | 1.7874 ± 0.0028（+1.78%） |
| 9M | 1.4620 ± 0.0022 | 1.4837 ± 0.0016（+1.48%） | 1.4837 ± 0.0023（+1.48%，5 seeds） |
| 30M | 1.2768 ± 0.0018 | 1.2859 ± 0.0010（+0.71%） | 1.2868 ± 0.0041（+0.78%） |

损失越低越好。所有表中均值都高于基线，结论应是**有限的损失代价换内部归一化移除**，不是精度超过标准模型。相对 CE 增加 1.5% 也不是准确率下降 1.5%；若采用自然对数 NLL，其 PPL 比例应使用 $\exp(\Delta\mathrm{CE})$。例如 30M Internal 的差为 0.0091，对应 PPL 增加约 0.91%（本报告计算）。

9M All-Taper 排除了一个“异常高验证损失”的运行，只用剩余 5 个种子。论文没有在此给出被排除值及包含它的汇总，不能称为预先证明无关的异常。它恰恰与全删较脆弱有关，应该补报全种子统计和失败率。

## 7. GPT-2 微调：全删可行，但质量与域外风险不均匀

### 7.1 训练与日程

数据为 OpenWebText，使用对应 GPT-2 tokenizer，文档后加 end-of-text，拼接为 1024 token blocks。BF16、梯度裁剪 1.0、余弦 LR 配 warmup、梯度累积保持全局 token batch；附录 D 引用 Baroni 配方，但没有在本论文中完整重列所有峰值 LR 和 batch 数值，因此复现还需获取那一版配置。

| 模型 | 总步数 | LR warmup 终点 | taper 起点 → 终点 | $\lambda$ |
|---|---:|---:|---|---:|
| GPT-2 Small | 300 | 25 | 25 → 100 | 0.1 |
| Medium | 500 | 10 | 20 → 200 | 0.1 |
| Large | 600 | 30 | 30 → 500 | 0.1 |
| XL | 800 | 20 | 50 → 700 | 0.01 |

EMA 新样本权重为 0.1。门控起点设置大致对齐 Baroni 首次移除，终点大致对齐其首次 LayerNorm-free checkpoint；**日程大致对齐不等于所有训练预算、模型起点和调参成本完全匹配**。Vanilla / FakeLN 采用其发布的检查点与评估代码，新方法则执行全局门控微调。

### 7.2 原始结果及不能省略的退化

<figure class="paper-figure result-figure" id="gpt2-results">
<a href="/assets/papers/tapernorm-scale-anchoring/table03-gpt2.png" target="_blank" rel="noopener"><img src="/assets/papers/tapernorm-scale-anchoring/table03-gpt2.png" alt="原文表3完整截图：GPT-2四种规模、四种协议、三个数据集的交叉熵与FakeLN异常序列注释" width="1200" height="558" loading="lazy"></a>
<figcaption>原文表 3，arXiv v2 PDF 第 9 页，全部 16 行与原注均保留，包括 XL FakeLN 在 Pile 上的 130.2197。来源：<a href="https://arxiv.org/html/2602.10408v2#S5.T3">原文表 3</a>。CC BY 4.0，原表截图。</figcaption>
</figure>

| OWT 交叉熵，越低越好 | Vanilla | FakeLN | Internal-TaperLN + aux | All-TaperLN + aux |
|---|---:|---:|---:|---:|
| Small | 3.0126 | 3.0797 | 3.0584 | 3.0685 |
| Medium | 2.7390 | 2.7642 | 2.7550 | 2.7715 |
| Large | 2.6240 | 2.6384 | 2.6277 | 2.6230 |
| XL | 2.4799 | 2.5052 | 2.5144 | 2.5305 |

Small、Medium 的 Internal 优于 FakeLN，但仍比 Vanilla 差；Large 的 All 在 OWT 上略低于 Vanilla，差只有 0.001，不能无误差条地宣布普遍优越。XL 的两种 Taper 均比 FakeLN 高，All 相对 Vanilla 高 0.0506。

域外数据也并非全都改善。Large 的 Pile：Vanilla 2.6233、FakeLN 2.7504、Internal 2.7860、All 2.6539；XL 的 Pile：Vanilla 2.4673、Internal 2.5303、All 2.6504。XL All 比 Vanilla 高 0.1831 CE，对应 PPL 约高 20.1%（本报告按 $e^{0.1831}-1$ 计算），不能被“小幅损失”的总括掩盖。

另一方面 XL FakeLN 的 Pile 平均 CE 为 130.2197，原文注明少量极端序列可主导均值；Pile-filtered 后它是 2.3992，与 Vanilla 2.3821、Internal 2.3844、All 2.4000 接近。这个异常提示应报告逐序列分布、最差分位与过滤规则；不能只挑 130.2197 来宣称新法压倒性领先，也不能只展示过滤集把鲁棒性问题完全抹掉。

该 GPT-2 表没有给出像 TinyStories 那样的多种子标准差。真实下游能力、长文生成质量和异常 token 行为没有被这些 CE 数字充分覆盖。

## 8. KV-cached 效率：最高 1.18× 的条件与分解

<figure class="paper-figure result-figure" id="decoding-results">
<a href="/assets/papers/tapernorm-scale-anchoring/table02-decoding.png" target="_blank" rel="noopener"><img src="/assets/papers/tapernorm-scale-anchoring/table02-decoding.png" alt="原文表2完整截图：H100带KV cache解码的基线、未融合与融合吞吐率" width="1200" height="306" loading="lazy"></a>
<figcaption>原文表 2，arXiv v2 PDF 第 8 页。单位为 tok/s，保留 batch、prompt 长度与完整三个方案。来源：<a href="https://arxiv.org/html/2602.10408v2#S5.T2">原文表 2</a>。CC BY 4.0，未改数值。</figcaption>
</figure>

测试对象为 $d=512$、约 30M 的 TinyStories Internal-Taper + aux 模型，仍保留最终 RMSNorm。设备 H100 80GB，CUDA 12.1、PyTorch 2.4.1+cu121，BF16，适用时开启 TF32。每个设置先提供 prompt，再利用 KV cache 一次生成一个 token。

| Batch / prompt | Baseline tok/s | 未融合静态分支 | 已融合到 QKV 与 MLP 输入投影 |
|---|---:|---:|---:|
| 1 / 128 | 336 | 383（1.14×） | 397（1.18×） |
| 1 / 256 | 340 | 383（1.13×） | 398（1.17×） |
| 4 / 128 | 1253 | 1382（1.10×） | 1441（1.15×） |
| 4 / 256 | 1250 | 1378（1.10×） | 1437（1.15×） |

以 1 / 128 为例，本报告直接换算：

$$
\frac{397}{336}-1\approx18.15\%\quad\text{吞吐增加},
\qquad 1-\frac{336}{397}\approx15.37\%\quad\text{单位 token 时间减少}.
$$

这两个百分比不相同。由未融合到融合的额外增益仅为 $397/383-1\approx3.66\%$，所以收益不能全归于折叠；前一步取消 RMS 统计已经减少了运行开销。相反，增加 batch 后收益变小，说明它受计算与访存结构影响。

v2 没有充分给出生成 token 数、是否计入 prompt prefill、重复次数、误差条以及完整 serving 调度信息；不能沿用 v1 的计时细节填补这些空白。它也没报告该微基准的整机能耗、训练提速或 GPT-2 XL 的部署吞吐。因此不应把 30M 的 1.18× 搬到 GPT-2 XL、十亿级模型、不同内核或长上下文服务上。

## 9. 与 Derf、DaMN 的联系与差异

| 问题 | Derf | DaMN | TaperNorm |
|---|---|---|---|
| 起点 | 多任务从头训练的替代函数 | 预训练模型后处理与追加微调 | TinyStories 从头训练 + GPT-2 微调 |
| 替代关系 | 可学习 erf 非线性 | 每通道矩匹配仿射替身 | 全局门控，EMA 加权最小二乘对齐的静态分支 |
| 校准 | 不以匹配 LN 统计为主 | 通常顺序校准，Qwen 有例外 | warmup 期间各层 EMA，全局一起 taper |
| 部署 | 保留 erf 算子 | 仿射满足条件后融合 | RMS 缩放或 LN 中心化仿射可折叠 |
| 最终层机制 | 未以径向锚定为主要论点 | LLM 删除位置影响大、部分保留 | 明确区分内部与最终层，给出三条径向命题 |
| 主要证据边界 | GPT-2 只与 LN 持平 | 质量代价与硬件反例，LLM 多为部分删除 | 小规模预训练、GPT-2 域外退化、全删异常种子 |

共同点是**去掉样本依赖统计，并不自动等于保持原函数不变**。迁移之后的网络需要学习适应；理论上可折叠也不等于实际 exporter / kernel 已经最优。三篇论文训练配置、目标和效率口径不同，这张表只是方法对照，不构造不存在的同条件总排行榜。[Derf 调研](/posts/2026/10/28/stronger-normalization-free-transformers.html) · [DaMN 调研](/posts/2026/10/29/damn-normalization-removal.html)

## 10. 复现路线与值得验证的机制问题

本报告没有重跑论文训练，完成的是全文与附录精读、原始结果核查、证明整理和局限分析。论文、arXiv 官方条目没有提供可直接定位的作者运行代码链接，本次检索也未找到已确认的 TaperNorm 完整复现仓库；因此不声称代码已开源或已跑通。Baroni 的代码 / checkpoint 被作者用作基线，不等于 TaperNorm 自身实现已经公开。

### 10.1 先验证代数与梯度，再训练模型

1. 用双精度小张量验证式（4）与数值最小二乘解一致；确认 EMA 新值权重、偏差校正与冻结时点。
2. 检查 $g=1$ 与标准 RMSNorm/LN 输出、梯度一致，$g=0$ 与折叠后线性映射一致。LN 必须包含中心化投影 $P$ 和偏置，检查输出头权重绑定。
3. 数值检查径向内积：理想归一化接近零，正 margin 的未归一化线性输出为负，辅助项在尺度过高 / 过低时符号相反。
4. 再做相同数据顺序和预算的短训练，记录 CE 与 aux **分别**的值、门值、隐藏尺度、logit 范数、逐层梯度及最坏序列损失。短训练只作实现验证，不冒称复现完整 TinyStories 结果。
5. 完整复现报告所有种子与失败运行，独立测量未融合与融合部署图；不要只展示最后均值或过滤后的 CE。

### 10.2 有区分力的后续实验

| 疑问 | 建议干预 | 应记录证据 |
|---|---|---|
| 输出锚定是否是唯一关键因素？ | 内部保留/移除 × 最终保留/移除 × aux 开/关；匹配调参预算 | 全种子验证 CE、训练失败率、径向梯度、最坏序列 |
| 锚定隐藏尺度是否足够？ | 冻结/学习 $W_{\rm out}$ 与 $\gamma$；检查 embedding 绑定 | 隐藏范数、logit 范数、输出权重范数和校准误差分别报告 |
| 固定目标选择是否敏感？ | 将 warmup 目标乘 0.5 / 1 / 2，比较 EMA/固定/移动目标 | 总损失与 CE 分开、尺度偏移、OOD 稳健性 |
| 校准统计能否跨分布？ | 只用前期 EMA、延长 warmup、替换数据域、输入激活幅度扰动 | 分支对齐误差、异常激活分位与验证退化 |
| 全删是否值得额外风险？ | 保留最终层与全删在同一部署图测量 | 精度—吞吐 Pareto、输出层折叠代价、失败种子比例 |
| 是否能扩大到大模型？ | 先独立扩深度、宽度、序列长度，再扩预训练数据 | 稳定区间、最优日程、计算预算，不能只报告成功 checkpoint |
| Pile 极端序列如何产生？ | 同一固定序列集合，报告未过滤与过滤指标 | CE 分布、top-k 最坏样本、token 位置、激活与置信度异常 |

尤其应补充 9M All-Taper 被排除的原始运行，以及 XL 在未过滤 Pile 上的损失尾部。它们比单纯多做一个均值消融更能判断方法是否可靠。

## 11. 阅读后的判断

TaperNorm 的主要研究价值，是把“归一化是否必要”拆成两件事：**内部层的样本依赖计算是否值得保留，以及输出处的尺度自由度由谁约束。**门控与校准提供可实现的迁移路径，径向梯度解释则说明为什么最终层通常更特殊。

证据支持在所测设置下移除内部归一化，以较小验证损失代价换取一定解码吞吐收益；固定目标损失使全删实验成为可能，但不能据此认为最终归一化已经普遍冗余。把局部数学机制、训练成功范围和实际部署收益分别验证，才是后续跟进这项工作的合适方式。

## 参考、版本与原图说明

1. Kanavalau, A.; Amo Alonso, C.; Lall, S. **Gated Normalization Removal and Scale Anchoring in Pre-Norm Transformers**，arXiv:2602.10408v2，2026-05-19。[官方版本与许可](https://arxiv.org/abs/2602.10408) · [v2 HTML](https://arxiv.org/html/2602.10408v2) · [v2 PDF](https://arxiv.org/pdf/2602.10408v2)。阅读包括全部正文、附录 A 的证明、附录 B 的 TaperLN 与附录 C–D 的训练协议。
2. 原图来自 v2 图 1(a)、图 1(b)、图 2 与表 1–3。图使用作者原始 PNG，表从原始 PDF 完整截图，保留异常种子及失败相关注释。遵循论文 **CC BY 4.0**：注明作者、论文、版本及来源；表格只作裁剪，面板分开展示，不重绘数据、不改变原色。逐文件来源及 SHA256 见资源归档。
3. 本文推导中，有限 $\varepsilon$ 的径向泄漏、中心化投影的低秩折叠、CE 与 PPL/吞吐换算，以及后续实验设计，明确属于报告补充；不将其当作作者新增实验结果。
