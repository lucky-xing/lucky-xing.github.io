# Channel2World：从多条无线信道学习可复用的 RF 环境表示

日期：2026-10-20　｜　通信 / 通感　｜　论文精读与方法分析

## 1. 研究结论与阅读定位

**Channel2World 的核心贡献，是把“一个站点的传播环境”作为可学习、可复用的条件变量：用同一基站环境下多条带位置的信道观测构建环境表示，再让这个表示帮助不同下游模型解释新观测。** 它不是直接从任意无线波形生成完整三维世界，也不是无数据、无训练地解决所有无线任务。

论文全名为 *Channel2World: A Wireless Foundation Model for RF Environment Representation*，作者为 Hyung-Joo Moon、Joonkyu Jang、Kwang Soon Kim、Seong-Lyun Kim、Robert W. Heath Jr. 和 Chan-Byoung Chae。本报告阅读版本为 **arXiv:2608.17544v1，2026-08-18，13 页、10 幅图**；截至本次核对，arXiv 版本记录只有 v1，不能把预印本标成已正式录用的会议或期刊论文。[官方摘要与版本](https://arxiv.org/abs/2608.17544) · [HTML 全文](https://arxiv.org/html/2608.17544v1) · [PDF 全文](https://arxiv.org/pdf/2608.17544v1)

| 关键问题 | 论文的回答 | 需要保留的条件 |
| --- | --- | --- |
| 学习什么？ | 基站中心的 RF 环境 latent tokens | 表示的是无线可观测传播结构，不是完整物理世界 |
| 从什么输入学习？ | 多条“用户位置 + 多径参数”观测 | 新站点仍需上下文数据与位置；不是无数据适配 |
| 怎样得到训练信号？ | 用上下文解释不重叠查询信道的位置分布和相对路径增益 | 查询信道选自有 LoS 的信道，并利用位置校准传播时延 |
| 怎样迁移？ | 冻结环境编码器，为不同下游任务提供条件 | 下游模型仍要训练；新站点测试时才不更新参数 |
| 效果如何？ | 定位、波束域功率重建改善；能恢复主要反射结构 | 不同任务收益不同，更多样本微调可能胜出 |

本报告重点跟进 **信道如何变成路径 token、token 如何形成环境表示、环境表示为何能提供监督、冻结后怎样服务下游任务**。公式注明对应原文编号；标准注意力、GMM 和校准关系的展开明确标为本报告整理。未复跑模型，结果数字均来自原文或有明确标注的计算。

## 2. 问题建模：环境、坐标、信道与不确定性

### 2.1 一个“环境”由什么定义？

论文的环境索引 $e$ 对应一个固定传播场景，加上特定基站位置、阵列朝向与遮挡配置。同一建筑布局中更换基站位置，就得到不同的 BS-centered environment。因此环境数与独立建筑布局数不是同一个概念。

一个环境包含多个单天线用户的上行宽带信道观测；在较短的环境相干时间内，场景被视为静态。已知量包括基站位置、姿态，以及上下文观测对应的用户位置；未知量是可迁移的环境表示及下游任务目标。模型不要求输入显式建筑地图，但并没有取消位置采集和坐标标定。

设基站全局位置为 $\widetilde{\mathbf p}^{\mathrm{BS}}_e$，阵列局部坐标基为正交矩阵 $\mathbf B_e$。用户位置从全局坐标转换到基站局部坐标（原文式（1））：

$$
\mathbf p_{e,i}=\mathbf B_e^{\mathsf T}
\left(\widetilde{\mathbf p}_{e,i}^{\mathrm{UE}}-\widetilde{\mathbf p}^{\mathrm{BS}}_e\right).
$$

局部 $x$、$y$ 轴分别沿矩形阵列的水平和垂直方向，$z$ 轴为朝向服务区域的阵列法向。后续到达角与位置均使用这一约定；**不能直接沿用其他论文“竖直轴是 z”的公式而不变换坐标**。位置观测误差被建模为（原文式（2））：

$$
\widehat{\mathbf p}_{e,i}=\mathbf p_{e,i}+\boldsymbol\varepsilon^{\mathrm{pos}}_{e,i},
\qquad \boldsymbol\varepsilon^{\mathrm{pos}}_{e,i}\sim\mathcal N(\mathbf0,\sigma_{\mathrm{pos}}^2\mathbf I_3).
$$

### 2.2 从物理传播到宽带 MIMO 信道

基站为 $N_{x,e}\times N_{y,e}$ 矩形阵列，用户单天线。令 $\theta$ 为相对阵列法向的夹角，$\phi$ 为阵列平面方位角，方向余弦为（原文式（3）–（5））：

$$
\begin{aligned}
u_x&=\sin\theta\cos\phi,\qquad u_y=\sin\theta\sin\phi,\\
[\mathbf a_{N,d,\lambda}(u)]_n&=e^{-j2\pi dnu/\lambda},\quad n=0,\ldots,N-1,\\
\mathbf A_e(\theta,\phi)&=\mathbf a_{N_{x,e},d_{x,e},\lambda}(u_x)
\mathbf a_{N_{y,e},d_{y,e},\lambda}(u_y)^{\mathsf T}.
\end{aligned}
$$

对第 $n$ 个子载波，频率为 $\nu_{e,n}=(n-(N_{\mathrm{sc},e}-1)/2)\Delta f_e$。远场有限多径模型写成（原文式（7）–（8））：

$$
\begin{aligned}
\mathbb H_{e,i,n}&=e^{j\kappa_{e,i}}\sum_{\ell=1}^{L_{e,i}}
10^{p_{e,i,\ell}/20}\mathbf A_e(\theta_{e,i,\ell},\phi_{e,i,\ell})
e^{-j2\pi\nu_{e,n}\tau_{e,i,\ell}},\\
\mathcal H_{e,i}&\in\mathbb C^{N_{x,e}\times N_{y,e}\times N_{\mathrm{sc},e}}.
\end{aligned}
$$

$p_{e,i,\ell}$ 为 dB 路径增益，因而振幅系数使用 $10^{p/20}$；$\tau$ 为接收机参考下的时延；$\kappa$ 是信道公共随机前端相位；三个张量维度对应阵列两维与频率维。这个模型说明“环境”为什么能从信道中被观察：反射体位置、材料与可见性共同决定路径的方向、时延和强弱。

### 2.3 把环境结构与设备、同步偏差分开

原始路径参数混合了环境和测量系统效应（原文式（9）–（10））：

$$
\begin{aligned}
\tau_{e,i,\ell}&=\tau^{\mathrm{prop}}_{e,i,\ell}+b^{\tau}_{e,i},\\
p_{e,i,\ell}&=p^{\mathrm{phy}}_{e,i,\ell}+\xi^{\mathrm{UE}}_{e,i,\ell}+\zeta^{\mathrm g}_{e,i}.
\end{aligned}
$$

$b^{\tau}$ 是同一信道内所有路径共享的定时偏差；$\zeta^{\mathrm g}$ 是发射功率、AGC 或标定等造成的公共增益尺度；$\xi^{\mathrm{UE}}$ 是与路径有关的用户天线、姿态或遮挡扰动。论文将最后一项建模为标准差为 $\sigma_\xi$ 的独立零均值高斯 dB 扰动。

这里的学习难点不是“多收集几条信道就有地图”，而是需要让模型在保留共享传播结构的同时，尽量不把公共时钟和功率尺度当作环境特征。下面的归一化和上下文—查询训练就是为此设计的。

## 3. 输入转换：从信道张量到上下文与查询 token

### 3.1 先做路径参数估计，但本文不验证完整实测前端

论文设导频估计张量为 $\widehat{\mathcal H}=\mathcal H+\mathcal W$，通过张量或子空间估计器获得路径集合（原文式（11）–（12））：

$$
\widehat{\mathcal H}_{e,i}\longrightarrow
\left\{(\widehat\tau_{e,i,\ell},\widehat\theta_{e,i,\ell},
\widehat\phi_{e,i,\ell},\widehat p_{e,i,\ell})\right\}_{\ell=1}^{\widehat L_{e,i}}.
$$

这样，网络输入不再直接具有“阵元数 × 子载波数”的尺寸，而变成可变大小的物理参数集合。它减弱了网络结构对具体天线布局的绑定，但**没有保证任何阵列、频率、带宽下都能得到同等质量的路径参数**。

尤其需要区分方法接口与实验实现：论文不以信道分解为研究重点，实验用射线追踪路径加上 decomposition-equivalent 独立高斯误差，模拟角度、时延和增益估计的不完美。它没有展示真实硬件采集、实际路径分解器与环境编码器联调后的完整性能。

### 3.2 相对时延与相对增益：不变性伴随信息丢失

对每个信道，分别减去最早路径时延和最强路径增益（原文式（13）–（17））：

$$
\widehat{\overline\tau}_{i,\ell}=\widehat\tau_{i,\ell}-\min_q\widehat\tau_{i,q},
\qquad
\widehat{\overline g}_{i,\ell}=\widehat p_{i,\ell}-\max_q\widehat p_{i,q}.
$$

同一信道公共的 $b^\tau$、$\zeta^{\mathrm g}$ 因相减而消除；最早路径相对时延为零，最强路径相对增益为 0 dB。得到归一化路径集合 $\widehat{\mathbb P}_{e,i}$。

这一步也丢弃了绝对到达时间原点和绝对功率尺度。模型不能再仅靠上下文相对时延直接读取绝对传播距离，也不能从相对增益恢复未标定的真实链路预算。路径相关的 $\xi^{\mathrm{UE}}$ 不会被公共项归一化消除；最早或最强路径选错、漏检还会同时影响多条路径的参考值。

### 3.3 上下文 token 与查询 token 的信息不对称

同一环境的数据组织为 $\mathcal D_e=\{(\widehat{\mathbf p}_{e,i},\widehat{\mathbb P}_{e,i})\}$。预训练时随机选取不重叠的信道索引集 $\mathcal C_e$、$\mathcal Q_e$，满足 $\mathcal C_e\cap\mathcal Q_e=\varnothing$。**分离的是信道，而不是只把同一信道的不同路径拆开**，这样查询必须依靠环境共享结构来解释。

上下文的一条路径变成 9 维 token（原文式（21））：

$$
\mathbf x^{\mathrm{ctx}}_{e,i,\ell}=
\left[\widehat{\overline\tau},\sin\widehat\theta,\cos\widehat\theta,
\sin\widehat\phi,\cos\widehat\phi,\widehat{\overline g},
\widehat p_x,\widehat p_y,\widehat p_z\right]^{\mathsf T}.
$$

相对时延与增益描述路径结构，位置告诉编码器这条路径是在环境的哪个位置观察到的。角度用正余弦编码，以避免方位角周期边界引入人为不连续。

查询的一条路径则只提供 5 维特征（原文式（22））：

$$
\mathbf x^{\mathrm{qry}}_{e,j,\ell}=
\left[\widehat\tau^{\mathrm{prop}},\sin\widehat\theta,\cos\widehat\theta,
\sin\widehat\phi,\cos\widehat\phi\right]^{\mathsf T}.
$$

它不显式包含用户位置或相对增益，因为二者是监督目标。上下文用相对时延，而查询使用**经校准的传播时延**，两者不能混写。

### 3.4 查询 LoS 限制与时延校准：重要的监督条件

查询只从存在 LoS 的用户信道中抽取，即 $\mathcal Q_e\subseteq\mathcal I_e^{\mathrm{LoS}}$。利用已知用户位置和 LoS 路径，可以把公共定时参考校准到传播时延。以下是对原文文字的等价整理，而非原文额外给出的公式：

$$
\widehat\tau^{\mathrm{prop}}_{j,\ell}
\simeq \widehat\tau_{j,\ell}-\widehat\tau_{j,\mathrm{LoS}}
+\frac{\|\widehat{\mathbf p}_{e,j}\|}{c_0}.
$$

因此，“查询 token 不显式输入位置”不等于整个预训练数据处理没有使用查询位置：绝对时延校准仍利用了位置提供的距离参考。这是可行的监督预训练设计，但不能把这一 GMM 预训练头直接描述成无需校准、可在未知位置 NLoS 用户上直接使用的定位器。真正下游定位任务采用另一套输入和模型，见第 6 节。

## 4. 环境编码器：可变路径集合如何变成固定表示

<figure class="paper-figure" id="architecture"><a href="/assets/papers/channel2world/fig02.png" target="_blank" rel="noopener"><img src="/assets/papers/channel2world/fig02.png" alt="原文图2：上下文路径经信道内自注意力、双向交叉注意力和latent自注意力形成环境tokens；查询端使用位置GMM、增益和信道级位置预测头。" loading="lazy"></a><figcaption>原文图 2：Channel2World 架构。左侧是环境编码器，右侧是预训练估计头。来源：Moon 等，arXiv:2608.17544v1，Fig. 2；CC BY 4.0。原图未改动，透明底以白色衬底显示；点击查看原尺寸。</figcaption></figure>

### 4.1 先理解一条信道内部的多径

共享线性投影先把每条上下文路径嵌入为 $D_m=128$ 维特征；随后在**同一信道的路径集合内部**运行 4 层 self-attention，建模不同路径之间的关系。这样一条路径不是孤立输入：它可以利用同一用户的其他路径判断自己在传播结构中的作用。

经过信道内处理后，不同用户信道的路径 token 合成可变大小的集合 $\mathbf X_e$。这一步的结构与“把所有 CSI 样本分别编码，再简单平均”不同。

### 4.2 用可学习的 latent slots 汇聚环境

模型共享一组可训练初始 latent tokens，并输出环境条件表示（原文式（24）–（25））：

$$
\mathbf Z^{(0)}\in\mathbb R^{K_z\times D_m},\qquad
\mathbf Z_e=\operatorname{Enc}_{\Theta}(\mathcal X_e^{\mathrm{ctx}},\mathbf Z^{(0)}),
\qquad K_z=16,\quad D_m=128.
$$

所有环境使用同一组初始 latent slots；**环境专属的部分是它们读取上下文之后的输出 $\mathbf Z_e$，而不是给每个站点单独学习一套参数**。编码器遵循 Set Transformer / Perceiver 一类集合编码思路，通过固定数量 latent slots 汇聚不同数量的路径观测。

全局聚合交替使用双向 cross-attention 与 self-attention。下面使用标准注意力形式展开其信息流，不是论文新增公式：

$$
\operatorname{Attn}(\mathbf Q,\mathbf K,\mathbf V)
=\operatorname{softmax}\!\left(\frac{\mathbf Q\mathbf K^{\mathsf T}}{\sqrt{d_k}}\right)\mathbf V,
\qquad
\begin{cases}
\mathbf Z\leftarrow\operatorname{CrossAttn}(\mathbf Z,\mathbf X_e),\\
\mathbf X_e\leftarrow\operatorname{CrossAttn}(\mathbf X_e,\mathbf Z).
\end{cases}
$$

latent 读取路径集合，收集“本站点有哪些传播结构”；路径再读取当前 latent，让局部路径特征获得全局上下文。随后分别在 latent 集与 context 集内部做 self-attention，再进入下一轮更新。原文采用 6 层交叉注意力和 6 层自注意力的环境聚合配置。

集合处理不依赖人为的用户排列和路径排列，但物理位置本身仍是重要输入。输入顺序不敏感，也不等于对任意坐标旋转、镜像或错误坐标标定都不敏感。

### 4.3 输出紧凑，但推理并非没有成本

$16\times128=2048$ 个实数就能表示环境。若用 FP32，只计 latent 本身约为 **8 KiB**（本报告按 2048×4 字节计算，不是作者实测存储数据），便于作为下游共享条件。

但这不是整个系统的内存和计算量。128 条上下文、每条最多 12 条路径时，可产生最多 1536 个上下文路径 token；若增加到 1024 条，则上限是 12288 个。交叉注意力的关联规模与 token 数和 $K_z$ 成正比，而原文还保留了 context token 集的自注意力，相关部分可能具有二次 token 复杂度。**不能仅因为使用了固定数量 latent，就断言整个编码器对上下文严格线性。**

## 5. 预训练：用环境表示解释未见查询

### 5.1 查询如何读取环境？

查询路径先被投影为 128 维，再通过双向交叉注意力读取 $\mathbf Z_e$，得到环境条件路径表示（原文式（26））：

$$
\mathbf r^{\mathrm{path}}_{e,j,\ell}
=\operatorname{Dec}^{\mathrm{path}}_{\Theta}
\left(\mathbf x^{\mathrm{qry}}_{e,j,\ell},\mathbf Z_e\right).
$$

随后有三个监督头：**单路径位置分布、相对路径增益、整条信道的位置分布**。不同头迫使环境表示同时解释几何歧义和路径强弱关系，而不是仅记住某一种下游标签。

### 5.2 为什么位置使用 GMM，而不是只回归一个点？

单条 NLoS 路径的到达方向和总时延不能唯一确定用户位置，因为还不知道反射结构。模型用 Gaussian Mixture Model 表达这种多解性。下面是原文概率头的标准混合高斯展开，原文未逐项写出所有 GMM 参数：

$$
p_{\Theta}^{\mathrm{path}}(\mathbf p\mid\mathbf r)
=\sum_{m=1}^{8}\pi_m(\mathbf r)
\mathcal N\!\left(\mathbf p;\boldsymbol\mu_m(\mathbf r),\boldsymbol\Sigma_m(\mathbf r)\right),
\qquad \pi_m\geq0,\quad\sum_m\pi_m=1.
$$

MLP 预测混合权重、位置与尺度等分布参数。训练在观测位置 $\widehat{\mathbf p}$ 上计算负对数似然，而不是强行让所有可能位置的平均值成为正确位置。原文使用 8 个分量，并将最小标准差限制为 0.5 m，防止通过无限缩小尺度降低训练损失。

这里的“建模多解”不自动等于概率已校准：分布宽度能否反映真实错误率，需要覆盖率或校准实验另行验证。

### 5.3 聚合多路径，得到整条信道的位置分布

环境条件路径表示经过查询信道内部 self-attention 得到 $\widetilde{\mathbf r}^{\mathrm{path}}$。同一信道的路径再用注意力权重汇聚（原文式（28）–（29））：

$$
\alpha_{j,\ell}=\frac{\exp(\mathbf w_p^{\mathsf T}\widetilde{\mathbf r}_{j,\ell})}
{\sum_q\exp(\mathbf w_p^{\mathsf T}\widetilde{\mathbf r}_{j,q})},
\qquad
\mathbf r_j^{\mathrm{ch}}=\sum_{\ell}\alpha_{j,\ell}\widetilde{\mathbf r}_{j,\ell}.
$$

整信道 GMM 头基于 $\mathbf r_j^{\mathrm{ch}}$ 预测位置分布；相对增益头则基于每条精炼路径特征预测标量 $\widehat{\overline g}^{\mathrm{pred}}_{j,\ell}$。单路径头鼓励环境表示解释一条路径，整信道头鼓励它与多径联合推断相容。

### 5.4 三个训练目标与两层随机采样

令 $N_Q=\sum_{j\in\mathcal Q_e}|\mathcal L_{e,j}|$ 为查询路径数。原文式（30）–（32）可整理为：

$$
\begin{aligned}
\mathcal L_{\mathrm{path}}&=-\frac1{N_Q}\sum_{j,\ell}
\log p_{\Theta}^{\mathrm{path}}(\widehat{\mathbf p}_{e,j}\mid\mathbf r^{\mathrm{path}}_{e,j,\ell}),\\
\mathcal L_{\mathrm{gain}}&=\frac1{N_Q}\sum_{j,\ell}
\left(\widehat{\overline g}^{\mathrm{pred}}_{e,j,\ell}-\widehat{\overline g}_{e,j,\ell}\right)^2,\\
\mathcal L_{\mathrm{ch}}&=-\frac1{|\mathcal Q_e|}\sum_j
\log p_{\Theta}^{\mathrm{ch}}(\widehat{\mathbf p}_{e,j}\mid\mathbf r^{\mathrm{ch}}_{e,j}),\\
\mathcal L_e&=\mathcal L_{\mathrm{path}}+0.1\mathcal L_{\mathrm{gain}}+0.5\mathcal L_{\mathrm{ch}},\\
\Theta^*&=\arg\min_{\Theta}\mathbb E_{e\in\mathcal E_{\mathrm{tr}}}
\mathbb E_{\mathcal C_e,\mathcal Q_e}[\mathcal L_e].
\end{aligned}
$$

外层采样不同环境，内层采样同一环境中不同上下文和查询子集。因为编码器必须为不重叠查询提供有用条件，它受到的训练压力是总结可共享传播规律，而非只复制输入样本。

### 5.5 冻结的时间点必须讲清楚

<figure class="paper-figure"><a href="/assets/papers/channel2world/fig03.png" target="_blank" rel="noopener"><img src="/assets/papers/channel2world/fig03.png" alt="原文图3：预训练更新环境编码器及预训练头；下游训练冻结编码器，仅更新下游模型；测试两个模型都冻结。" loading="lazy"></a><figcaption>原文图 3：预训练、下游训练与下游测试协议。来源：Moon 等，arXiv:2608.17544v1，Fig. 3；CC BY 4.0。点击放大。</figcaption></figure>

| 阶段 | 更新什么？ | 使用什么数据？ |
| --- | --- | --- |
| 环境预训练 | 编码器和三个预训练头联合更新 | 训练布局中的上下文—查询集合 |
| 下游任务训练 | 环境编码器冻结，只训练任务模型 | 训练环境中的任务样本与环境表示 |
| 新环境测试 | 编码器和任务模型都冻结 | 从目标环境上下文推断 $\mathbf Z_e$，再预测目标 |

所以“无需站点微调”是**新环境测试阶段没有梯度更新**，不是模型从未训练，也不是新环境没有数据。对定位任务而言，上下文中的位置本身就是与任务有关的标签信息；准确说法是免站点参数更新的条件适配，而非完全无监督或零样本定位。

## 6. 三个下游任务：输入、输出与目标函数

### 6.1 单个空间信道矩阵到用户位置

下游定位不复用预训练阶段的完整“绝对时延 + AoA”查询接口，而是输入一张 $4\times8$ 复数空间信道矩阵。将实部与虚部拼接为向量，再与环境 token 的注意力池化结果拼接，由 MLP 预测三维位置（原文式（34）–（35））：

$$
\widehat{\mathbf p}_{e,i}=f_{\Psi}^{\mathrm{pos}}(\mathbf H_{e,i},\mathbf Z_e),
\qquad
\mathcal L_{\mathrm{pos}}^{\mathrm{ds}}=\mathbb E\|\widehat{\mathbf p}_{e,i}-\mathbf p_{e,i}\|_2^2.
$$

这样检验的是：**同一张局部信道矩阵，在知道本站点传播结构后，能否被解释得更准确？** 它也检验了物理参数域学到的环境表示，能否帮助原始空间矩阵域的下游模型。

### 6.2 稀疏波束观测到完整波束域功率图

BS 采用固定二维 DFT 码本，完整目标 $\boldsymbol\gamma\in\mathbb R^M$ 的每个元素是相应波束的接收功率，单位 dBm。对测量索引集 $\Omega$，未测量处补零（原文式（36）–（38））：

$$
[\boldsymbol\gamma^{\Omega}]_m=
\begin{cases}\widetilde\gamma_m,&m\in\Omega,\\0,&m\notin\Omega,\end{cases}
\qquad
\widehat{\boldsymbol\gamma}=f_{\Psi}^{\mathrm{beam}}(\boldsymbol\gamma^{\Omega},\mathbf Z_e),
\qquad
\mathcal L_{\mathrm{beam}}^{\mathrm{ds}}=\mathbb E\|\widehat{\boldsymbol\gamma}-\boldsymbol\gamma\|_2^2.
$$

稀疏向量重排到二维波束网格，用 CNN 提取局部结构；环境 latent 经过注意力池化，再与波束特征融合，MLP 输出完整 $8\times16$ 功率图。实验中测量位置模式是固定的，不等于已经验证任意缺失模式。

**术语边界：** 这项任务虽被作者称为 beam-domain CSI reconstruction，实际重建目标是波束域 received-power map，不包含完整复数信道相位，也不是宽带逐子载波复 CSI 的完整重建。结果的 RMSE 单位是 dB，不能与信道 NMSE(dB)、吞吐率或波束选择成功率混同。

### 6.3 从到达方向恢复基站侧交互点

几何任务输入 NLoS 路径方向特征 $\boldsymbol\eta=[\sin\theta,\cos\theta,\sin\phi,\cos\phi]^{\mathsf T}$ 和 $\mathbf Z_e$；一维 GMM 预测基站到第一个 BS-side interaction point 的距离分布（原文式（39）–（44））：

$$
\begin{aligned}
p_{\Psi}^{\mathrm{rec}}(r\mid\boldsymbol\eta,\mathbf Z_e),\qquad
\mathcal L_{\mathrm{rec}}&=-\mathbb E\log p_{\Psi}^{\mathrm{rec}}(r^{(1)}\mid\boldsymbol\eta,\mathbf Z_e),\\
\widehat r^{(1)}&=\arg\max_r p_{\Psi}^{\mathrm{rec}}(r\mid\boldsymbol\eta,\mathbf Z_e),\\
\mathbf u^{\mathrm{AoA}}&=[\sin\theta\cos\phi,\sin\theta\sin\phi,\cos\theta]^{\mathsf T},\\
\widehat{\mathbf s}^{(1)}&=\widehat r^{(1)}\mathbf u^{\mathrm{AoA}}.
\end{aligned}
$$

“第一个基站侧交互点”按从 BS 朝环境追溯的方向定义；在上行 UE→BS 的传播顺序中，它是靠近 BS 的最后一次交互，不能与从 UE 出发的第一反射点混为一谈。方向只确定射线，未知距离由环境先验补足。

距离预测头需要训练环境的交互点真值作为监督，本工作依靠射线追踪取得。因此该几何任务不是没有几何监督的地图自动发现，也没有进行表面连续性、对象拓扑或多次反射完整路径的联合优化。

## 7. 数据集、误差设置与实验协议

### 7.1 26,000 个环境的真正构成

<figure class="paper-figure"><a href="/assets/papers/channel2world/fig04.png" target="_blank" rel="noopener"><img src="/assets/papers/channel2world/fig04.png" alt="原文图4：随机工厂建筑布局、沿墙一维基站网格与密集二维用户网格。" loading="lazy"></a><figcaption>原文图 4：射线追踪数据生成。图中的用户网格规模描述布局采样，并不表示每个基站都保留全部用户；每环境有效信道数见表。来源：Moon 等，arXiv:2608.17544v1，Fig. 4；CC BY 4.0。</figcaption></figure>

| 项目 | 原文设置（Table I、V-A） |
| --- | --- |
| 场景 | Wireless InSite 射线追踪；26 个随机工厂建筑布局 |
| 基站 | 每布局 500 个位置，间隔 1 m；高 15 m，离墙 0.2 m |
| 用户 | 高 1.5 m；二维网格间距随机在 0.6–0.7 m |
| 环境数 | 26×500×2 镜像符号 = 26,000 个 BS 中心环境 |
| 有效信道 | 每环境 833–9024 条，平均 4999 条 |
| 传播 | 7 GHz；关闭绕射；最多三次反射；每信道保留最强的至多 12 条路径 |
| 划分 | 按工厂布局分为训练/验证/测试 22/2/2，而非随机混合 BS 样本 |

按平均数估算，总规模约为 $26000\times4999\approx1.30\times10^8$ 个信道—位置对（本报告计算，包含镜像增广），但空间结构多样性主要来自 **26 个基础布局**。不能把它说成在 26,000 个完全独立真实建筑场景上预训练。

按布局分组是实验设计的优点：相邻 BS、同布局用户、镜像版本不会跨越训练和测试集合。于是测试比“同布局换一个基站位置”更强，但仍处在相似工厂生成流程中，不能直接代表跨城市、跨建筑类型和跨材质的广泛泛化。

### 7.2 模型与训练参数

| 项目 | 原文取值 |
| --- | --- |
| 环境表示 | 16 个 latent tokens，每个 128 维 |
| 一次预训练输入 | 128 条 context、32 条 disjoint query 信道 |
| 编码器 | 4 层信道内路径 self-attention；6 层 cross-attention + 6 层 self-attention |
| 查询估计模块 | 8 层 cross-attention，2 层查询路径 self-attention |
| Transformer | 4 个头；FFN 扩张比 4；残差；无 dropout |
| 概率头 | 8 分量 GMM，最小标准差 0.5 m |
| 预训练批量与损失 | batch size 32；增益权重 0.1，整信道位置权重 0.5 |
| 模型规模 | Channel2World 约 9.2M 可训练参数，包含所描述预训练结构；不应直接等同冻结编码器的单独参数量 |

### 7.3 Error-aware 与 error-free 并非“现实”和“绝对无噪声”的等价物

| 扰动 | Error-aware | Error-free |
| --- | --- | --- |
| 位置观测 | 每坐标标准差 0.1 m | 去除此扰动 |
| 路径时延 | 标准差 1 ns | 去除此扰动 |
| 到达角 | $\sigma_\theta=\sigma_\phi=1^\circ$ | 去除此扰动 |
| UE 路径增益波动 | $\sigma_\xi=3$ dB | 仍保留相同的 3 dB 波动 |

1 ns 对应约 0.30 m 的单程传播距离不确定度（由光速换算），但不会自动等于最后的定位误差。路径参数误差被设为相互独立的高斯误差；真实分解器中的漏检、假峰、近路径混叠、相干多径和参数相关性，并不充分被这种模型涵盖。

### 7.4 下游比较到底怎样使用目标环境数据？

定位与功率重建评估从两个测试布局中随机选 16 个 BS 中心环境；每环境按 80%/20% 分为可用训练子集与最终测试子集。这里的“训练子集”只是目标环境数据分区名称，不意味着 Proposed 在其上做梯度训练。

| 曲线/方法 | 已有训练 | 目标站点如何使用数据？ |
| --- | --- | --- |
| Test: Site-specific | 为每个测试环境单独训练 | 用该环境的 80% 训练子集拟合一个模型 |
| Test: Combined | 为 16 个测试环境训练一个共享模型 | 合并 16 个环境的训练子集 |
| Global | 只用训练布局训练任务模型 | 不使用目标环境样本 |
| Global + fine-tuning | 先训练 Global | 用 128/256/1024 个目标环境任务标注样本更新轻量输出部分 |
| Proposed | 任务模型训练数据与 Global 相同，增加冻结编码器条件 | 从目标环境训练分区取 128 个信道—位置样本生成 latent，测试时不更新参数 |
| Mean / Shuffled | 使用已训练 Proposed | 分别把本站点 latent 换成平均 latent 或其他测试环境的 latent |

重要的公平性边界：定位任务中，微调需要的位置标签与 Proposed 上下文位置属于同类信息；但两者输入信息并不完全相同，Proposed 的上下文还要得到多径参数，而下游定位样本是单张空间信道矩阵。**样本数相等不等于采集开销、带宽和前端处理开销相等。**

## 8. 预训练与环境表示的结果：学到了什么？

### 8.1 图 5：训练曲线证明收敛，不直接等于下游精度

<figure class="paper-figure"><a href="/assets/papers/channel2world/fig05.png" target="_blank" rel="noopener"><img src="/assets/papers/channel2world/fig05.png" alt="原文图5：训练至约450epoch的单路径与整信道位置GMM损失，以及相对增益RMSE；区分error-aware和error-free。" loading="lazy"></a><figcaption>原文图 5：验证集预训练指标。左轴为 GMM 位置负对数似然，右轴为增益 RMSE，不能把两个纵轴或 NLL 与米制定位误差混用。来源：Moon 等，arXiv:2608.17544v1，Fig. 5；CC BY 4.0。</figcaption></figure>

整信道位置头比单路径位置头具有更低的 NLL，符合“多路径能减少单路径歧义”的预期；error-free 的分布拟合更尖锐，error-aware 留有更高的不确定性。增益误差接近作者设定的 3 dB 扰动参考线，说明不可预测的用户侧变化限制了目标拟合。

图 5 的 GMM 下界来自最小标准差限制：对中心恰在目标的三维球形分量，$\mathcal L_{\min}=\frac32\log(2\pi\sigma_{\min}^2)$。它是**该概率模型和尺度约束下的 NLL 参考**，不是整个无线定位问题的 CRLB。3 dB 则是原文使用的增益参考值，不能把它推广为任意相对增益归一化方式下的普适最优误差。

### 8.2 图 6：单条 NLoS 路径也能获得环境条件下的位置假设

<figure class="paper-figure"><a href="/assets/papers/channel2world/fig06.png" target="_blank" rel="noopener"><img src="/assets/papers/channel2world/fig06.png" alt="原文图6：同一查询NLoS路径的error-aware和error-free位置GMM分布，均在真实用户附近形成分量，但分布宽度不同。" loading="lazy"></a><figcaption>原文图 6：预训练单路径概率头的测试环境示例。图例显示 1.5σ 范围；这是示例分布可视化，不是完整数据集覆盖率证明。来源：Moon 等，arXiv:2608.17544v1，Fig. 6；CC BY 4.0。</figcaption></figure>

单条路径的传播时延和到达角本来不足以唯一确定 NLoS 用户，模型仍能在目标附近放置概率分量，表明 latent 提供了与反射结构有关的条件。error-aware 分布较宽，与注入误差一致；但这张示例不能单独证明所有反射阶数和遮挡条件下都能正确定位。

### 8.3 图 7：环境相似性不是对所有变换保持不变

<figure class="paper-figure"><a href="/assets/papers/channel2world/fig07.png" target="_blank" rel="noopener"><img src="/assets/papers/channel2world/fig07.png" alt="原文图7：去均值环境embedding的余弦相似度随基站距离增大而下降，同镜像符号与不同镜像符号呈现不同曲线。" loading="lazy"></a><figcaption>原文图 7：每个环境用 1024 条上下文生成表示，先减去全部环境 embedding 的经验均值，再计算余弦相似度。来源：Moon 等，arXiv:2608.17544v1，Fig. 7；CC BY 4.0。不能把此处的 1024 当成所有下游任务的统一上下文数。</figcaption></figure>

同布局、同镜像符号的 BS 越接近，表示越相似；距离扩大后相似性下降，说明表示与局部传播结构相关。不同镜像符号的相似性较弱，因为镜像改变了 BS 坐标下的方向—反射体对应关系。error-aware 的同符号相似性通常更高，支持其 latent 更平滑的解释，但这不是任意分布外场景鲁棒性的证明。

## 9. 三项下游实验的原图与真实对比

### 9.1 图 8：定位有明显收益，但 1024 样本微调更好

<figure class="paper-figure result-figure" id="localization-results"><a href="/assets/papers/channel2world/fig08.png" target="_blank" rel="noopener"><img src="/assets/papers/channel2world/fig08.png" alt="原文图8：定位RMSE随下游参数量变化。Proposed优于Global和128样本微调；1024样本微调优于Proposed；Mean和Shuffled明显退化。" loading="lazy"></a><figcaption>原文图 8：7 GHz、4×8 阵列下，单张信道矩阵到位置的测试 RMSE（米）与下游模型参数量的关系。保留作者原始坐标、图例和红色微调标记。来源：Moon 等，arXiv:2608.17544v1，Fig. 8；CC BY 4.0。</figcaption></figure>

读图应沿着同一参数规模观察，而不是挑选不同规模模型形成有利对照：

- Proposed 的实线低于 Global，表明环境条件确实补充了单张信道矩阵缺少的站点信息。
- 使用 128 个样本微调仍明显弱于 Proposed；后者也使用 128 个目标环境上下文，但不执行目标环境梯度更新。
- 256 个样本微调有所改善；**1024 个样本的微调则优于 Proposed**。论文优势是少样本、免站点参数更新条件下的适配，并非击败一切微调。
- Mean 与 Shuffled 明显退化，甚至劣于不输入 latent 的 Global。这个消融比“加了模块所以模型更大”更有说服力：收益依赖于环境表示与当前站点相匹配。
- error-aware 和 error-free 编码器表现接近，说明这里考虑的参数扰动没有显著破坏下游帮助；不能据此推断任意强噪声或实际分解失效都无影响。

原文没有提供这张曲线各点的完整数值表，本报告不把读图估计冒充精确测量，也不据此计算精确百分比提升。横轴计入下游条件池化模块的参数增加，但**没有把共享环境编码器的全部算力与采集成本纳入横轴**。

### 9.2 图 9：波束域功率重建收益较小，不能写成全面领先

<figure class="paper-figure result-figure" id="csi-results"><a href="/assets/papers/channel2world/fig09.png" target="_blank" rel="noopener"><img src="/assets/papers/channel2world/fig09.png" alt="原文图9：波束码本观测数为12、16、24、32时的功率图重建RMSE。Proposed改善Global，但多条微调曲线与其接近或更好，错误latent影响小于定位。" loading="lazy"></a><figcaption>原文图 9：稀疏波束接收功率重建的测试 RMSE（dB）。不同观测数对应不同固定波束模式，不能将横轴仅解释成相同模式下追加观测。来源：Moon 等，arXiv:2608.17544v1，Fig. 9；CC BY 4.0。</figcaption></figure>

实验使用 7 GHz、$8\times16$ 阵列与各向同性天线；总 BS 发射功率 24 dBm、带宽 20 MHz、噪声功率谱密度 −174 dBm/Hz。观测 12/16/24/32 个波束分别对应 $2\times6$、$4\times4$、$3\times8$、$4\times8$ 固定子集模式。

主要比较结论是：Proposed 改善 Global，但幅度小于定位；128 和 256 个任务样本微调具有竞争力，1024 样本微调在图中也更强。Mean/Shuffled 更接近 Proposed，说明已有稀疏波束测量本身就为功率图插值提供了较多信息，精确站点条件的重要性降低。

曲线不是严格单调下降，因为不同观测数同时改变了测量模式；不能把局部起伏简单归结为“更多波束反而一定更差”。对照模型约 1.80M 参数，Proposed 约 1.86M，多出约 0.06M 的 latent 池化模块。微调与定位任务也不同：此处只更新已有网络最后两层 MLP block，而不是新加一个从零训练的适配头。

### 9.3 图 10：恢复可观测反射结构，不等于恢复完整环境

<figure class="paper-figure result-figure" id="geometry-results"><a href="/assets/papers/channel2world/fig10.png" target="_blank" rel="noopener"><img src="/assets/papers/channel2world/fig10.png" alt="原文图10：两组场景中的真实交互点、error-aware128上下文预测、error-free1024上下文预测及叠加比较；主要反射面恢复较好，角点存在误差。" loading="lazy"></a><figcaption>原文图 10：RF 可观测几何重建。两组场景分别展示真值、两种预测设置及叠加结果。两种设置同时改变了误差条件和上下文数，不能视为控制上下文数量后的单变量比较。来源：Moon 等，arXiv:2608.17544v1，Fig. 10；CC BY 4.0。建议点击原图查看各子图。</figcaption></figure>

| 设置 | 上下文数 | 原文报告的 RMSE | 原文报告的 MAE |
| --- | --- | --- | --- |
| Error-aware 编码器条件的距离预测 | 128 | 3.91 m | 1.94 m |
| Error-free 编码器条件的距离预测 | 1024 | 3.88 m | 1.84 m |

这些数字对应 V-D3 的交互点距离预测/重建任务，不是第 9.1 节的用户定位误差。本报告保留原文统计名称；原文没有在此给出完整点云表面指标定义，不把它进一步改称 Chamfer、Hausdorff 或建筑体积误差。

两设置的 RMSE 只差 0.03 m、MAE 差 0.10 m（本报告按原文数值相减），但不能由此断言“128 个噪声样本等价于 1024 个干净样本”：这里编码器训练条件、输入误差和上下文数一起变化，也缺少显著性检验。最多能说作者展示的两种具体设置结果接近。

图中主要反射面和大致延伸范围能够恢复，但角点、断裂处和稀疏观测区域较差。原因与方法直接对应：解码器按每条射线独立预测一个距离，没有表面连续性约束。RMSE 明显大于 MAE，也提示平均误差之外可能存在较大误差尾部，需要分位数与失效统计进一步说明。

### 9.4 结果对比的总判断

| 证据 | 支持什么？ | 不支持什么？ |
| --- | --- | --- |
| 位置图 8，Proposed vs Global | 目标环境条件具有下游价值 | 环境编码器算力可忽略、采集代价相同 |
| Mean/Shuffled 消融 | 正确站点表示比无关条件更有用 | latent 已唯一恢复真实物理环境 |
| 1024 样本微调曲线 | 更多目标数据和参数更新仍可更优 | Proposed 在任何数据预算下都最佳 |
| 功率图 9 | 条件表示跨任务复用，部分改善重建 | 完整复 CSI、频谱效率或吞吐率已经提升 |
| 图 10 与 3.91/3.88 m | 表示包含可解码的反射几何信息 | 完整三维数字孪生、地图连通性、材质和动态对象已恢复 |

## 10. 创新性、适用边界与前一篇工作的关系

### 10.1 创新点主要在“表示对象”与训练组织

Transformer、latent slots、attention pooling 和 GMM 本身都不是本文首创。更值得关注的组合是：以环境为预训练单位；用物理路径参数降低观测维度和阵列尺寸绑定；通过不重叠上下文—查询任务逼迫编码器学习共享传播结构；冻结同一个编码器，为不同任务提供环境条件。

“基础模型”在这里由大规模预训练和跨任务复用定义，不是凭参数规模达到某个阈值。三类任务实验支持其作为环境条件模块的潜力，但不能仅因命名就认定它具备对任意城市、频段、设备和任务的普适能力。

### 10.2 实际部署还要回答的六个问题

1. **目标上下文如何取得？** 128 条可定位、可分解的宽带信道需要采集、坐标对齐与更新。定位任务上下文位置可能依赖外部传感器或已有定位服务，不能将该成本视为零。
2. **前端分解何时失效？** 独立参数误差模型对漏检、假路径、参考路径切换、角延迟耦合与近场效应覆盖不足；网络架构对阵列尺寸不敏感，不意味着前端测量质量不敏感。
3. **跨域到底跨了什么？** 本文跨的是未见工厂布局，测试频率为 7 GHz；未给真实多站点实测、跨频段、任意阵列或动态场景的系统性验证。
4. **条件错配会不会更危险？** 定位中的错误 latent 比无条件模型更差。工程上需要检测过期或不匹配环境表示，并允许退回 Global 等保守模型。
5. **系统成本是多少？** 下游参数量比较没有等价回答编码器 FLOPs、处理时延、峰值显存、路径分解成本和采集预算，需另行测量。
6. **统计是否足够？** 独立测试布局只有 2 个，主定位/CSI 任务使用其中 16 个 BS 中心环境；多基站样本不是同数量独立布局。图 8/9 没有展示完整多随机种子误差条与显著性分析，不能只据一组曲线推断所有站点稳定胜出。

### 10.3 与 Pilot-Based 定位建图的联系和区别

| 方面 | Pilot-Based 定位建图 | Channel2World |
| --- | --- | --- |
| 核心路线 | 显式传播几何反演与地图清理 | 预训练得到环境 latent，再条件化任务模型 |
| 环境表达 | 估计 IP、簇与凸包 | 固定数量的潜变量 token |
| 学习与监督 | 几何估计为主 | 大规模信道—位置预训练，下游再有任务监督 |
| 多次反射 | 把单次反射假设下的污染点用遮挡等规则剔除 | 多径结构进入学习；几何头预测 BS 侧交互点，不恢复完整多次反射链 |
| 跨任务用途 | 主要是定位与建图流程 | 定位、波束功率图和几何可复用同一编码器 |
| 证据 | 一套街区射线追踪流程 | 工厂布局分组的射线追踪泛化与多个基线消融 |

这是方法路线的比较，不是相同数据下的性能排名。两篇论文的场景、频率、观测条件、指标均不同，不能把前文 0.21 m 用户定位 MAE 与本篇 3.91 m 交互点任务 RMSE 相减或排序。[前一篇详细报告](/posts/2026/10/18/pilot-based-radio-positioning-mapping.html)

## 11. 复现路线与值得继续研究的方向

### 11.1 先复现表示与协议，再宣称端到端系统

以下是本报告建议，并非作者已完成的额外实验。

1. **统一几何与单位。** 实现 BS 坐标转换，检查法向、角度单位、相对时延、相对增益和镜像变换。用已知 LoS/NLoS 例子验证校准过程，避免把相对延迟当绝对距离。
2. **锁定数据分组。** 工厂布局 ID 作为划分键，将相邻 BS、同布局用户与镜像派生数据整体分组。上下文和查询按信道分离，下游目标环境上下文只从其 80% 可用分区采样。
3. **先验证三个预训练头。** 检查 9 维 context、5 维 query、16×128 latent 的维度；实现路径 mask、位置 GMM 的 log-sum-exp 和最小尺度约束；再核对 loss 归一化分母。
4. **冻结编码器训练下游。** 先用小规模数据验证 Global、Proposed、Mean 和 Shuffled 的差异，再复现两种不同微调方式。不能在冻结实验中无意更新编码器。
5. **最后接入真实分解器。** 用实际导频/信道估计与路径估计器替换理想路径加扰动的接口，单独测量前端失效与下游退化，才适合讨论真实端到端部署。

### 11.2 关键消融与压力测试

| 研究问题 | 建议实验 | 应报告的指标 |
| --- | --- | --- |
| 需要多少上下文？ | 同一误差设置下比较 16/32/64/128/256/1024 条，控制采样覆盖 | 位置 RMSE/分位数、CSI dB RMSE、几何误差与采集成本 |
| 是否必须用位置？ | 无位置、噪声位置、系统偏差位置，控制其他输入 | 精度下降、分布校准及空间覆盖敏感度 |
| 物理表征有何贡献？ | 相对/绝对/混合时延与增益；角度编码与参考路径切换 | 泛化、同步/功率偏差鲁棒性与信息损失 |
| 前端是否现实？ | 相关误差、漏检、假路径、路径合并、遮挡和噪声扫描 | 失败比例、误差 CDF，而不只平均值 |
| 图 10 的相近结果来自什么？ | 误差条件 × 上下文数量的完整二维对照 | 排除混杂后的 RMSE、MAE、置信区间与覆盖率 |
| 共享 latent 是否划算？ | 多任务复用缓存，测前端、编码器、下游全链路 | FLOPs、时延、内存、更新频率、通信与能耗 |
| 泛化是否广泛？ | 更多独立布局、真实多站点、不同材质/频段/阵列 | 环境级统计、多随机种子、跨域失效检测 |

一个较直接的研究方向，是将几何解码结果的不确定性与显式表面模型结合：保留 GMM 的多解性，同时用邻近射线的一致性约束减少角点与断裂。另一个方向是主动选择最有信息的上下文位置，用更少采集覆盖最缺失的反射视角。但这两项都需要独立对照，不能预设必然改善。

### 11.3 开放资源与复现缺口

本文与其 arXiv 页面未给出可直接使用的官方代码、权重下载链接；本次未定位到可确认的完整实现发布，不据此断言作者从未开源。作者团队的 [Channels4World 官方项目入口](https://cbchae.yonsei.ac.kr/channels4world/)将数据工作与 Channel2World 方法工作区分开来；它可作为继续跟进的入口，不能仅凭有项目页就声称完整训练集已可直接下载。

原文给出了模型层数、token 维度、损失权重与主要实验参数，但未在所读版本中完整交代优化器、学习率调度、训练硬件、各阶段耗时、随机种子、全部代码实现和参数误差配置细节。例如相对增益误差 $\sigma_g$ 在一般误差模型中被定义，主要参数表中却未给出其明确数值。复现时需逐项核对，不能把常见默认值包装成作者设置。

## 12. 阅读后的判断

Channel2World 最有价值的思路，是把可采集的信道—位置集合压缩成一个能被多个任务调用的环境条件。正确站点 latent 的消融和三个不同下游接口，使其比“把信道换成 Transformer 输入”更有研究意义。

现有证据支持：在本文工厂射线追踪与误差设置中，冻结的环境编码器可以帮助新布局下的定位、功率图重建及部分几何推断。更准确的工程定位是**免站点梯度更新的环境条件适配模块**。它尚未证明真实多站点、复杂传播和动态环境中的完整世界重建，也没有在所有数据预算下超过站点微调。

## 参考资料、版本与图像来源

- Moon, H.-J., Jang, J., Kim, K. S., Kim, S.-L., Heath, R. W. Jr., Chae, C.-B. *Channel2World: A Wireless Foundation Model for RF Environment Representation*. arXiv:2608.17544v1, 2026-08-18. [版本记录](https://arxiv.org/abs/2608.17544) · [DOI](https://doi.org/10.48550/arXiv.2608.17544) · [PDF](https://arxiv.org/pdf/2608.17544v1)。本报告未将其当作已经正式同行评审发表的论文。
- 方法定位：原文 II 节（式（1）–（19））、III 节（式（20）–（32））、IV 节（式（33）–（44））；实验：Table I 与 V 节、图 5–10。[HTML 原文](https://arxiv.org/html/2608.17544v1)
- 作者团队数据项目入口：[Channels4World](https://cbchae.yonsei.ac.kr/channels4world/)；作者动态可参考 [Hyung-Joo Moon 的论文列表](https://hyungjoomoon.github.io/publications/)。项目页用于资源跟进，不替代本文的实验或开源状态证据。
- 图 2–10 均为上述 arXiv v1 官方 HTML 提供的原始图文件，完整图像与内部标记未改动；网页只增加白色衬底、显示尺寸与中文解释。作者授权许可为 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。逐图来源和文件记录保存在 `/assets/papers/channel2world/sources.json`，版权归原作者及相关权利人。
- 本报告中的注意力/GMM 展开、校准关系整理、2048 维与 8 KiB 估算、数据规模与误差差值计算、批判性评价和研究建议均有相应标注；未开展模型训练或独立复现实验。
