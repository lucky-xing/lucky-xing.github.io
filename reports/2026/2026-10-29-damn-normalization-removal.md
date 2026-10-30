# DaMN：如何从预训练模型中删除并迁移归一化层

DaMN 的准确标题是 **DaMN: Deleting and Migrating Normalization Layers from Transformers**。这项工作研究的不是怎样从零训练一个没有 LayerNorm 的模型，而是：**已经获得一个高质量预训练模型后，能否用校准和追加微调，把依赖当前输入统计量的归一化变换，迁移成可以融合进现有权重的静态变换？**

本文精读 **CVPR 2026 Findings 正式公开版，2883–2892 页，正文 10 页，以及官方补充材料 16 页、附录 A–I**，区分论文结果、公式等价整理和本报告的分析。作者为 Alexey Ryabykin、Irina Zhelavskaya、Egor Shvetsov、Alexey Rukhovich、Nikita Okhotnikov、Artem Khrapov、Evgeny Burnaev、Vladimir Mikhailovich Kryzhanovskiy。核验日期：2026-10-29。[官方条目](https://openaccess.thecvf.com/content/CVPR2026F/html/Ryabykin_DaMN_Deleting_and_Migrating_Normalization_Layers_from_Transformers_CVPRF_2026_paper.html) · [正式版 PDF](https://openaccess.thecvf.com/content/CVPR2026F/papers/Ryabykin_DaMN_Deleting_and_Migrating_Normalization_Layers_from_Transformers_CVPRF_2026_paper.pdf) · [官方补充材料](https://openaccess.thecvf.com/content/CVPR2026F/supplemental/Ryabykin_DaMN_Deleting_and_CVPRF_2026_supplemental.pdf)

## 1. 核心判断：可用的部署改造流程，需要认真评估质量代价

DaMN 把三个已有直觉组合成一个可操作流程：**先匹配矩以建立仿射替身，再按网络拓扑顺序校准，最后用渐变系数边微调边移除原归一化，并融合替身。**价值主要在预训练资产的部署改造，而非提出更强的归一化函数。

应把收益和代价一起阅读：

- 图像恢复任务总体质量接近原模型，Restormer 在 SIDD 上为 40.02 → 39.96 dB；但“所有任务损失都小于 0.2 dB”并不成立，主表中 SRFormer 的 Set14 为 34.79 → 34.41 dB，损失 0.38 dB。
- 图像分类的代价更明显：Swin-B 为 83.4% → 81.2%，下降 **2.2 个百分点**；ViT-B、ConvNeXt-B 分别下降 0.4 个百分点。
- A100 / FP16 的 Restormer 推理时间减少 17.9%，但 MambaIR、SRFormer 只减少 3.7%、3.9%，并非所有模型都接近上限。
- 语言模型只实现**部分删除**：Modded-NanoGPT 删除 45 个归一化中的 30 个，Qwen2.5-1.5B 删除一半。不能据此宣称已让大语言模型完全无归一化。
- 需要校准集与额外训练；“30% 微调预算”是一些实验相对原训练的追加预算，不是包括预训练在内的总成本只有 30%。

本报告建议把它视为**吞吐、能耗与质量之间的部署选项**，而不是对任何预训练模型都能无损应用的自动删除工具。

## 2. 问题建模：从输入自适应算子，转为静态、可融合算子

### 2.1 已知量、输入输出与优化目标

设已有预训练网络 $F_{\theta_0}$，内部共有 $L_N$ 个待处理归一化算子 $N_l$。隐藏张量可写为 $X\in\mathbb R^{B\times T\times C}$，对 token 的通道向量 $x\in\mathbb R^C$，标准 LayerNorm 是：

$$
N(x)_c=\gamma_c\frac{x_c-\mu(x)}{\sqrt{\sigma^2(x)+\epsilon}}+\beta_c,
\qquad
\mu(x)=\frac1C\sum_jx_j,\quad
\sigma^2(x)=\frac1C\sum_j(x_j-\mu(x))^2.
$$

这是本报告为建模补充的标准定义，不是 DaMN 的编号公式。RMSNorm 不减均值，而使用 $\sqrt{C^{-1}\sum_jx_j^2+\epsilon}$ 缩放。二者都依赖当前 token 的数据统计，不能像推理阶段统计固定的 BatchNorm 那样直接作常数折叠。

已知量包括预训练权重、归一化位置与结构、校准集 $\mathcal D_{\rm cal}$ 和用于微调的任务数据。未知量包括替身参数以及微调后的其余网络权重。输出应是性能可以接受、待删归一化不再出现在部署图中的模型。将任务损失和部署意图用本报告的统一表达写成：

$$
\min_{\theta,\{g_l,b_l\}}\;
\mathbb E_{(u,v)\sim\mathcal D_{\rm ft}}
\ell\!\left(F_{\theta,\{g_l,b_l\},\alpha(t)}(u),v\right),
\qquad \alpha(T)=0.
$$

这不是原文提出的约束优化算法，而是对训练过程的整理。分类使用分类损失，恢复任务使用对应原模型的训练目标，语言模型使用相应预训练或监督微调目标；不要在没有实现依据时额外加上“教师蒸馏损失”。$\alpha$ 是外部调度变量，不是通过这个目标自由学习的参数。

### 2.2 为什么不能直接删掉

例如 Pre-LN 残差分支为 $h^+=h+G(N(h))$。直接改成 $h+G(h)$ 后，分支输入的均值、幅度和相对通道关系改变，原权重并不保证仍处于适用范围。这与“训练完后无需再稳定梯度”是两回事：**训练后的归一化仍参与模型的实际函数。**

原文第 2.2 节用反复仿射变换说明误差随深度放大。若统一写成 $z_{l+1}=a z_l+b$，本报告整理为：

$$
\mathbb E[z_L]=a^L\mathbb E[z_0]+b\sum_{k=0}^{L-1}a^k,
\qquad
\operatorname{Var}(z_L)=a^{2L}\operatorname{Var}(z_0).
$$

原文对应几何和写到 $\beta^L+\cdots+1$，与通常 $L$ 次递推的求和上界有索引差异；其示意目的仍是尺度误差累积。也不能把 $|a|>1$ 时均值必定趋向正无穷作为一般结论：符号、初值和抵消会影响均值，方差放大才是更稳妥的说明。这只是玩具模型，不是含残差、注意力的真实网络稳定性定理。

## 3. 方法第一步：为归一化建立矩匹配的仿射替身

### 3.1 直接插值只是起点，完整方法插值的是仿射分支

原文式（1）先定义简单移除形式：

$$
y(\alpha)=(1-\alpha)x+\alpha N(x).
$$

当 $\alpha=1$ 时保持原层，当 $\alpha=0$ 时为恒等。但如果 $x$ 与 $N(x)$ 的尺度差异大，即使逐渐混合也可能不稳定。完整 DaMN 用原文式（3）将恒等分支改为可学习仿射替身：

$$
A(x)=g\odot x+b,\qquad
y(\alpha)=(1-\alpha)A(x)+\alpha N(x),\quad g,b\in\mathbb R^C.
$$

这里 $g,b$ 对应原文的 $\gamma',\beta'$，改记号是为了与原 LN 的 $\gamma,\beta$ 区分。**$\alpha=0$ 时实际留下的是仿射映射，不必满足 $g=1,b=0$。**所谓最终“删成恒等”，应结合后续仿射融合理解：部署图里不再单独保留这个算子，而不是它在数学上自然变成了恒等函数。

### 3.2 校准统计沿哪个轴计算

对校准集产生的当前层输入与原层输出，收集每个通道跨样本、token / 空间位置的均值与方差。原文式（4）–（6）为：

$$
m_x=\mathbb E[x],\quad s_x=\sqrt{\mathbb E[(x-m_x)^2]+\epsilon},
\qquad
m_N=\mathbb E[N(x)],\quad s_N=\sqrt{\mathbb E[(N(x)-m_N)^2]+\epsilon},
$$

$$
g=\frac{s_N}{s_x},\qquad b=m_N-g\odot m_x.
$$

向量运算均按通道进行。这里估计的是**跨校准激活的通道统计**，不是把 LN 在每个 token 内算的均值方差原样保存下来。若数据来自经过上游替换后的网络，统计也必须基于那个当前网络。

忽略稳定项、且某通道方差非零时，可以直接验证：

$$
\mathbb E[A(x)]=m_N,\qquad
\operatorname{Var}(A(x))=g^2\operatorname{Var}(x)=\operatorname{Var}(N(x)).
$$

这是本报告的代数推导。加入 $\epsilon$ 后只能近似匹配原始方差。更重要的是，匹配两阶矩不保证每个样本的输出相同，也不保留所有通道协方差：

$$
\operatorname{Cov}(A(x))=D_g\operatorname{Cov}(x)D_g,
\qquad D_g=\operatorname{diag}(g).
$$

它没有足够自由度复制一般的 $\operatorname{Cov}(N(x))$，更无法逐点复制输入依赖的 LN。矩匹配只是让替换起点更可用，后续微调仍然必要。

### 3.3 为什么强调 Welford：数值误差与采样误差是两种问题

作者使用 Welford 算法积累均值与方差，避免直接用 $\mathbb E[x^2]-\mathbb E[x]^2$ 造成浮点抵消。本报告补充其标准递推，解释实现需求：

$$
\delta=x_n-m_{n-1},\quad m_n=m_{n-1}+\delta/n,
\qquad M_{2,n}=M_{2,n-1}+\delta(x_n-m_n).
$$

校准总体方差可用 $M_{2,n}/n$，若采用无偏样本方差则分母不同；实现需统一。分布式统计还应正确合并 count、mean、$M_2$，不能不加权平均各卡方差。

Welford 改善数值精度，**不会自动解决校准集不代表部署分布的问题**。极少样本、低方差通道或长尾输入仍可能给出不可靠的 $g,b$。

附录 C 还说明：最初 BF16 累加的一阶/二阶矩估计在 LLM 上不稳定；GPT 实验改用 Welford，附录 I 写统计使用 FP64。Qwen 则仍用二阶矩减均值平方，但把两种和的累加提升到 FP64。因此“所有实验必须且都使用 Welford”不是原文的实际协议。

## 4. 方法第二步：按拓扑顺序校准，避免后层使用过时统计

<figure class="paper-figure" id="pipeline">
<a href="/assets/papers/damn-normalization-removal/fig02-pipeline.png" target="_blank" rel="noopener"><img src="/assets/papers/damn-normalization-removal/fig02-pipeline.png" alt="DaMN原文图2：顺序校准、渐进微调与参数融合流程" width="1500" height="834" loading="lazy"></a>
<figcaption>原文图 2，正式版第 2887 页：保留完整流程、残差图例和原图注。来源：<a href="https://openaccess.thecvf.com/content/CVPR2026F/papers/Ryabykin_DaMN_Deleting_and_Migrating_Normalization_Layers_from_Transformers_CVPRF_2026_paper.pdf#page=5">官方 PDF，第 5 页</a>。原图版权归作者或相应权利人，本文为研究评论引用。</figcaption>
</figure>

如果先在原网络中一次性采集所有层的统计，然后同时替换，后层实际输入已经被前层改造过，原来的校准参数不再对应真实输入。DaMN 的顺序校准可按如下逻辑理解：

1. 保留待替换原层副本，并按真实计算图列出归一化的拓扑顺序。
2. 对当前层收集输入 $x_l$ 与 $N_l(x_l)$ 的矩；此时上游已经采用其校准后的仿射替身。
3. 计算当前层 $g_l,b_l$，临时启用该仿射替身，再向后校准下一层。
4. 完成后进入混合分支微调。校准时的上游替换，与微调时 $\alpha$ 从 1 到 0 的整体调度，应作为两个阶段区分。

这里的“顺序”是**顺序估计统计**，不等同于每删一层都完整微调一次。原文第 2.3 节明确没有把成本较高的逐层删除再逐层微调方案纳入主基线；不能声称已经在同预算下战胜所有顺序微调方法。

<figure class="paper-figure result-figure" id="sequential-results">
<a href="/assets/papers/damn-normalization-removal/fig05-sequential.png" target="_blank" rel="noopener"><img src="/assets/papers/damn-normalization-removal/fig05-sequential.png" alt="原文图5：Swin-B不同删除与校准策略的层间输出方差" width="729" height="459" loading="lazy"></a>
<figcaption>原文图 5，正式版第 2887 页，完整保留坐标、曲线、NaN 标记和原注。蓝：朴素删除，橙：非顺序校准，绿：顺序校准，红：原网络。来源：<a href="https://openaccess.thecvf.com/content/CVPR2026F/papers/Ryabykin_DaMN_Deleting_and_Migrating_Normalization_Layers_from_Transformers_CVPRF_2026_paper.pdf#page=5">官方 PDF，第 5 页</a>。原图版权归原权利人，本文为研究评论引用。</figcaption>
</figure>

绿线跟随原网络红线，蓝、橙则在较早深度出现爆炸。这支持“前层改变后需要重新估计后层输入”的解释。但保持的是类似原模型的层间尺度，原模型本来就有明显的方差峰值；不能把顺序校准说成把所有层方差统一压成常数，或形式上保证任意深度稳定。

顺序处理可能需要多次遍历校准数据，算力成本取决于层数、缓存和是否只执行网络前缀。论文的“轻量校准”不应被解释为总能在一次前向中完成。

补充材料附录 D、表 S3 的 ×4 / Set14 消融进一步量化了差异：MambaIR 非顺序方案校准和微调后均 NaN，顺序方案从 26.40 恢复到 29.14 dB；SRFormer 非顺序从 27.16 恢复到 29.04，顺序从 28.61 恢复到 29.09 dB。顺序校准对后者的最终差额只有 0.05 dB，但起点和稳定性更好。**附录 I 的 Qwen 实验反而不使用顺序校准，因为作者发现该设置结果更好**；这说明它是重要但并非所有架构都必需的设计选择。

## 5. 方法第三步：余弦移除、任务微调与精确参数融合

### 5.1 调度要给网络足够的适应时间

原文式（2）为：

$$
\alpha_t=\begin{cases}
\tfrac12(1+\cos(\pi t/T)),&0\le t\le T,\\
0,&t>T.
\end{cases}
$$

它连续、单调下降，并在有限步到达零；$T$ 是调度长度，不一定等于全部追加训练长度。若调度覆盖微调过程的 80%，最后 20% 可以在完全去掉原分支后继续适应。

平滑不等于保证无漂移。以一个通道为例，本报告推导混合输出方差为：

$$
\operatorname{Var}(y)=
(1-\alpha)^2\operatorname{Var}(A)+\alpha^2\operatorname{Var}(N)
+2\alpha(1-\alpha)\operatorname{Cov}(A,N).
$$

即使两个分支分别匹配均值方差，相关性不等于 1 时，中间态方差仍会改变。因此需要任务微调；“只要系数光滑就稳定”不是充分条件。

原文表 3 给出的是已试验的失败与成功区间：Swin-B 的 0–10 epoch 调度失败、100 epoch 成功；ViT-B 的 0–5 失败、100 成功；GPT-2 的 0–600 iterations 失败、800–1000 成功。它没有证明这就是最小可行长度，也不应把 GPT-2 的 iteration 和视觉模型的 epoch 混算。

### 5.2 为什么可以融合，什么情况下不能直接融合

当 $\alpha=0$，若仿射后接线性层 $z=WA(x)+c$，则本报告给出等价重参数化：

$$
z=W D_gx+Wb+c=W'x+c',\qquad
W'=WD_g,\quad c'=Wb+c.
$$

$W\in\mathbb R^{D\times C}$，融合只是按输入通道缩放权重列，并修改输出偏置。若仿射在一个线性层之后，则可用 $W'=D_gW$、$c'=D_gc+b$。这些等式对给定微调后参数成立，**不意味着融合后模型与最初预训练模型完全等价**；后者的质量差异来自前面替换与微调。

需要逐图核实融合条件：

- 同一个仿射输出若分叉到 Q、K、V 等多个投影，相关消费者都要正确处理。
- Pre-LN 的残差旁路应保持原语义；不能把只应作用于注意力分支的缩放错误地施加到整条残差流。
- 无偏置投影吸收 $b$ 可能需要增加偏置；遇到非线性、共享权重或条件调制时，不能直接跨过去折叠。
- 通道仿射与点式线性 / 1×1 卷积通常容易融合；在带 padding 的空间卷积前融合平移，边界处未必能用单一常数偏置精确表示。

因此实现上应验证融合前后最大绝对 / 相对误差、部署图中实际剩余节点和真实时延。浮点融合有舍入误差，跨精度或量化部署需重新检查。

## 6. 组件消融：哪些证据支持这条流程

### 6.1 单层替换：仿射初始化避免立即失效，但不是整网免微调

<figure class="paper-figure result-figure" id="surrogate-results">
<a href="/assets/papers/damn-normalization-removal/fig03-surrogate.png" target="_blank" rel="noopener"><img src="/assets/papers/damn-normalization-removal/fig03-surrogate.png" alt="原文图3：Swin-B第一归一化或第一下采样归一化的移除，比较是否使用仿射替身" width="726" height="492" loading="lazy"></a>
<figcaption>原文图 3，正式版第 2887 页：只处理第一归一化或第一下采样归一化，其余层保持不变，且没有微调。保留两幅子图、坐标、图例和原注。来源：<a href="https://openaccess.thecvf.com/content/CVPR2026F/papers/Ryabykin_DaMN_Deleting_and_Migrating_Normalization_Layers_from_Transformers_CVPRF_2026_paper.pdf#page=5">官方 PDF，第 5 页</a>。原图版权归原权利人，本文为研究评论引用。</figcaption>
</figure>

横轴 $\alpha$ 从 1 向 0，红线较稳定，蓝线明显下降。正确结论是矩匹配改善了**特定单层替换**的初始条件；不能据此说整网可以不微调地删完。正文概括蓝线接近 0%，但实际图上的两个端点并非都精确为零，本报告不从曲线估读精确准确率。

### 6.2 参数噪声：统计误差会让深层网络付出放大代价

<figure class="paper-figure result-figure" id="noise-results">
<a href="/assets/papers/damn-normalization-removal/fig04-noise.png" target="_blank" rel="noopener"><img src="/assets/papers/damn-normalization-removal/fig04-noise.png" alt="原文图4：MambaIR仿射替身参数噪声与PSNR、NaN概率关系" width="726" height="432" loading="lazy"></a>
<figcaption>原文图 4，正式版第 2887 页：MambaIR ×2，对仿射参数施加相对高斯噪声，观察 PSNR 与 NaN 失败比例；虚线为原模型。保留阴影、失败标记及原注。来源：<a href="https://openaccess.thecvf.com/content/CVPR2026F/papers/Ryabykin_DaMN_Deleting_and_Migrating_Normalization_Layers_from_Transformers_CVPRF_2026_paper.pdf#page=5">官方 PDF，第 5 页</a>。原图版权归原权利人，本文为研究评论引用。</figcaption>
</figure>

图中小扰动已造成明显质量下降；正文举例 25% 噪声时 80% 尝试出现 NaN。这里的“噪声”是人为扰动仿射参数，不是图像输入噪声水平，也不是测得校准算法自然有 25% 误差。零噪声的红点仍明显低于原模型虚线，说明统计匹配并非替代后续训练的质量恢复手段。

附录 E 明确了噪声口径，按本报告的 $g,b$ 记号整理为：

$$
\widetilde g_i=g_i+\sigma\left(C^{-1}\sum_j|g_j|\right)\varepsilon_i^g,
\qquad
\widetilde b_i=b_i+\sigma\left(C^{-1}\sum_j|b_j|\right)\varepsilon_i^b,
\quad \varepsilon_i^g,\varepsilon_i^b\sim\mathcal N(0,1).
$$

这按每层参数向量的平均绝对幅度设置噪声，不是把每个分量都乘同一百分比；原文没有充分报告各噪声点独立试验总次数，失败比例不应被包装成严格概率保证。

### 6.3 只有平滑仍不够：要区分局部删除实验与主方法

原文表 2 仅比较“只平滑、没有仿射和顺序校准”与朴素删除。在 Swin-B 53 个 LN 中删除 24 个，基线 top-1 为 83.418%，平滑后为 83.246%，而朴素方案不到 1 epoch 就 NaN。这支持平滑的作用，但不是全部删除成功的证据。

该表 epoch 列为原始训练 300、平滑方案 450；若按总 epoch 理解，相当于追加 150，即原训练的 50%。本报告不把这里的实验与图像恢复的“追加 30%”混为同一预算，也不把单个组件消融当作完整 DaMN 的主结果。

## 7. 任务结果与真实对比：并非所有模型都优于 DyT

### 7.1 超分辨率：相对朴素删除更可靠，但存在不可忽略的损失

<figure class="paper-figure result-figure" id="sr-results">
<a href="/assets/papers/damn-normalization-removal/table04-super-resolution.png" target="_blank" rel="noopener"><img src="/assets/papers/damn-normalization-removal/table04-super-resolution.png" alt="原文表4完整截图：SwinIR、MambaIR和SRFormer在五个超分数据集上的PSNR与SSIM" width="1500" height="837" loading="lazy"></a>
<figcaption>原文表 4，正式版第 2889 页：×2 超分，保留全部模型、基线、五个数据集、PSNR/SSIM、发散说明及星号。原表注未在此处完整解释所有星号，正文说明部分星号对应后续训练失稳，不能作为稳定最终结果。来源：<a href="https://openaccess.thecvf.com/content/CVPR2026F/papers/Ryabykin_DaMN_Deleting_and_Migrating_Normalization_Layers_from_Transformers_CVPRF_2026_paper.pdf#page=7">官方 PDF，第 7 页</a>。原图版权归原权利人，本文为研究评论引用。</figcaption>
</figure>

原文基于 DF2K 训练与复现 SwinIR、MambaIR、SRFormer，在 Set5、Set14、BSD100、Urban100、Manga109 评估。基线包括原归一化模型、无归一化从头训练 Identity、直接删层再微调 Naive、DyT 和 SLAB 的归一化部分。下面把表 4 的 PSNR 单独整理；顺序均为这五个数据集，单位 dB。

| 模型 | Original | DaMN | DaMN − Original（本报告相减） |
|---|---|---|---|
| SwinIR，74 NL | 38.40 / 34.44 / 32.55 / 33.81 / 39.92 | 38.30 / 34.41 / 32.41 / 33.68 / 39.70 | −0.10 / −0.03 / −0.14 / −0.13 / **−0.22** |
| MambaIR，110 NL | 38.54 / 34.69 / 32.55 / 34.12 / 40.26 | 38.49 / 34.52 / 32.55 / 33.93 / 40.12 | −0.05 / −0.17 / 0.00 / −0.19 / −0.14 |
| SRFormer，74 NL | 38.58 / 34.79 / 32.60 / 34.35 / 40.24 | 38.42 / 34.41 / 32.55 / 34.13 / 40.10 | −0.16 / **−0.38** / −0.05 / **−0.22** / −0.14 |

这张完整表很重要：摘要“低于 0.2 dB”不能覆盖所有格子，正文称 SRFormer “matches baseline”也比实际表格更乐观。PSNR 的小差值也不能直接等同于人眼无差异；SSIM 同样需要核查，例如 SwinIR 的 Manga109 SSIM 从 0.9797 变成 0.9736。

相对 DyT，MambaIR 的 Urban100 是 DaMN 33.93、DyT 33.69 dB，DaMN 更好；但 SwinIR 的 Set5 是 38.30 对 38.34、Manga109 是 39.70 对 39.76，DaMN 更低。SRFormer 的 Set14，SLAB 为 34.78、DyT 34.46、DaMN 34.41，DaMN 也不是第一。它的主要优势应结合**后训练可用性与部署开销**评价，而非宣称每个数据集准确率都赢。

图像恢复实验通常追加原训练 30% 左右的微调，$\alpha$ 调度覆盖追加阶段的 80%。正文方法总述说校准集占 20–30%，但第 4.2 节超分和去噪实际写约 40%，不应将两者不加区分地合并为统一协议。

附录 F 说明 SRFormer 复现配置与官方 checkpoint 架构不完全相同；×3、×4 的训练由 ×2 checkpoint 初始化，改动上采样模块并固定特征提取层。附录 G、表 S6 还有更大倍率的损失：MambaIR ×4 在 Manga109 从 32.29 降到 31.94 dB，下降 0.35 dB；SRFormer ×4 在 Urban100 从 27.72 到 27.71，几乎持平。倍率与模型依赖性明显。附录文字称 MambaIR 所有尺度 PSNR/SSIM 都最好，但表 S6 的 ×4 Manga109，DyT SSIM 0.9231 高于 DaMN 0.9219，不能照搬全胜概括。

### 7.2 真实图像去噪：质量接近，Identity 的中途结果要标明

Restormer 在 SIDD 上，表 5 为：

| 方法 | PSNR dB | SSIM | 解释 |
|---|---:|---:|---|
| Original | 40.02 | 0.9603 | 带归一化的复现基线 |
| Identity | 38.26* | 0.9513* | 中途结果，后续训练失败 |
| DyT | 39.98 | 0.9601 | 逐元素替代，需从头训练的对照 |
| DaMN | 39.96 | 0.9601 | 追加微调后的部署改造 |

DaMN 相对 Original 损失 0.06 dB，相对 DyT 低 0.02 dB，确实接近基线。Identity 在后续迭代变为 NaN，其表中数字不能当成稳定训练完成的模型。正文同时提到约 7000 iterations 后失稳和展示前 4000 iterations 的结果，评估哪个 checkpoint 也应在复现时记录。

### 7.3 图像分类：速度收益伴随明确准确率下降

<figure class="paper-figure result-figure" id="classification-results">
<a href="/assets/papers/damn-normalization-removal/table06-classification.png" target="_blank" rel="noopener"><img src="/assets/papers/damn-normalization-removal/table06-classification.png" alt="原文表6：ImageNet分类基线与DaMN准确率比较，包含所有方法和失败结果" width="726" height="495" loading="lazy"></a>
<figcaption>原文表 6，正式版第 2890 页，完整保留表注、所有基线及失败标记。ConvNeXt-B 是卷积网络，不能因出现在本文而称为标准 Transformer。来源：<a href="https://openaccess.thecvf.com/content/CVPR2026F/papers/Ryabykin_DaMN_Deleting_and_Migrating_Normalization_Layers_from_Transformers_CVPRF_2026_paper.pdf#page=8">官方 PDF，第 8 页</a>。原图版权归原权利人，本文为研究评论引用。</figcaption>
</figure>

| ImageNet top-1 | Swin-B | ViT-B | ConvNeXt-B |
|---|---:|---:|---:|
| Original | 83.4% | 83.0% | 83.1% |
| Naive Removal | 发散 | 发散 | 发散 |
| SkipInit | 72.3% | 74.1% | 73.1% |
| Fixup | 77.5% | 77.2% | 73.7% |
| DyT | 81.3% | 82.5% | 82.3% |
| SLAB（仅 PBN 部分） | 81.6% | 82.5% | 82.5% |
| DaMN | **81.2%** | **82.6%** | **82.7%** |
| DaMN 比 Original 下降 | **2.2 个百分点** | 0.4 个百分点 | 0.4 个百分点 |

DaMN 在 ViT-B、ConvNeXt-B 上略高于两个主要替代方案，但 Swin-B 低于 DyT 和 SLAB。所有方法的基线与训练预算需用本论文自己的配置比较，不能把上一篇 Derf 的 ViT-B 82.8% 与这里 82.6% 直接排总榜：两篇原模型基线分别为 82.3% 和 83.0%，配方和实验目标不同。

SLAB 原法还包括 Simplified Linear Attention，本论文去掉 SLA，只保留 Progressive Batch Normalization。因此此处的“SLAB”是隔离归一化组件后的作者对照，不能解释为原版完整 SLAB 系统的复现性能。表中没有多随机种子误差条，0.1–0.2 个百分点的差距也不等于统计显著胜出。

附录 H 的分类配置：单节点 8 GPU，校准使用约 20% 训练集，追加微调为原训练 epoch 的 30%，$\alpha$ 调度覆盖整个追加阶段。ViT 使用 timm 训练策略并加入 RoPE，因此不是不加区分的原版 ViT。补充表 S7 的文献原始 / 复现准确率分别为 Swin-B 83.4 / 83.4、ViT-B 83.6 / 83.0、ConvNeXt 83.8 / 83.1；主表中的 Original 指复现起点。本报告据此计算改造损失。

### 7.4 语言模型：部分移除的探索性证据

| 模型与任务 | 删除范围 | 原始 → DaMN | 应怎样理解 |
|---|---|---|---|
| Modded-NanoGPT 128M，FineWeb | 45 个 NL 中删除 30 个 | validation loss 3.29 → 3.22；DyT 为 3.27 | 作者认为可能原模型尚未收敛，不能单凭此证明删除改善泛化 |
| Qwen2.5-1.5B，OpenMathInstruct-2 微调，MATH500 | 删除一半 NL | Pass@1 29.6 → 28.8 | 下降 0.8 个百分点，非整网全删成功 |

原文对 NanoGPT 说保留在最后两个 decoder 层中、继续删除会发散。但 45 个归一化究竟包含哪些位置、与普通 GPT-2 的数量如何对应，必须结合具体 Modded-NanoGPT 版本核查，不能凭标准 GPT-2 结构重建计数。

<figure class="paper-figure result-figure" id="llm-results">
<a href="/assets/papers/damn-normalization-removal/tableS08-language.png" target="_blank" rel="noopener"><img src="/assets/papers/damn-normalization-removal/tableS08-language.png" alt="补充表S8完整截图：NanoGPT与Qwen的全部语言任务结果，保留明显下降的指标" width="1500" height="570" loading="lazy"></a>
<figcaption>官方补充材料表 S8，第 14 页，保留全部任务、指标及原注。Qwen 的数学微调与 FineWeb-Edu 后训练为两组实验，不应混成一个 checkpoint。来源：<a href="https://openaccess.thecvf.com/content/CVPR2026F/supplemental/Ryabykin_DaMN_Deleting_and_CVPRF_2026_supplemental.pdf#page=14">官方补充 PDF</a>。原图版权归原权利人，本文为研究评论引用。</figcaption>
</figure>

附录 I 消除了计数疑问，同时揭示正文概括不够准确：

- **NanoGPT 不同于标准 GPT-2。**使用约 `45544f533ae9528ce0f94f2416fd9bd59c2ad54c` 的 Modded-NanoGPT 变体，含 Q/K Norm；1390 steps 的 speedrun 起点验证 loss 3.285，校准使用 1000 batches，FP64 统计。表 S9 显示 block 0–6 的四种 Norm 全删、block 7 只有 pre-MLP Norm 且删掉、block 8 只删 Q Norm，block 9–11 保留；最终输出归一化等未列在表中的部分不能自行推断。“只保留最后两个 decoder 层”的正文描述与这张逐层表不一致，应以明确节点清单为复现依据。
- **额外训练是重要混杂。**作者让 DyT 总步数等于原训练加 DaMN 追加步数；另将未改动的 NanoGPT 训练到 4000 steps，loss 达到 3.145，低于 DaMN 的 3.22。这直接支持“原始 speedrun 尚未收敛”，不能将 3.29 → 3.22 当成删除归一化本身优于继续训练的证明。
- **Qwen 删除的是 28 个 block 的 input / pre-attention RMSNorm，保留全部 pre-MLP RMSNorm。**28/56 的分母指这两类 block 内部归一化，不代表整个模型所有归一化都计入。作者尝试删除 pre-MLP 会发散或严重掉点，并在最终 Qwen 设置中使用非顺序统计校准。
- 数学设置先用 OpenMathInstruct-2 的 100 万条指令、最大长度 2048 训练一轮，再实施 DaMN，前 25% 数据用于平滑移除、剩余 75% 继续训练。MATH500 是 29.6 → 28.8，但 **GSM8K 为 72.3 → 67.6，下降 4.7 个百分点**，不能只引用较温和的一项。
- 基础模型设置在 FineWeb-Edu 上后训练 10 亿 tokens，移除过程最优设置为 1000 iterations、2.62 亿 tokens、之后不继续训练。MMLU 为 58.1 → 54.2，MMLU-Pro 27.3 → 23.6，WinoGrande 66.0 → 62.9；少数指标持平或略升。相同最终训练 loss 不保证下游能力保留。

这里没有展示 LLM 的 prefill / decode 端到端时延、KV cache 场景或长上下文稳定性。图像模型全部移除的最高加速比例，也不能搬到只删一部分层的 Qwen 上。

## 8. 原始效率图：延迟、吞吐、功率与能量要分开

<figure class="paper-figure result-figure" id="efficiency-results">
<a href="/assets/papers/damn-normalization-removal/fig01-efficiency.png" target="_blank" rel="noopener"><img src="/assets/papers/damn-normalization-removal/fig01-efficiency.png" alt="原文图1：A100 FP16上六个模型的推理时间与能耗改善，比较DaMN与DyT" width="735" height="624" loading="lazy"></a>
<figcaption>原文图 1，正式版第 2883 页：A100 / FP16，红为 DaMN，蓝为 DyT，均相对原始归一化模型。完整保留两幅图、数值与原注；图 b 标题写 Power Consumption，图注和正文称 energy consumption，本报告单独讨论单位与测量口径。来源：<a href="https://openaccess.thecvf.com/content/CVPR2026F/papers/Ryabykin_DaMN_Deleting_and_Migrating_Normalization_Layers_from_Transformers_CVPRF_2026_paper.pdf#page=1">官方 PDF，第 1 页</a>。原图版权归原权利人，本文为研究评论引用。</figcaption>
</figure>

| A100 / FP16，图 1 | DaMN 时间减少 | DyT 时间减少 | DaMN 能耗改善（按正文称谓） |
|---|---:|---:|---:|
| ConvNeXt | 13.4% | 10.9% | 13.6% |
| Swin-B | 17.0% | 15.1% | 16.7% |
| ViT-B | 8.6% | 2.5% | 7.5% |
| Restormer | 17.9% | 13.7% | 16.9% |
| MambaIR | 3.7% | 2.5% | 3.8% |
| SRFormer | 3.9% | 1.5% | 3.8% |

这些改善是同一图中清楚标出的数字，不能代表所有 GPU、dtype、batch 和输入大小。特别是质量最接近的恢复任务中，也有模型仅得到约 4% 时间收益；分类的高收益应连同其准确率损失一起判断。

**附录 A 的测量条件与反例：**用 PYNVML，50–100 次 inference iterations、5 次重复、重复间冷却 10 秒；没有使用 `torch.compile`。分类 batch 512、输入 224；MambaIR / SRFormer batch 8、输入 128；表 S1 的 Restormer batch 8、输入 384。RTX 2080 Ti 的个别 FP32 项因显存采用较小 batch，不能作为跨 GPU 同工作量绝对比较。附录文字一度写成不存在于表中的“RTX 2090 Ti”，本报告按图表实际 RTX 2080 Ti 记录。

补充表 S1 并非全是收益：SRFormer / A100 / BF16 的 identity 路线时间“改善”是 **−8.2%**，即实际变慢；RTX 4090 / FP16 为 −0.5%；H100 / FP32 为 −2.8%。反过来，Restormer / H100 / FP16 时间下降 22.4%，超过摘要强调的 A100 例子。因此“最高 18%”是主文突出设置的概括，不是全部设备测试的数学上限。表 S1 的 MambaIR、SRFormer 个别 A100 FP16 数字也与主图略有差异，本文上表明确采用主图，附录数字另列，不混成同一次测量。

若 $r_t=(t_0-t_1)/t_0$ 是时延减少率，则固定工作量下吞吐倍数为本报告换算：

$$
S=\frac{t_0}{t_1}=\frac1{1-r_t}.
$$

Restormer 的 $r_t=17.9\%$ 对应约 $1.218\times$，即吞吐增加约 21.8%，并非同一个“18%”口径。DyT 时间减少 13.7%、DaMN 减少 17.9%，两者相差 4.2 个百分点；相对 DyT 的时延下降应算 $(0.863-0.821)/0.863\approx4.87\%$，而不能把 4.2 直接叫相对降幅。

能量关系是：

$$
E=\int_0^{t_{\rm run}}P(t)\,dt.
$$

功率单位 W，能量单位 J；如果只有平均功率，必须再乘对应时间才能得到能量。正文和图标题的措辞不一致，应结合补充材料的计量过程，不应把 16.9% 直接说成 GPU 瞬时功率下降 16.9%。没有 CPU / 内存 / 整机功耗测量时，也不能将 GPU 指标等同于整台服务器节能。

附录仅说明使用 PYNVML 并继续交替使用 Power / energy 字样，未充分给出采样频率、积分或计量 API、空闲功耗扣除、异步计时同步细节和误差条。故报告保留“按作者正文称谓的能耗改善”，不把它升级为已独立验证的单位请求能量降低。这些缺口也限制了跨设备复现。

部署是否划算还与一次性改造成本有关。本报告提出简单回本估计：

$$
n_{\rm break-even}=\frac{E_{\rm calibration}+E_{\rm finetune}}{E_{\rm base\,inference}-E_{\rm new\,inference}}.
$$

它仅是决策模型，论文没有给出可直接代入的全部成本数据。调用很少的模型可能难回本，持续高负载服务则更可能受益。

## 9. 与 Derf 的关系：不是同一条性能排行榜

| 维度 | Derf | DaMN |
|---|---|---|
| 主要研究问题 | 选择更好的逐元素归一化替代函数 | 改造现有预训练模型，减少部署时归一化开销 |
| 核心操作 | $\gamma\operatorname{erf}(\alpha x+s)+\beta$ | 校准静态仿射、平滑微调、融合权重 |
| 通常起点 | 从头训练相应模型 | 已训练的归一化模型 |
| 部署图 | 仍有非线性的 erf 算子 | 满足融合条件后不保留独立替身算子 |
| 主要证据 | 多任务精度 / 泛化取舍，单算子耗时接近 LN | 一些视觉模型的实际推理时间 / 能耗收益与质量代价 |
| LLM 边界 | GPT-2 与 LN 持平 | NanoGPT / Qwen 部分删除，全部移除未证实 |

从结构上说，erf 不能一般性融合进线性层，而静态仿射可以；从功能上说，DaMN 放弃当前样本自适应统计，依赖微调把所需补偿迁移到其他权重。两种路线都可能在输入尺度漂移、长尾样本或部署精度变化时暴露弱点。报告中的对照是方法与证据范围对照，不是宣称做过同配置 Derf 对 DaMN 的直接性能实验。[上一篇 Derf 调研](/posts/2026/10/28/stronger-normalization-free-transformers.html)

## 10. 复现路线与值得补做的实验

本报告没有训练 DaMN 模型；完成的是原文精读、结果核对和可复现性审查。复现应先做“小模型能否稳定改造与精确融合”，再扩大到论文配置。

公开的 [DaMN 关联仓库](https://github.com/addicted-by/DaMN-Deleting-and-Migrating-Normalizations-from-Transformer-Models)在核查提交 `c19a9246c2348c352b1ca6b4904a99dd2dd55561` 下只有论文 PDF、README、MIT LICENSE 和演示动画网页 / JavaScript，未发现模型训练、校准、融合或测量实现。仓库中的 25 页 PDF 与正式版 / 官方补充材料的分页、表号不同，本报告引用正式来源的表 S1–S10，避免混用旧编号。正文脚注声称 implementation available at GitHub，但当前可见仓库不能视为完整可运行复现包；没有实际代码可以证明所有融合细节均已处理。

1. **固定起点。**保存预训练 checkpoint、归一化节点清单、基线精度和部署时延，记录哪些节点保留。真实计算图中的复用和分支比模块名称更重要。
2. **校准与融合单元核验。**用代表性数据按通道累计统计；比较一次性与顺序校准的逐层输入分布。先在简单线性消费者上验证融合误差，再处理卷积、共享投影和条件分支。
3. **逐步恢复任务质量。**对直接删除、只平滑、只仿射、仿射+平滑、完整顺序方案做一致预算消融，记录 NaN 率与失败步数。不能只展示成功种子或最好中途 checkpoint。
4. **把额外训练的收益扣出来。**给原归一化模型相同追加训练预算作控制；特别是 NanoGPT，只有这样才能区分“多训一段变好”与“删除归一化变好”。
5. **真正部署后计时。**检查导出图是否仍有残留 reduction、仿射节点或额外偏置开销；相同硬件、输入、batch、精度、编译与融合条件下，分别测延迟分位数、吞吐和 GPU 能量。

| 问题 | 建议实验 | 主要记录指标 |
|---|---|---|
| 校准统计代表性如何？ | 1% / 5% / 20% / 40% 数据；类别不均衡、域外图像或文本校准 | 校准成本、恢复精度、各层矩偏差与失败率 |
| 哪些层最不该删？ | attention 前、FFN 前、下采样处、最终输出层分组删除 | 质量—时延 Pareto 曲线；区分保留比例与实际节点数 |
| 调度和校准各自贡献？ | 固定追加预算，改变 $T$ 与校准策略；多种独立种子 | loss spike、梯度范数、NaN 频率、最终均值与方差 |
| 失去输入自适应统计有何代价？ | 输入加偏置、乘尺度、图像动态范围变化、长上下文 | OOD 质量、激活饱和 / 爆炸、最差样本而非仅均值 |
| 部分 LLM 删除是否值得？ | 匹配追加 SFT 预算、固定 NL 位置，分别测 prefill / decode | MATH500 及通用任务、tokens/s、长上下文稳定性 |
| 与量化是否兼容？ | 融合前后分别做相同量化；检查权重幅度及偏置 | 精度、异常通道、量化误差、端到端能耗 |

## 11. 最终评价

DaMN 的创新性主要是**面向预训练模型的组合式迁移流程与组件必要性实验**：矩匹配让替换起点可用，顺序校准缓解误差累积，平滑微调让网络适应，最后用代数融合兑现部署收益。这条链比“删掉 LayerNorm 再训一下”具体得多。

同时，它也清楚暴露出归一化不是可随意删除的冗余：分类会有准确率代价，LLM 仍需保留部分层，校准质量与调度长度都会决定成功或失败。对已有模型的高频部署，这是值得尝试的工程方向；对要求严格无损、校准数据不可得、输入分布变化很大的场景，则需要更强的验证与部分保留策略。

## 参考与原图来源

1. Ryabykin 等，**DaMN: Deleting and Migrating Normalization Layers from Transformers**，CVPR 2026 **Findings**，2883–2892。本文没有将 Findings 错记为主会论文。[官方条目](https://openaccess.thecvf.com/content/CVPR2026F/html/Ryabykin_DaMN_Deleting_and_Migrating_Normalization_Layers_from_Transformers_CVPRF_2026_paper.html)
2. [正文 PDF](https://openaccess.thecvf.com/content/CVPR2026F/papers/Ryabykin_DaMN_Deleting_and_Migrating_Normalization_Layers_from_Transformers_CVPRF_2026_paper.pdf)与[补充 PDF](https://openaccess.thecvf.com/content/CVPR2026F/supplemental/Ryabykin_DaMN_Deleting_and_CVPRF_2026_supplemental.pdf)。公式（1）–（6）、图 1–5、表 2–6 均按正式版定位；本报告自行推导与数字相减、换算另有标注。
3. 本文展示原文图 1–5、表 4、表 6 与补充表 S8 的原始截图，保留关键图例、坐标、原注和不利结果。版权由作者或相应权利人保留；CVF 开放访问不自动等于 CC BY，不对原图作开放再授权。精确裁剪页码与文件哈希归档在对应资源目录。
