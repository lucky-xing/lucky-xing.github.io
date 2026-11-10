# 上行 Sounding 与下行 CSI 反馈融合：从信道重建到时效感知

文献调研 · 2026-11-09 · 5G/6G Massive MIMO，附 Wi‑Fi 分支

## 摘要

与问题最直接对应的是 Zhang 等 2026 年的 **Merge for Reconstruction**：在基站端把 SRS 估计和下行 CSI 反馈重建得到的两份不完美信道合并，并考虑观测时差。此前已有三个可复现的技术路线：TDD 用 SRS 补足空间维度、FDD 用上行路径几何压缩下行反馈，以及把上行 CSI 作为学习式解码的侧信息。三者解决的误差不同，论文数字不能横向排名。最有价值的实验是固定导频和反馈开销，检查双源融合在其中一路变差时能否继续有效。

## 1. 两路数据究竟是什么

在蜂窝场景，UE 发上行 SRS，基站估计上行信道；基站发下行 CSI-RS，UE 测量后反馈。下行反馈可以是实验中的量化复数系数，也可以是实际码本报告中的 PMI（预编码矩阵指示）、RI（秩指示）、CQI（信道质量指示）等。CSI-RS 是参考信号，CSI 是信道状态信息，二者要分开。PMI/RI/CQI 也不等于全量复数信道。[ETSI TS 38.214，§5.2 与 §6.2](https://www.etsi.org/deliver/etsi_ts/138200_138299/138214/19.01.00_60/ts_138214v190100p.pdf)

统一记号（本文建模）：单个子载波上，$H_d(t)\in\mathbb C^{N_r\times N_b}$ 为目标下行信道，$N_r$ 是 UE 下行接收维数，$N_b$ 是基站天线维数。令 $H_u(t)\in\mathbb C^{N_b\times N_r}$ 表示对应的全端口上行等效信道，$S\in\mathbb C^{N_r\times N_s}$ 表示实际发 SRS 的端口选择或映射，$P\in\mathbb C^{N_b\times K}$ 表示基站的下行导频波束。消去已知导频后，用以下简化模型表示两个观测：

$$Z_u=H_u(t_u)S+E_u,\qquad Z_d=H_d(t_d)P+E_d.$$

$$b=Q(g(Z_d)),\qquad \widehat H_d(t_*)=F(Z_u,b,\mathcal M).$$

$t_u,t_d$ 是观测时刻，$t_*$ 是下行使用时刻；$E_u,E_d$ 含测量误差；$b$ 为反馈负载；$\mathcal M$ 可包含端口映射、噪声估计、时间戳、反馈格式及 RF 校准信息。DJSCC 路线的反馈是经过有噪反馈链路的连续符号，应另建传输模型。即使校准后的 TDD 传播互易，当 $N_s<N_r$ 时，上行只能照亮部分 UE 维度。FDD 中可以共享角度/时延结构，但不能默认跨频点复系数相等；同一条时延为 $\tau$ 秒的路径，其传播相位跨越 $\Delta f$ Hz 时可变化 $-2\pi\Delta f\tau$，反射和射频响应也可能随频率变化。

## 2. 最直接的论文：Merge for Reconstruction（2026）

[Zhang、Tan、Zhang、Wang、Zhang，IEEE Transactions on Broadcasting 72(2), 449–462](https://doi.org/10.1109/TBC.2026.3670696)；[公开摘要](https://www.researchgate.net/publication/401909398_Merge_for_Reconstruction_Deep_Learning-Based_Channel_Merging_Based_on_SRS_and_CSI_Feedback_in_Massive_MIMO_Systems)。署名团队涉及清华大学电子工程系与中兴通讯，论文从广播/组播的分组、资源分配和预编码对下行 CSI 的依赖出发。摘要能核实：SRS 估计与反馈得到的信道共同送入 U-Net；上下采样块加入残差与自注意力；时变场景使用时间步嵌入；时不变场景另有 VQ-VAE 潜空间轻量方案。摘要报告了 CSI 获取和老化补偿改善。**全文和实验图未取得**，不能确认时间步的具体定义、训练目标、信道模型、基线预算、提升幅度和硬件实测情况。

## 3. TDD：利用 SRS 给低维反馈补空间约束

[Lee 等，Downlink Channel Reconstruction for Spatial Multiplexing in Massive MIMO Systems，2021 预印本](https://arxiv.org/html/2102.05224v1#S3.SS6)。论文署名来自 KAIST 与 三星电子网络业务部门；问题是 UE 发射端口少于接收端口时，如何支持下行空间复用。

处理链：从 SRS 提取基站端主出射方向，从 PMI 派生的低维有效信道代理提取接收侧方向；用两个方向字典和已知 CSI-RS 波束解路径系数矩阵，再用 SRS 向量替换其已观测的对应 UE 天线分量。按本文下行矩阵约定整理原文式 (37)–(40)：

$$Z\approx A_r C A_b^{\mathrm H}P,\qquad \widehat C=A_r^\dagger Z(A_b^{\mathrm H}P)^\dagger.$$

$$\widehat H=A_r\widehat C A_b^{\mathrm H}.$$

$Z$ 为从反馈构造的有效信道代理（不是 UE 原始矩阵）；$A_r,A_b$ 列向量对应接收、发送角度原子；$C$ 为两侧角度之间的复系数矩阵。两个投影需有足够有效秩，且条件数不能太差；字典方向过于接近或 CSI-RS 波束压掉关键路径时，伪逆会放大噪声。可将截断 SVD 或岭回归作为复现对照，区别于论文原法。

实验为 SCM 仿真，默认 UMi 2.3 GHz、基站 32 根天线/4 个 CSI-RS 端口、UE 4 根接收天线、单发射天线设定，反馈 2 或 4 层；多数图用 20 dB 下行 SNR。原文 [图 9–11](https://arxiv.org/html/2102.05224v1#S4) 给出 UPA 下的频谱效率；在图 9 的动态选波束、2 层情形中，预搜索和伪逆可超过只使用低维有效 CSI-RS 信道的基线，包括无量化的 Type 2 对照（这是作者的基线名称，不是 3GPP Enhanced Type II）。它说明 SRS 可以补回有用空间约束，不说明 2 层等效于 4 层。

## 4. FDD：反馈上行猜不出的信息

**路径相位与比特分配。** [Kim 等，FDD Massive MIMO: How to Optimally Combine UL Pilot and Limited DL CSI Feedback?，2024 预印本](https://arxiv.org/html/2405.08614v1#S3)。署名单位包括 POSTECH、KAIST、延世大学、亚利桑那州立大学、高丽大学。基站从上行导频抽取角度与路径幅度，UE 利用下行导频估计路径相位并量化；基站按下行波长重建阵列响应。原文式 (13)–(14) 的单用户写法为：

$$\widehat h_d=\sum_{\ell=1}^{L}\eta_\ell\beta_\ell e^{j q_\ell}a_d(\theta_\ell),\qquad \eta_\ell=\frac{2^{B_\ell}}{\pi}\sin\left(\frac{\pi}{2^{B_\ell}}\right).$$

$q_\ell$ 是相位量化中心（弧度），$\beta_\ell$ 是路径幅度，$B_\ell$ 是该路径反馈比特数。缩放因子可理解为均匀量化相位误差在单位圆上的条件平均：比特多时趋于 1；强路径的误差贡献更大，因此优先分配比特。作者还用误差协方差设计稳健多用户预编码。[图 8](https://arxiv.org/html/2405.08614v1#S6.SS3) 在 10/12 GHz、16 用户、每用户 3 路径仿真中，约 20 bit/用户的路径相位反馈已接近完美 CSIT 的 WMMSE 参考；这是特定模型的反馈负载，不含整个导频、控制与协议开销。图 9–10 检查参数估计误差和路径数；密集多径及上下行路径无法可靠关联时，应重新评估这一结果。

**高移动性。** [Qin、Yin、Cao、Li、Gesbert，JADD，IEEE TWC 2022](https://doi.org/10.1109/TWC.2022.3178499)（[公开全文](https://arxiv.org/pdf/2202.05564)）。基站用 Matrix Pencil 从一段上行观测提取角度、时延、多普勒；据此构造下行宽带探测波束；UE 反馈少量复系数；基站按式 (53) 把信道预测到发送时刻。表 I 使用 3GPP CDL-A、1.92/2.11 GHz、20 MHz；图 3 在 5 ms 延迟、无噪信道样本设置下比较 60/350 km/h，结果优于文中的延迟 Enhanced Type II、APF-RNS 和 TVAL3 基线；图 4 再看反馈量化和不同时延。350 km/h 与 10 ms 是论文覆盖的仿真条件，不是商用系统保证。路径生灭或多普勒估计失准会破坏时间外推。

## 5. 学习式融合：从解码侧信息到联合训练

| 文献 | 上行信息放在哪里 | 结果及边界 |
|---|---|---|
| [Liu、Zhang、Ding，DualNet，IEEE WCL 2019](https://par.nsf.gov/servlets/purl/10149759) | 基站解码用上行幅度（MAG）或实虚部绝对值（ABS）作侧信息 | 是建立双分支基线的起点；有[作者代码](https://github.com/DLinWL/Bi-Directional-Channel-Reciprocity)。不能把仿真中的幅度相关视为所有 FDD 频段恒定。 |
| [Guo、Wen、Jin，CAnet，IEEE TCOM 2022](https://arxiv.org/html/2101.04377v1#S6.SS4) | 东南大学与中山大学（台湾）署名团队：上行角域幅度既设计下行导频，也帮助基站解码；CAnet-J 压缩接收导频观测 | SCM UMi，5.1/5.3 GHz、64 基站天线、单 UE 天线。表 IV 在 24 bit、6 个下行导频时，CAnet-S → CAnet-J 的 NMSE 为 −4.59 → −7.11 dB；16 bit、8 个导频时 J 略逊于 S（−4.32 对 −4.52 dB）。 |
| [Guo、Chen、Ai，UJEFNet，2025 预印本](https://arxiv.org/html/2504.10836v1#S4.SS4) | 北京交通大学团队：DJSCC 编码下行导频观测，基站角频域解码并融合有估计误差的上行 CSI，按式 (20) 端到端最小化下行信道平方误差 | CDL-C/Sionna，5.6/5.4 GHz、32×1 天线、256 子载波；训练/验证/测试 100k/30k/10k 对。图 9 中 $K=8$（反馈符号数）、16 个下行导频、下行估计 SNR 10 dB，反馈链路 SNR −10/+10 dB 时，融合相对 JEFNet 改善 NMSE 1.10/1.24 dB；只加深的 DJEFNet 改善 0.06/0.14 dB。在 $K=16$、反馈链路 SNR 10 dB 时，仅加深约改善 1.44 dB，超过融合的约 1.14 dB，说明收益依条件而变。连续反馈符号数不能直接换算为数字反馈比特。 |
| [Liu、Ma、Tafazolli、Ding，Dual-ImRUNet，2025 预印本](https://arxiv.org/html/2507.12301v1#S4) | 萨里大学 6GIC 与加州大学戴维斯分校团队：对齐上下行特征、补偿频段差异，用 Transformer 恢复下行预编码相关的特征向量 | 2.48/2.60 GHz、32×4、30 个未见城市地图射线追踪测试。图 5 在 SGCS 0.85 处报告仅 6 bit，相对作者比较的 Ubi-ImCsiNet 少约 85%；SGCS 衡量子空间方向相似度，不等于复数信道 NMSE 或吞吐率。 |

原文结果索引：以上链接定位到相应图表章节；JADD 见公开 PDF 第 9 页。开放可读不等于开放再版，本稿未确认上述结果图的可再发布许可，保留原图入口。下方复现实验是建议，不是论文已报告结果。

## 6. 如果你说的是 Wi‑Fi sounding

Wi‑Fi 的显式波束成形探测中，接收端可由 NDP 估计 CSI，再将其中的波束成形信息编码为 BFI/BFM 反馈。用简化模型说明：若 $H=U\Sigma V^{\mathrm H}$，压缩反馈可近似写为 $q=Q(V_{1:r})$（还有依帧格式而定的 SNR 信息）。两条具有不同 $U$ 或奇异值、但相同 $V_{1:r}$ 的信道可能有相同角度反馈，因此不能把 BFI 一般性地逆变换成原始 CSI。若两路来自同一帧同一 CSI，BFI 是其派生量；若来自不同链路、端口或时刻，才可能带来新的观测。

[BeamSense 原文](https://arxiv.org/abs/2303.09687) 与 [BFMSense（USENIX NSDI 2024）](https://www.usenix.org/conference/nsdi24/presentation/yi) 主要验证 BFI/BFM 作为感知输入的价值，不能当成双源融合收益的证据。Haque、Meneghello、Restuccia 的 [CSI-BFI-HAR](https://mentis.info/publications/datasets-for-human-activity-recognition-with-integrated-sensing-and-communications-in-wi-fi/) 用商用 802.11ac 做 LoS/NLoS 采集，覆盖 20 类活动、6 名参与者、6 种布设；[作者代码和同步采集说明](https://github.com/kfoysalhaque/BeamSense)可用于建立真正的 CSI-only、BFI-only 和融合对照。做窗口对齐时检查链路方向、子载波组、包时间戳和缺包；按人、房间、采集日切分，避免相邻窗口跨训练和测试。

## 7. 可落地的研究问题：让两路数据按可靠性分工

先实现 TDD 伪逆或 FDD 路径相位作为强基线，再做「物理先验 + 可学习残差」。一种建模方式是把下行目标写成 $h$（全信道向量或降维系数），由上行生成均值 $\mu_u$ 和不确定度 $R_u$，用下行有效观测 $z$ 修正。在独立复高斯误差、已对齐、线性反馈代理 $z=Ah+e$、$e\sim\mathcal{CN}(0,R_d)$ 的条件下：

$$\widehat h=\mu_u+R_u A^{\mathrm H}(A R_u A^{\mathrm H}+R_d)^{-1}(z-A\mu_u).$$

这是一条本文建议的可解释基线。上行越可靠，修正通常越小；下行越可靠，在可观测子空间内越能纠正上行先验。若输入是 PMI 或其他非线性码本反馈，应使用码字似然/预编码子空间损失，不能把 PMI 索引当作线性观测。若两路共享估计误差，应建联合协方差，避免重复计数。学习式版本可让门控读取 SRS SNR、观测龄期、端口覆盖、校准残差和反馈位数，训练时随机丢失一路，并用错配 SRS 检查模型是否真的利用同一用户的上行信息。

| 实验环节 | 对照与评估 |
|---|---|
| 固定预算 | 比较 SRS-only、反馈-only、朴素拼接、伪逆/MMSE、同参数量双分支。固定 SRS 与 CSI-RS 资源、反馈比特或信道使用次数，另报重建/调度时延。 |
| 压力测试 | 改变 UE 发射端口数、SRS SNR、上下行频差、观测龄期和校准误差；整小区或整轨迹留出；测试缺失/延迟/错配 CSI。 |
| 指标 | 复信道报 NMSE；预编码方向报 SGCS；面向部署报净频谱效率、5% 用户速率和反馈/导频开销。固定调度与预编码算法并报告统计区间。 |
| 成功标准 | 同预算超越最强单源与物理融合基线；任一路恶化时，可靠性门控可退化至另一条可用分支；收益能在未见小区或设备上复现。 |

推荐阅读顺序：**Merge for Reconstruction → Lee 的 TDD 伪逆 → Kim 的 FDD 相位反馈 → UJEFNet 的上行侧信息消融**。若研究重点是信道老化，在第三步加入 JADD；若做 Wi‑Fi 感知，则从 CSI-BFI-HAR 的数据定义与分割协议开始。
