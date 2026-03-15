// 文章数据
const posts = [
    {
        id: 5,
        title: 'AI驱动的通信接收机设计综述',
        date: '2026-03-14',
        category: '技术',
        tags: ['AI', '通信', '深度学习', '信道估计', '信号均衡', '接收机'],
        excerpt: '调研报告：深度学习在通信接收机设计中的应用，包括信道估计、信号均衡、一体化接收机等核心技术的最新研究进展...',
        content: `<h1>AI驱动的通信接收机设计综述</h1>
<p><strong>摘要：</strong>随着5G向6G演进，AI与通信的深度融合已成为未来无线通信系统的重要研究方向。本文综述了近年来深度学习在通信接收机设计中的研究进展，重点关注信道估计、信号均衡和一体化接收机等核心问题。</p>

<h2>一、引言</h2>
<p>传统的通信接收机通常采用模块化的设计思路，将信道估计、均衡、解调等功能分离设计。然而，随着通信场景日益复杂（如高速移动、高频段通信、密集网络等），传统方法面临诸多挑战：</p>
<ul>
<li>信道模型难以精确描述</li>
<li>复杂信道环境下的估计精度下降</li>
<li>计算复杂度与性能的权衡</li>
<li>难以自适应地处理动态变化的环境</li>
</ul>
<p>近年来，深度学习凭借其强大的特征提取和非线性映射能力，为通信接收机设计带来了新的思路。</p>

<h2>二、研究方向分类</h2>

<h3>2.1 信道估计 (Channel Estimation)</h3>
<p>信道估计是接收机设计的核心问题之一。传统方法包括最小二乘（LS）、最小均方误差（MMSE）等。AI方法主要从以下角度进行改进：</p>

<h4>基于CNN的信道估计</h4>
<p>卷积神经网络（CNN）能够有效提取信道的局部特征，适用于处理频率选择性和时间选择性衰落信道。</p>
<ul>
<li><strong>CSI Feedback:</strong> 利用深度学习压缩信道状态信息（CSI），如CsiNet等</li>
<li><strong>导频估计:</strong> 通过神经网络直接从接收信号中估计信道响应</li>
</ul>

<h4>基于RNN的信道估计</h4>
<p>循环神经网络（RNN）及其变体（LSTM、GRU）适合处理时变信道，能够捕捉信道的时序相关性。</p>

<h4>最新研究进展 (2025-2026)</h4>
<ul>
<li><strong>X-REFINE:</strong> 基于可解释AI的信道估计架构，通过XAI技术优化网络结构</li>
<li><strong>RSS辅助MIMO信道估计:</strong> 利用接收信号强度辅助估计，在有限导频下提升精度</li>
<li><strong>深度学习友好干扰:</strong> 在ISAC系统中利用深度学习实现安全通信</li>
</ul>

<h3>2.2 信号均衡 (Signal Equalization)</h3>
<p>信号均衡用于抵消信道引起的符号间干扰（ISI），传统方法包括线性均衡、判决反馈均衡（DFE）等。</p>

<h4>深度神经网络均衡器</h4>
<ul>
<li><strong>DNN均衡器:</strong> 深度神经网络能够学习复杂的非线性信道映射</li>
<li><strong>CNN均衡器:</strong> 适用于处理频率域信道的频率选择性问题</li>
<li><strong>Transformer均衡器:</strong> 利用自注意力机制处理长距离依赖</li>
</ul>

<h4>RIS辅助均衡</h4>
<p>智能反射面（RIS）技术的发展为均衡带来了新的可能性：</p>
<ul>
<li><strong>RIS信道均衡:</strong> 研究RIS辅助的脉冲响应均衡和信号增强</li>
<li><strong>深度强化学习优化:</strong> 利用DRL自适应调整RIS相位</li>
</ul>

<h3>2.3 一体化接收机 (Integrated Receiver)</h3>
<p>一体化接收机旨在通过单一神经网络替代传统接收机的多个模块，实现端到端的联合优化。</p>

<h4>端到端学习 (End-to-End Learning)</h4>
<p>将发射机、信道和接收机作为一个可微系统进行联合训练：</p>
<ul>
<li><strong>Autoencoder架构:</strong> 编码器-信道模型-解码器联合优化</li>
<li><strong>DeepJSCC:</strong> 深度联合源信道编码，实现更高效的通信</li>
</ul>

<h4>神经网络的接收机</h4>
<ul>
<li><strong>ONet:</strong> 经典的一体化接收机网络</li>
<li><strong>注意力机制接收机:</strong> 引入Transformer架构处理复杂通信场景</li>
</ul>

<h2>三、关键技术挑战</h2>
<ol>
<li><strong>可解释性:</strong> 深度学习模型的黑盒特性限制了其在关键通信系统中的应用</li>
<li><strong>泛化能力:</strong> 模型在训练分布外的性能衰减问题</li>
<li><strong>计算复杂度:</strong> 神经网络推理的计算开销</li>
<li><strong>数据需求:</strong> 有监督学习需要大量标注数据</li>
<li><strong>物理先验:</strong> 如何有效融合通信领域的物理知识</li>
</ol>

<h2>四、未来发展趋势</h2>
<ol>
<li><strong>物理先验神经网络:</strong> 融合电磁波传播规律的神经网络设计</li>
<li><strong>可解释AI:</strong> 提高模型的可解释性和可信度</li>
<li><strong>迁移学习:</strong> 减少对特定场景的训练数据需求</li>
<li><strong>RIS+AI:</strong> AI与智能反射面的深度结合</li>
<li><strong>通感一体化:</strong> 通信与感知联合优化</li>
<li><strong>6G展望:</strong> AI-native空口设计</li>
</ol>

<h2>五、总结</h2>
<p>AI技术在通信接收机设计领域展现出巨大潜力，从信道估计到信号均衡，再到一体化接收机，研究者们正在探索多种技术路径。尽管仍面临可解释性、泛化能力等挑战，但随着6G研究的深入，AI与通信的融合将更加紧密。</p>

<h2>参考文献</h2>
<ol>
<li>X-REFINE: XAI-based RElevance input-Filtering and archItecture fiNe-tuning for channel Estimation (2026)</li>
<li>RIS-Enabled Wireless Channel Equalization: Adaptive RIS Equalizer and Deep Reinforcement Learning (2026)</li>
<li>Indirect and Direct Multiuser Hybrid Beamforming for Far-Field and Near-Field Communications (2026)</li>
<li>Deep Learning-Driven Friendly Jamming for Secure Multicarrier ISAC (2026)</li>
<li>Machine Learning for the Internet of Underwater Things (2026)</li>
</ol>

<hr>
<p><em>作者：lucky-xing | 日期：2026-03-14</em></p>`
    },
    {
        id: 1,
        title: 'Hello World - 我的第一篇博客',
        date: '2026-03-14',
        category: '随笔',
        tags: ['Hello World', '开场白'],
        excerpt: '欢迎来到我的技术博客！这是一个全新的开始...',
        content: `<p>欢迎来到我的技术博客！这是一个全新的开始。</p>
<h2>关于这个博客</h2>
<p>我会在这里分享技术学习心得、项目经验和生活感悟。</p>
<blockquote>keep learning, keep growing</blockquote>
<p>希望你喜欢这里的内容！</p>`
    },
    {
        id: 2,
        title: 'JavaScript 异步编程指南',
        date: '2026-03-10',
        category: '技术',
        tags: ['JavaScript', 'Async', '前端'],
        excerpt: '深入理解 JavaScript 中的异步编程，包括 Promise、async/await 等...',
        content: `<h2>什么是异步编程</h2>
<p>异步编程是 JavaScript 中的核心概念，让我们能够处理非阻塞操作。</p>
<h3>Promise</h3>
<pre><code>const promise = new Promise((resolve, reject) => {
  // 异步操作
});</code></pre>
<h3>async/await</h3>
<pre><code>async function fetchData() {
  const result = await fetch(url);
  return result;
}</code></pre>`
    },
    {
        id: 3,
        title: 'VS Code 插件推荐',
        date: '2026-03-05',
        category: '工具',
        tags: ['VS Code', '效率', '工具'],
        excerpt: '分享一些提升开发效率的 VS Code 插件...',
        content: `<p>好的工具能让开发效率翻倍，以下是我常用的 VS Code 插件：</p>
<ul>
<li>GitLens - Git 增强</li>
<li>Prettier - 代码格式化</li>
<li>ESLint - 代码检查</li>
<li>Live Server - 本地服务器</li>
</ul>`
    },
    {
        id: 4,
        title: 'Docker 入门教程',
        date: '2026-02-28',
        category: '技术',
        tags: ['Docker', '容器', 'DevOps'],
        excerpt: 'Docker 是现代软件开发不可或缺的工具，本文介绍基础用法...',
        content: `<h2>为什么用 Docker</h2>
<p>Docker 可以让我们实现"一次构建，到处运行"。</p>
<h3>基本命令</h3>
<pre><code>docker build -t myapp .
docker run -p 8080:80 myapp
docker ps
docker stop container_id</code></pre>`
    }
];

// 分类统计
const categories = {};
posts.forEach(post => {
    categories[post.category] = (categories[post.category] || 0) + 1;
});

// 标签统计
const tags = {};
posts.forEach(post => {
    post.tags.forEach(tag => {
        tags[tag] = (tags[tag] || 0) + 1;
    });
});

// 工具函数
function formatDate(dateStr) {
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 渲染文章列表
function renderPosts(postsToRender, containerId = 'posts-list') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = postsToRender.map(post => `
        <article class="post-card">
            <h2><a href="post.html?id=${post.id}">${escapeHtml(post.title)}</a></h2>
            <div class="post-meta">
                <span>📅 ${post.date}</span>
                <span>📁 ${post.category}</span>
            </div>
            <p class="post-excerpt">${escapeHtml(post.excerpt)}</p>
            <div class="post-tags">
                ${post.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
            </div>
        </article>
    `).join('');
}

// 渲染侧边栏
function renderSidebar() {
    // 分类
    const categoryList = document.getElementById('category-list');
    if (categoryList) {
        categoryList.innerHTML = Object.entries(categories).map(([cat, count]) => `
            <li><a href="index.html?category=${encodeURIComponent(cat)}">${cat}<span>(${count})</span></a></li>
        `).join('');
    }
    
    // 标签云
    const tagCloud = document.getElementById('tag-cloud');
    if (tagCloud) {
        tagCloud.innerHTML = Object.entries(tags).map(([tag, count]) => `
            <span class="tag" onclick="searchByTag('${escapeHtml(tag)}')">${escapeHtml(tag)} (${count})</span>
        `).join('');
    }
}

// 主题切换
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    document.getElementById('theme-toggle').textContent = savedTheme === 'dark' ? '☀️' : '🌙';
    
    document.getElementById('theme-toggle').addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        document.getElementById('theme-toggle').textContent = newTheme === 'dark' ? '☀️' : '🌙';
    });
}

// 移动端菜单
function initMobileMenu() {
    const btn = document.getElementById('mobile-menu-btn');
    const menu = document.getElementById('mobile-menu');
    
    btn.addEventListener('click', () => {
        menu.classList.toggle('active');
    });
}

// 搜索功能
function initSearch() {
    const searchInput = document.getElementById('search-input');
    const searchContainer = document.getElementById('search-container');
    const searchResults = document.getElementById('search-results');
    const searchClose = document.getElementById('search-close');
    
    // 按 Ctrl+K 或 Cmd+K 打开搜索
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            searchContainer.classList.add('active');
            searchInput.focus();
        }
        if (e.key === 'Escape') {
            searchContainer.classList.remove('active');
        }
    });
    
    // 搜索关闭
    searchClose.addEventListener('click', () => {
        searchContainer.classList.remove('active');
    });
    
    searchContainer.addEventListener('click', (e) => {
        if (e.target === searchContainer) {
            searchContainer.classList.remove('active');
        }
    });
    
    // 搜索输入
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (query.length < 2) {
            searchResults.innerHTML = '';
            return;
        }
        
        const results = posts.filter(post => 
            post.title.toLowerCase().includes(query) ||
            post.excerpt.toLowerCase().includes(query) ||
            post.tags.some(tag => tag.toLowerCase().includes(query))
        );
        
        if (results.length === 0) {
            searchResults.innerHTML = '<div class="search-result-item"><p>没有找到相关文章</p></div>';
        } else {
            searchResults.innerHTML = results.map(post => `
                <div class="search-result-item" onclick="window.location.href='post.html?id=${post.id}'">
                    <h4>${escapeHtml(post.title)}</h4>
                    <p>${escapeHtml(post.excerpt)}</p>
                </div>
            `).join('');
        }
    });
}

// 按标签搜索
function searchByTag(tag) {
    window.location.href = `index.html?tag=${encodeURIComponent(tag)}`;
}

// URL 参数解析
function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        category: params.get('category'),
        tag: params.get('tag'),
        id: params.get('id')
    };
}

// 初始化首页
function initIndex() {
    const { category, tag } = getUrlParams();
    let filteredPosts = [...posts];
    
    if (category) {
        filteredPosts = filteredPosts.filter(p => p.category === category);
    }
    if (tag) {
        filteredPosts = filteredPosts.filter(p => p.tags.includes(tag));
    }
    
    // 按日期排序
    filteredPosts.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    renderPosts(filteredPosts);
    renderSidebar();
}

// 初始化文章详情页
function initPost() {
    const { id } = getUrlParams();
    const post = posts.find(p => p.id === parseInt(id));
    
    if (!post) {
        document.getElementById('content').innerHTML = '<p>文章不存在</p>';
        return;
    }
    
    document.getElementById('content').innerHTML = `
        <article class="post-detail">
            <h1>${escapeHtml(post.title)}</h1>
            <div class="post-meta">
                <span>📅 ${post.date}</span>
                <span>📁 ${post.category}</span>
            </div>
            <div class="post-content">
                ${post.content}
            </div>
            <div class="post-tags">
                ${post.tags.map(tag => `<span class="tag" onclick="searchByTag('${escapeHtml(tag)}')">${escapeHtml(tag)}</span>`).join('')}
            </div>
        </article>
        <div class="comments">
            <h3>💬 评论</h3>
            <p>评论功能开发中... 可在 <a href="https://github.com/lucky-xing/lucky-xing.github.io/issues" target="_blank">GitHub Issues</a> 留言</p>
        </div>
    `;
}

// 初始化归档页
function initArchives() {
    const archives = {};
    posts.forEach(post => {
        const year = post.date.split('-')[0];
        if (!archives[year]) archives[year] = [];
        archives[year].push(post);
    });
    
    const container = document.getElementById('archives-list');
    container.innerHTML = Object.entries(archives).sort((a, b) => b[0] - a[0]).map(([year, yearPosts]) => `
        <div class="archive-year">
            <h3>${year}年</h3>
            ${yearPosts.sort((a, b) => new Date(b.date) - new Date(a.date)).map(post => `
                <div class="archive-item">
                    <span class="date">${post.date}</span>
                    <a href="post.html?id=${post.id}">${escapeHtml(post.title)}</a>
                </div>
            `).join('')}
        </div>
    `).join('');
}

// 初始化标签页
function initTags() {
    const container = document.getElementById('tags-container');
    container.innerHTML = Object.entries(tags).map(([tag, count]) => `
        <span class="tag" onclick="searchByTag('${escapeHtml(tag)}')">${escapeHtml(tag)} (${count})</span>
    `).join('');
}

// 初始化关于页
function initAbout() {
    // 关于页内容已静态写在 HTML 中
}

// 页面初始化
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMobileMenu();
    initSearch();
    
    const page = document.body.dataset.page;
    switch (page) {
        case 'index':
            initIndex();
            break;
        case 'post':
            initPost();
            break;
        case 'archives':
            initArchives();
            break;
        case 'tags':
            initTags();
            break;
        case 'about':
            initAbout();
            break;
    }
});
