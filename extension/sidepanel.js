(() => {
  const { api, key, normalize, supported, cleanLabel } = PF;

  // DOM elements
  const container = document.querySelector('#groups');
  const statusDot = document.querySelector('#status-dot');
  const search = document.querySelector('#search');
  const searchClear = document.querySelector('#search-clear');
  const settingsToggle = document.querySelector('#settings-toggle');
  const settingsPanel = document.querySelector('#settings-panel');
  const soundToggle = document.querySelector('#sound-enabled');
  const soundIconDisplay = document.querySelector('#sound-icon-display');
  const resetRulesBtn = document.querySelector('#reset-rules-btn');
  const resetModal = document.querySelector('#reset-modal');
  const modalCancelBtn = document.querySelector('#modal-cancel-btn');
  const modalConfirmBtn = document.querySelector('#modal-confirm-btn');
  const resetConfirm = document.querySelector('#reset-confirm');
  const resetRevertBtn = document.querySelector('#reset-revert');
  const resetKeepBtn = document.querySelector('#reset-keep');
  const scanButton = document.querySelector('#scan');
  const exportButton = document.querySelector('#export');
  const importButton = document.querySelector('#import');
  const fileInput = document.querySelector('#backup-file');
  const scanLoader = document.querySelector('#scan-loader');
  const scanLoaderVideo = document.querySelector('#scan-loader-video');
  const appContainer = document.querySelector('#app-container');
  const accentDots = document.querySelectorAll('.accent-dot');

  // Application state
  let state = {};
  let host = null;
  let tabId = null;
  let openGroupId = null;
  let lastRulesSnapshot = null;

  function updateStatus(text) {
    if (statusDot) statusDot.title = text;
  }

  // Rainbow Accent management
  function applyAccent(color) {
    if (!color || typeof color !== 'string') color = '#30d158';
    if (appContainer) {
      appContainer.style.setProperty('--accent', color);
      appContainer.style.setProperty('--accent-hover', color);
      appContainer.style.setProperty('--accent-bg', color + '26');
    }
    accentDots.forEach(dot => {
      if (dot.dataset.color.toLowerCase() === color.toLowerCase()) dot.classList.add('active');
      else dot.classList.remove('active');
    });
  }

  accentDots.forEach(dot => {
    dot.addEventListener('click', async () => {
      const selectedColor = dot.dataset.color;
      applyAccent(selectedColor);
      try {
        await api.storage.local.set({ 'pf-accent-color': selectedColor });
        state['pf-accent-color'] = selectedColor;
      } catch {}
    });
  });

  // Settings panel toggle
  function setSettings(open) {
    settingsPanel.hidden = !open;
    settingsToggle.setAttribute('aria-expanded', String(open));
    if (open) settingsToggle.classList.add('active');
    else settingsToggle.classList.remove('active');
  }

  settingsToggle.addEventListener('click', () => setSettings(settingsPanel.hidden));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!resetModal.hidden) {
        resetModal.hidden = true;
        event.preventDefault();
        return;
      }
      if (!settingsPanel.hidden) {
        setSettings(false);
        settingsToggle.focus();
        event.preventDefault();
      }
    }
  });

  // Sound management
  function updateSoundUI(enabled) {
    soundToggle.checked = enabled;
    if (soundIconDisplay) {
      soundIconDisplay.textContent = enabled ? '🐱' : '🔇';
      soundIconDisplay.title = enabled ? 'Звук мяуканья включен (нажмите для проверки)' : 'Звук выключен (нажмите, чтобы включить)';
    }
  }

  async function setSoundEnabled(enabled) {
    if (enabled) {
      PFMeow.play(true);
    } else {
      PFMeow.stop();
    }
    updateSoundUI(enabled);
    try {
      await api.storage.local.set({ 'pf-sound-enabled': enabled });
      state['pf-sound-enabled'] = enabled;
      updateStatus(enabled ? 'Звук включён.' : 'Звук выключен.');
    } catch {
      updateSoundUI(!enabled);
    }
  }

  soundToggle.addEventListener('change', () => setSoundEnabled(soundToggle.checked));

  if (soundIconDisplay) {
    soundIconDisplay.addEventListener('click', () => {
      const isCurrentlyEnabled = state['pf-sound-enabled'] !== false;
      if (!isCurrentlyEnabled) {
        setSoundEnabled(true);
      } else {
        PFMeow.play(true);
      }
    });
  }

  // Brand logo purr click handler
  const brandLogoBtn = document.querySelector('#brand-logo-btn');
  let purrTimeout = null;

  if (brandLogoBtn) {
    brandLogoBtn.addEventListener('click', () => {
      if (purrTimeout) clearTimeout(purrTimeout);
      const audio = PFMeow.purr();
      brandLogoBtn.classList.add('purring');
      if (audio) {
        audio.onended = () => brandLogoBtn.classList.remove('purring');
      }
      purrTimeout = setTimeout(() => {
        brandLogoBtn.classList.remove('purring');
      }, 3800);
    });

    brandLogoBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        brandLogoBtn.click();
      }
    });
  }

  // Scan loader animation
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

  // Export / Import
  exportButton.addEventListener('click', async () => {
    exportButton.disabled = true;
    try {
      const data = PFBackup.create(await api.storage.local.get(null));
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'pipedrive-fields-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      updateStatus('Экспорт настроек сохранён.');
    } catch (error) {
      updateStatus('Ошибка экспорта: ' + error.message);
    } finally {
      exportButton.disabled = false;
    }
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
      state = await api.storage.local.get(null);
      render();
      updateStatus('Импортировано записей: ' + Object.keys(entries).length);
    } catch (error) {
      updateStatus('Ошибка импорта: ' + error.message);
    } finally {
      importButton.disabled = false;
      fileInput.value = '';
    }
  });

  // Scan page action
  scanButton.addEventListener('click', async () => {
    if (!tabId) return;
    scanButton.disabled = true;
    setScanning(true);
    updateStatus('Сканирование страницы Pipedrive…');
    try {
      const [result] = await Promise.all([
        Promise.race([
          api.tabs.sendMessage(tabId, { type: 'pf-scan' }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
        ]),
        new Promise(resolve => setTimeout(resolve, 650))
      ]);
      if (!result?.ok) throw new Error('scan failed');
      state = await api.storage.local.get(null);
      render();
      updateStatus(result.added ? 'Новых записей найдено: ' + result.added : 'Новых полей не найдено.');
    } catch {
      updateStatus('Не удалось сканировать. Обновите вкладку Pipedrive.');
    } finally {
      setScanning(false);
      scanButton.disabled = false;
    }
  });

  // Reset rules multi-step flow
  if (resetRulesBtn) {
    resetRulesBtn.addEventListener('click', () => {
      resetModal.hidden = false;
    });
  }

  if (modalCancelBtn) {
    modalCancelBtn.addEventListener('click', () => {
      resetModal.hidden = true;
    });
  }

  if (modalConfirmBtn) {
    modalConfirmBtn.addEventListener('click', async () => {
      modalConfirmBtn.disabled = true;
      try {
        // Save snapshot for potential rollback
        lastRulesSnapshot = Object.fromEntries(
          Object.entries(state).filter(([k]) => k.startsWith('hidden:'))
        );

        // Remove all hidden rules
        const keysToRemove = Object.keys(state).filter(k => k.startsWith('hidden:'));
        if (keysToRemove.length) {
          await api.storage.local.remove(keysToRemove);
          keysToRemove.forEach(k => delete state[k]);
        }
        await cleanupLegacyStorage();
        PFMeow.play(state['pf-sound-enabled'] !== false);
        render();

        // Close modal and settings panel
        resetModal.hidden = true;
        setSettings(false);

        // Show rollback question banner
        resetConfirm.hidden = false;
      } catch (err) {
        console.error('Reset rules error:', err);
      } finally {
        modalConfirmBtn.disabled = false;
      }
    });
  }

  if (resetRevertBtn) {
    resetRevertBtn.addEventListener('click', async () => {
      resetRevertBtn.disabled = true;
      try {
        if (lastRulesSnapshot && Object.keys(lastRulesSnapshot).length) {
          await api.storage.local.set(lastRulesSnapshot);
          Object.assign(state, lastRulesSnapshot);
          render();
        }
        resetConfirm.hidden = true;
        lastRulesSnapshot = null;
      } catch (err) {
        console.error('Revert rules error:', err);
      } finally {
        resetRevertBtn.disabled = false;
      }
    });
  }

  if (resetKeepBtn) {
    resetKeepBtn.addEventListener('click', () => {
      resetConfirm.hidden = true;
      lastRulesSnapshot = null;
    });
  }

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
    if (state['pf-theme']) toRemove.push('pf-theme');
    if (toRemove.length) {
      await api.storage.local.remove(toRemove);
      toRemove.forEach(k => delete state[k]);
    }
    if (Object.keys(toSet).length) {
      await api.storage.local.set(toSet);
      Object.assign(state, toSet);
    }
  }

  // iOS-style toggle switch creator
  function createSwitch(id, label) {
    const labelWrap = document.createElement('label');
    labelWrap.className = 'ios-switch';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = state['hidden:' + id] !== true; // Default true (visible)
    input.setAttribute('role', 'switch');
    input.setAttribute('aria-label', 'Показывать: ' + label);

    const slider = document.createElement('span');
    slider.className = 'ios-slider';

    input.addEventListener('change', async () => {
      PFMeow.play(state['pf-sound-enabled'] !== false);
      const isHidden = !input.checked;
      try {
        await api.storage.local.set({ ['hidden:' + id]: isHidden });
        state['hidden:' + id] = isHidden;
      } catch {
        input.checked = isHidden;
      }
    });

    labelWrap.append(input, slider);
    return labelWrap;
  }

  // Search input handler
  search.addEventListener('input', () => {
    searchClear.style.display = search.value ? 'block' : 'none';
    render();
  });

  searchClear.addEventListener('click', () => {
    search.value = '';
    searchClear.style.display = 'none';
    search.focus();
    render();
  });

  // Render main groups and fields
  function render() {
    updateSoundUI(state['pf-sound-enabled'] !== false);
    container.replaceChildren();

    const query = normalize(search.value);
    const groups = new Map();

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
    const sortedGroups = [...groups].sort((a, b) => a[1].label.localeCompare(b[1].label));

    for (const [gid, group] of sortedGroups) {
      const groupMatch = normalize(group.label).includes(query);
      const fields = [...group.fields].filter(([, label]) => groupMatch || normalize(label).includes(query));

      if (!groupMatch && !fields.length) continue;
      count++;

      const groupCard = document.createElement('div');
      groupCard.className = 'group-card';

      const headerRow = document.createElement('div');
      headerRow.className = 'group-header';

      const isOpen = Boolean(query) || openGroupId === gid;

      const titleWrap = document.createElement('div');
      titleWrap.className = 'group-title-wrap';

      const chevron = document.createElement('span');
      chevron.className = 'group-chevron' + (isOpen ? ' open' : '');
      chevron.textContent = '▶';

      const title = document.createElement('span');
      title.className = 'group-title';
      title.textContent = group.label;

      const countBadge = document.createElement('span');
      countBadge.className = 'group-count-pill';
      countBadge.textContent = String(group.fields.size);

      titleWrap.append(chevron, title, countBadge);

      titleWrap.addEventListener('click', () => {
        openGroupId = openGroupId === gid ? null : gid;
        render();
      });

      const groupSwitch = createSwitch(gid, group.label);
      headerRow.append(titleWrap, groupSwitch);
      groupCard.append(headerRow);

      if (isOpen && fields.length > 0) {
        const fieldsList = document.createElement('div');
        fieldsList.className = 'group-fields';

        const isGroupHidden = state['hidden:' + gid] === true;

        const sortedFields = fields.sort((a, b) => a[1].localeCompare(b[1]));
        for (const [fid, label] of sortedFields) {
          const fieldRow = document.createElement('div');
          fieldRow.className = 'field-row';
          if (isGroupHidden) fieldRow.classList.add('muted');

          const nameSpan = document.createElement('span');
          nameSpan.className = 'field-name';
          nameSpan.textContent = label;

          const fieldSwitch = createSwitch(fid, label);
          fieldRow.append(nameSpan, fieldSwitch);
          fieldsList.append(fieldRow);
        }

        groupCard.append(fieldsList);
      }

      container.append(groupCard);
    }

    if (!count) {
      const emptyCard = document.createElement('div');
      emptyCard.className = 'empty-state';
      if (query) {
        emptyCard.innerHTML = '<div class="empty-state-icon">🔍</div><div>По запросу «' + search.value + '» ничего не найдено.</div>';
      } else if (!host) {
        emptyCard.innerHTML = '<div class="empty-state-icon">🌐</div><div>Откройте карточку сделки в <b>Pipedrive</b>, чтобы управлять видимостью её полей.</div>';
      } else {
        emptyCard.innerHTML = '<div class="empty-state-icon">📋</div><div>Пока не обнаружено полей.<br><br>Откройте карточку сделки в Pipedrive и нажмите кнопку <b>«Сканировать»</b> в настройках ⚙.</div>';
      }
      container.append(emptyCard);
    }
  }

  // Storage listener for reactive sync
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const [id, change] of Object.entries(changes)) {
      if (change.newValue === undefined) delete state[id];
      else state[id] = change.newValue;
    }
    render();
  });

  // Tab detection and activation
  async function checkActiveTab() {
    try {
      const tabs = await api.tabs.query({ active: true, currentWindow: true });
      const currentTab = tabs[0];
      if (currentTab?.url && supported(currentTab.url)) {
        host = new URL(currentTab.url).hostname;
        tabId = currentTab.id;
        statusDot.classList.add('connected');
        statusDot.title = 'Подключено к ' + host;
        scanButton.disabled = false;
      } else {
        host = null;
        tabId = null;
        statusDot.classList.remove('connected');
        statusDot.title = 'Ожидание страницы Pipedrive…';
        scanButton.disabled = true;
      }
    } catch {
      statusDot.classList.remove('connected');
      statusDot.title = 'Ошибка определения активной вкладки';
    }
    render();
  }

  // Listen for tab switch events
  if (api.tabs?.onActivated) {
    api.tabs.onActivated.addListener(() => checkActiveTab());
  }
  if (api.tabs?.onUpdated) {
    api.tabs.onUpdated.addListener((id, changeInfo) => {
      if (changeInfo.status === 'complete') checkActiveTab();
    });
  }
  if (api.runtime?.onMessage) {
    api.runtime.onMessage.addListener((message) => {
      if (message?.type === 'TAB_CHANGED' || message?.type === 'TAB_UPDATED') {
        checkActiveTab();
      }
    });
  }

  // Initial boot
  (async () => {
    // If running in Safari or as a popup window, set popup styling
    if (!api.sidePanel || window.innerWidth < 360) {
      document.body.classList.add('is-popup');
    }

    state = await api.storage.local.get(null);
    applyAccent(state['pf-accent-color'] || '#30d158');
    await cleanupLegacyStorage();
    await checkActiveTab();
  })().catch((err) => {
    console.error('Init error:', err);
  });
})();
