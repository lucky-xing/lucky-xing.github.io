// 文章数据
const posts = [
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
