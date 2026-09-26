(() => {
  const key = 'lighting-future-resume-draft-v1';
  const frame = document.getElementById('resume-frame');
  const role = document.getElementById('target-role');
  const job = document.getElementById('job-description');
  const notes = document.getElementById('extra-notes');
  const status = document.getElementById('editor-status');
  const groups = [
    ['个人简介', '.resume-cover-copy > p'],
    ['能力标签', '.resume-pill-row span'],
    ['重点指标', '.resume-cover-metrics strong'],
    ['指标说明', '.resume-cover-metrics div > span'],
    ['工作岗位', '.resume-v2-role h3'],
    ['工作方向', '.resume-v2-role p'],
    ['工作时间', '.resume-v2-role time'],
    ['工作职责', '.resume-v2-bullets li'],
    ['项目名称', '.resume-v2-project > h3'],
    ['项目时间', '.resume-v2-project-top time'],
    ['项目角色', '.resume-v2-position'],
    ['项目背景', '.resume-v2-context p'],
    ['贡献标题', '.resume-v2-contributions h4'],
    ['贡献内容', '.resume-v2-contributions p'],
    ['项目成果', '.resume-v2-result p'],
    ['技能方向', '.resume-v2-side-card dl dt'],
    ['技能描述', '.resume-v2-side-card dl dd'],
    ['学历', '.resume-v2-degree strong'],
    ['专业', '.resume-v2-degree p'],
    ['教育时间', '.resume-v2-degree time']
  ];
  let fields = [];
  let saveTimer;

  const announce = (message) => { status.textContent = message; };
  const readSaved = () => {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); }
    catch { return null; }
  };
  const makeDraft = () => ({
    version: 1,
    source: '简历与作品集中的匿名技术简历',
    savedAt: new Date().toISOString(),
    targetRole: role.value.trim(),
    jobDescription: job.value.trim(),
    extraNotes: notes.value.trim(),
    fields: fields.map(({ id, label, node }) => ({ id, label, text: node.innerText.trim() }))
  });
  const save = (quiet = false) => {
    if (!fields.length) return;
    try {
      localStorage.setItem(key, JSON.stringify(makeDraft()));
      if (!quiet) announce('草稿已保存到当前浏览器。公开网站尚未更新。');
    } catch {
      announce('浏览器未允许本机保存。请下载草稿，避免丢失修改。');
    }
  };
  const scheduleSave = () => {
    announce('正在保存草稿…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => save(false), 500);
  };
  const applyDraft = (draft) => {
    if (!draft || draft.version !== 1 || !Array.isArray(draft.fields)) return false;
    role.value = typeof draft.targetRole === 'string' ? draft.targetRole : '';
    job.value = typeof draft.jobDescription === 'string' ? draft.jobDescription : '';
    notes.value = typeof draft.extraNotes === 'string' ? draft.extraNotes : '';
    const values = new Map(draft.fields.filter(x => x && typeof x.id === 'string' && typeof x.text === 'string').map(x => [x.id, x.text]));
    fields.forEach(({ id, node }) => { if (values.has(id)) node.textContent = values.get(id); });
    return true;
  };
  const initialize = () => {
    let doc;
    try { doc = frame.contentDocument; }
    catch { announce('无法访问简历预览。请重新打开此页面。'); return; }
    if (!doc?.querySelector('.resume-v2')) { announce('简历预览未能加载。请刷新页面重试。'); return; }
    if (doc.documentElement.dataset.resumeEditorInitialized) return;
    doc.documentElement.dataset.resumeEditorInitialized = 'true';
    fields = [];
    groups.forEach(([label, selector], groupIndex) => {
      doc.querySelectorAll(selector).forEach((node, itemIndex) => {
        const id = `${groupIndex}-${itemIndex}`;
        node.contentEditable = 'plaintext-only';
        node.spellcheck = false;
        node.dataset.editorField = id;
        node.setAttribute('aria-label', `${label} ${itemIndex + 1}，可编辑`);
        node.addEventListener('input', scheduleSave);
        fields.push({ id, label: `${label} ${itemIndex + 1}`, node });
      });
    });
    const style = doc.createElement('style');
    style.textContent = '[data-editor-field]{border-radius:5px;outline:1px dashed #a99fff66;outline-offset:5px;cursor:text}[data-editor-field]:hover,[data-editor-field]:focus{outline:2px solid #c7beff;background:#a99fff12}';
    doc.head.appendChild(style);
    const restored = applyDraft(readSaved());
    announce(restored ? '已载入当前浏览器保存的草稿。点击虚线框内文字直接编辑。' : '已载入公开版简历。点击虚线框内文字直接编辑。');
  };

  frame.addEventListener('load', initialize);
  if (frame.contentDocument?.readyState === 'complete') initialize();
  [role, job, notes].forEach(input => input.addEventListener('input', scheduleSave));
  document.getElementById('save-draft').addEventListener('click', () => save(false));
  document.getElementById('copy-draft').addEventListener('click', async () => {
    if (!fields.length) { announce('简历尚未加载完成。'); return; }
    save(true);
    const draft = makeDraft();
    const message = [
      '请依据以下简历草稿和目标岗位，做小幅、真实的针对性优化，然后更新我网站“学习 → 职业进阶 → 简历与作品集”中的网页版简历。',
      '请保留原始事实和可核实的指标，不添加未经我提供的成果。公开页面继续隐藏姓名、照片、联系方式、学校、实验室、雇主及部门名称。先总结改动，再发布。',
      '',
      `目标岗位：${draft.targetRole || '未填写'}`,
      `岗位要求：\n${draft.jobDescription || '未填写'}`,
      `补充内容：\n${draft.extraNotes || '无'}`,
      '',
      '简历字段：',
      ...draft.fields.map(item => `${item.label}：${item.text}`)
    ].join('\n');
    try { await navigator.clipboard.writeText(message); announce('已复制。请粘贴到我们当前的 Codex 对话，我会据此优化并更新网站。'); }
    catch { announce('复制失败。请使用“下载草稿”并将文件发给我。'); }
  });
  document.getElementById('download-draft').addEventListener('click', () => {
    if (!fields.length) { announce('简历尚未加载完成。'); return; }
    save(true);
    const blob = new Blob([JSON.stringify(makeDraft(), null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'resume-draft.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce('草稿已下载。文件只包含本页草稿，不包含原始 PDF。');
  });
  const importInput = document.getElementById('import-draft');
  document.getElementById('import-button').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      const draft = JSON.parse(await file.text());
      if (!applyDraft(draft)) throw new Error('格式不匹配');
      save(false);
      announce('草稿已导入并保存到当前浏览器。');
    } catch { announce('导入失败：请选择从此页面下载的 JSON 草稿。'); }
    importInput.value = '';
  });
  document.getElementById('reset-draft').addEventListener('click', () => {
    if (!confirm('要清除当前浏览器中的简历草稿并恢复公开版吗？建议先下载备份。')) return;
    localStorage.removeItem(key);
    frame.src = 'resume.html';
    role.value = '';
    job.value = '';
    notes.value = '';
    announce('已清除本机草稿，正在恢复公开版。');
  });
})();
