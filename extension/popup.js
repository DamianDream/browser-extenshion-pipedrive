(() => {
  const { api, key, normalize, supported, cleanLabel } = PF;
  const container = document.querySelector('#groups'), status = document.querySelector('#status');
  const search = document.querySelector('#search');
  const settingsToggle = document.querySelector('#settings-toggle');
  const settingsPanel = document.querySelector('#settings-panel');
  const resetRulesBtn = document.querySelector('#reset-rules');
  const resetConfirm = document.querySelector('#reset-confirm');
  const resetRevertBtn = document.querySelector('#reset-revert');
  const resetKeepBtn = document.querySelector('#reset-keep');
  function setSettings(open) {
    settingsPanel.hidden = !open;
    settingsToggle.setAttribute('aria-expanded', String(open));
  }
  settingsToggle.addEventListener('click', () => setSettings(settingsPanel.hidden));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !settingsPanel.hidden) {
      setSettings(false);
      settingsToggle.focus();
      event.preventDefault();
    }
  });
  const expanded = new Set();
  let state = {}, host = null, tabId;
  const scanButton = document.querySelector('#scan');
  const exportButton = document.querySelector('#export');
  const importButton = document.querySelector('#import');
  const fileInput = document.querySelector('#backup-file');
  const soundToggle = document.querySelector('#sound-enabled');
  const scanLoader = document.querySelector('#scan-loader');
  const scanLoaderVideo = document.querySelector('#scan-loader-video');
  function setScanning(active) {
    scanLoader.hidden = !active;
    scanLoader.setAttribute('aria-busy', String(active));
    if (active) {
      scanLoaderVideo.currentTime = 0;
      scanLoaderVideo.play().catch(() => {});
    } else {
      scanLoaderVideo.pause();
      scanLoaderVideo.currentTime = 0;
    }
  }
  soundToggle.addEventListener('change', async () => {
    const enabled = soundToggle.checked;
    if (!enabled) PFMeow.stop();
    soundToggle.disabled = true;
    try {
      await api.storage.local.set({'pf-sound-enabled': enabled});
      state['pf-sound-enabled'] = enabled;
    } catch { soundToggle.checked = !enabled; status.textContent = 'Не удалось сохранить настройку звука.'; }
    finally { soundToggle.disabled = false; }
  });
  exportButton.addEventListener('click', async () => {
    exportButton.disabled = true;
    try {
      const data = PFBackup.create(await api.storage.local.get(null));
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));
      const link = document.createElement('a'); link.href = url;
      link.download = 'pipedrive-fields-' + new Date().toISOString().slice(0,10) + '.json';
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      status.textContent = 'Экспорт настроек всех аккаунтов подготовлен.';
    } catch (error) { status.textContent = 'Ошибка экспорта: ' + error.message; }
    finally { exportButton.disabled = false; }
  });
  importButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    importButton.disabled = true;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Файл больше 5 МБ.');
      const entries = PFBackup.validate(JSON.parse(await file.text()));
      await api.storage.local.set(entries);
      state = await api.storage.local.get(null); render();
      status.textContent = 'Импортировано записей: ' + Object.keys(entries).length + '. Обновите Pipedrive.';
    } catch (error) { status.textContent = 'Ошибка импорта: ' + error.message; }
    finally { importButton.disabled = false; fileInput.value = ''; }
  });
  scanButton.addEventListener('click', async () => {
    scanButton.disabled = true;
    setScanning(true);
    status.textContent = 'Сканирование…';
    try {
      const [result] = await Promise.all([
        Promise.race([
          api.tabs.sendMessage(tabId, {type: 'pf-scan'}),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
        ]),
        new Promise(resolve => setTimeout(resolve, 650))
      ]);
      if (!result?.ok) throw new Error('scan failed');
      state = await api.storage.local.get(null);
      render();
      status.textContent = result.added ? 'Новых или обновлённых записей: ' + result.added : 'Новых групп и полей не найдено.';
    } catch { status.textContent = 'Не удалось сканировать. Обновите страницу Pipedrive и повторите.'; }
    finally { setScanning(false); scanButton.disabled = false; }
  });
  function showResetPrompt(show) {
    resetConfirm.hidden = !show;
    resetRulesBtn.style.display = show ? 'none' : '';
  }
  resetRulesBtn.addEventListener('click', () => {
    setSettings(false);
    showResetPrompt(true);
    status.textContent = 'Сбросить правила? "Хай буде так!" — сбросить, "Повернуть як було?" — отменить.';
  });
  resetRevertBtn.addEventListener('click', () => {
    showResetPrompt(false);
    status.textContent = host || 'Правила сохранены.';
  });
  resetKeepBtn.addEventListener('click', async () => {
    resetKeepBtn.disabled = true;
    resetRevertBtn.disabled = true;
    try {
      const keysToRemove = Object.keys(state).filter(k => k.startsWith('hidden:'));
      if (keysToRemove.length) {
        await api.storage.local.remove(keysToRemove);
        keysToRemove.forEach(k => delete state[k]);
      }
      await cleanupLegacyStorage();
      PFMeow.play(state['pf-sound-enabled'] !== false);
      render();
      showResetPrompt(false);
      status.textContent = 'Все правила сброшены. Обновите страницу Pipedrive.';
    } catch {
      status.textContent = 'Не удалось сбросить правила.';
    } finally {
      resetKeepBtn.disabled = false;
      resetRevertBtn.disabled = false;
    }
  });
  async function cleanupLegacyStorage() {
    const toRemove = [];
    const toSet = {};
    for (const [id, val] of Object.entries(state)) {
      if (id.startsWith('catalog:pf1:') && val && typeof val.group === 'string') {
        const cleanedG = cleanLabel(val.group);
        const cleanedF = typeof val.field === 'string' ? cleanLabel(val.field) : null;
        const properKey = 'catalog:' + key(val.host, cleanedG, cleanedF);
        if (id !== properKey || val.group !== cleanedG || (cleanedF && val.field !== cleanedF)) {
          toRemove.push(id);
          toSet[properKey] = { ...val, group: cleanedG, ...(cleanedF ? { field: cleanedF } : {}) };
        }
      }
    }
    if (toRemove.length) {
      await api.storage.local.remove(toRemove);
      toRemove.forEach(k => delete state[k]);
    }
    if (Object.keys(toSet).length) {
      await api.storage.local.set(toSet);
      Object.assign(state, toSet);
    }
  }
  function toggle(id, label) {
    const input = document.createElement('input');
    input.type = 'checkbox'; input.checked = state['hidden:' + id] !== true;
    input.setAttribute('role', 'switch'); input.setAttribute('aria-label', 'Показывать: ' + label);
    input.addEventListener('change', async () => {
      PFMeow.play(state['pf-sound-enabled'] !== false);
      const value = !input.checked;
      input.disabled = true;
      try { await api.storage.local.set({ ['hidden:' + id]: value }); }
      catch { input.checked = value; status.textContent = 'Не удалось сохранить настройку.'; }
      finally {
        input.disabled = false;
        if (input.checked === !value) status.textContent = 'Сохранено. Обновите страницу Pipedrive.';
      }
    });
    return input;
  }
  function render() {
    soundToggle.checked = state['pf-sound-enabled'] !== false;
    container.replaceChildren();
    const query = normalize(search.value), groups = new Map();
    Object.entries(state).forEach(([id, item]) => {
      if (!id.startsWith('catalog:pf1:') || !item || item.host !== host || typeof item.group !== 'string') return;
      const groupLabel = cleanLabel(item.group);
      if (!groupLabel) return;
      const fieldLabel = typeof item.field === 'string' ? cleanLabel(item.field) : null;
      const gid = key(host, groupLabel);
      if (!groups.has(gid)) groups.set(gid, { label: groupLabel, fields: new Map() });
      if (fieldLabel) groups.get(gid).fields.set(key(host, groupLabel, fieldLabel), fieldLabel);
    });
    let count = 0;
    for (const [gid, group] of [...groups].sort((a,b) => a[1].label.localeCompare(b[1].label))) {
      const groupMatch = normalize(group.label).includes(query);
      const fields = [...group.fields].filter(([,label]) => groupMatch || normalize(label).includes(query));
      if (!groupMatch && !fields.length) continue;
      count++;
      const section = document.createElement('section'), row = document.createElement('div'); row.className = 'row group';
      const button = document.createElement('button'); button.className = 'expand';
      const open = Boolean(query) || expanded.has(gid);
      button.textContent = (open ? '▾ ' : '▸ ') + group.label + ' · ' + group.fields.size;
      button.setAttribute('aria-expanded', String(open));
      button.onclick = () => { expanded.has(gid) ? expanded.delete(gid) : expanded.add(gid); render(); };
      row.append(button, toggle(gid, group.label)); section.append(row);
      if (open) for (const [fid, label] of fields.sort((a,b) => a[1].localeCompare(b[1]))) {
        const fieldRow = document.createElement('label'); fieldRow.className = 'row field';
        if (state['hidden:' + gid]) fieldRow.classList.add('muted');
        const name = document.createElement('span'); name.textContent = label;
        fieldRow.append(name, toggle(fid, label)); section.append(fieldRow);
      }
      container.append(section);
    }
    if (!count) { const p = document.createElement('p'); p.className = 'empty';
      p.textContent = query ? 'Ничего не найдено.' : 'Откройте карточку Pipedrive, раскройте группы и прокрутите поля. Найденные названия появятся здесь автоматически.'; container.append(p); }
  }
  search.addEventListener('input', render);
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const [id, change] of Object.entries(changes)) {
      if (change.newValue === undefined) delete state[id]; else state[id] = change.newValue;
    }
    render();
  });
  (async () => {
    const [tabs, data] = await Promise.all([api.tabs.query({active: true, currentWindow: true}), api.storage.local.get(null)]);
    state = data;
    await cleanupLegacyStorage();
    if (supported(tabs[0]?.url)) {
      host = new URL(tabs[0].url).hostname; status.textContent = host;
      tabId = tabs[0].id;
      scanButton.disabled = false;
    } else status.textContent = 'Откройте вкладку Pipedrive для настройки полей.';
    render();
  })().catch(() => { status.textContent = 'Не удалось загрузить настройки.'; });
})();
