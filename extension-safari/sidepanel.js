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

  // Navigation & Views DOM elements
  const currentViewTitle = document.querySelector('#current-view-title');
  const brandMenuArrow = document.querySelector('#brand-menu-arrow');
  const navDropdown = document.querySelector('#nav-dropdown');
  const navMenuItems = document.querySelectorAll('.nav-menu-item');
  const viewFields = document.querySelector('#view-fields');
  const viewHistory = document.querySelector('#view-history');

  // History DOM elements
  const tabAll = document.querySelector('#tab-all');
  const tabFavorites = document.querySelector('#tab-favorites');
  const countAllBadge = document.querySelector('#count-all');
  const countFavBadge = document.querySelector('#count-fav');
  const historyTimeFilter = document.querySelector('#history-time-filter');
  const btnUnique = document.querySelector('#btn-unique');
  const btnClearHistory = document.querySelector('#btn-clear-history');
  const historySearch = document.querySelector('#history-search');
  const historySearchClear = document.querySelector('#history-search-clear');
  const historyList = document.querySelector('#history-list');
  const historyEmpty = document.querySelector('#history-empty');
  const historyEmptyTitle = document.querySelector('#history-empty-title');
  const historyEmptyDesc = document.querySelector('#history-empty-desc');

  // Application state
  let state = {};
  let host = null;
  let tabId = null;
  let openGroupId = null;
  let lastRulesSnapshot = null;
  let currentView = 'fields'; // 'fields' | 'history'
  let historyTab = 'all'; // 'all' | 'favorites'
  let historyPeriod = 'all'; // 'all' | 'today' | 'yesterday' | '3days' | '7days' | '1month' | '3months'
  let isUniqueFilter = false;

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
    if (open) {
      settingsToggle.classList.add('active');
      setNavDropdown(false);
    } else {
      settingsToggle.classList.remove('active');
    }
  }

  // Navigation Dropdown Menu toggle
  function setNavDropdown(open) {
    if (!navDropdown) return;
    navDropdown.hidden = !open;
    if (brandLogoBtn) {
      if (open) brandLogoBtn.classList.add('menu-open');
      else brandLogoBtn.classList.remove('menu-open');
    }
  }

  function toggleNavDropdown() {
    if (!navDropdown) return;
    setNavDropdown(navDropdown.hidden);
  }

  // Close dropdown on click outside
  document.addEventListener('click', (event) => {
    if (!navDropdown || navDropdown.hidden) return;
    if (!event.target.closest('#brand-logo-btn') && !event.target.closest('#nav-dropdown')) {
      setNavDropdown(false);
    }
  });

  settingsToggle.addEventListener('click', () => setSettings(settingsPanel.hidden));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!navDropdown.hidden) {
        setNavDropdown(false);
        event.preventDefault();
        return;
      }
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

  // Brand logo purr click handler & menu toggle
  const brandLogoBtn = document.querySelector('#brand-logo-btn');
  let purrTimeout = null;

  if (brandLogoBtn) {
    brandLogoBtn.addEventListener('click', (e) => {
      // Toggle navigation dropdown
      toggleNavDropdown();

      // If clicked outside the active target anchor, trigger it programmatically
      if (!e.target.closest('.css-cat-trigger')) {
        const nextHash = location.hash === '#css-cat-motion-a' ? '#css-cat-motion-b' : '#css-cat-motion-a';
        const trigger = brandLogoBtn.querySelector(
          nextHash === '#css-cat-motion-a' ? '.css-cat-trigger-a' : '.css-cat-trigger-b'
        );
        if (trigger) {
          trigger.click();
          return;
        }
      }
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
        toggleNavDropdown();
        const nextHash = location.hash === '#css-cat-motion-a' ? '#css-cat-motion-b' : '#css-cat-motion-a';
        const trigger = brandLogoBtn.querySelector(
          nextHash === '#css-cat-motion-a' ? '.css-cat-trigger-a' : '.css-cat-trigger-b'
        );
        if (trigger) {
          trigger.click();
        } else {
          brandLogoBtn.click();
        }
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
  function createSwitch(id, label, onToggle = null) {
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
        if (onToggle) {
          await onToggle(isHidden);
        }
      } catch {
        input.checked = isHidden;
      }
      render();
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

  // Check if a group is completely disabled (group off AND all its fields off)
  function isGroupFullyDisabled(gid, group) {
    if (state['hidden:' + gid] !== true) return false;
    if (group.fields && group.fields.size > 0) {
      for (const fid of group.fields.keys()) {
        if (state['hidden:' + fid] !== true) {
          return false;
        }
      }
    }
    return true;
  }

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
    const sortedGroups = [...groups].sort((a, b) => {
      const aDisabled = isGroupFullyDisabled(a[0], a[1]);
      const bDisabled = isGroupFullyDisabled(b[0], b[1]);
      if (aDisabled !== bDisabled) {
        return aDisabled ? 1 : -1; // Disabled groups go to the bottom
      }
      return a[1].label.localeCompare(b[1].label);
    });

    for (const [gid, group] of sortedGroups) {
      const groupMatch = normalize(group.label).includes(query);
      const fields = [...group.fields].filter(([, label]) => groupMatch || normalize(label).includes(query));

      if (!groupMatch && !fields.length) continue;
      count++;

      const isFullyDisabled = isGroupFullyDisabled(gid, group);
      const groupCard = document.createElement('div');
      groupCard.className = 'group-card' + (isFullyDisabled ? ' fully-disabled' : '');

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

      const groupSwitch = createSwitch(gid, group.label, async (isHidden) => {
        if (group.fields && group.fields.size > 0) {
          const updates = {};
          for (const fid of group.fields.keys()) {
            updates['hidden:' + fid] = isHidden;
            state['hidden:' + fid] = isHidden;
          }
          await api.storage.local.set(updates);
        }
      });
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

  // =========================================================================
  // Navigation & View Switching
  // =========================================================================
  async function switchView(viewName) {
    currentView = viewName;
    setNavDropdown(false);

    // Update dropdown items active state
    navMenuItems.forEach(item => {
      if (item.dataset.view === viewName) item.classList.add('active');
      else item.classList.remove('active');
    });

    // Update header title
    if (currentViewTitle) {
      currentViewTitle.textContent = viewName === 'history' ? 'History' : 'Fields';
    }

    // Refresh state from storage to guarantee fresh deal history
    try {
      const freshData = await api.storage.local.get(['pf_deal_history', 'pf_deal_favorites']);
      if (freshData.pf_deal_history !== undefined) state['pf_deal_history'] = freshData.pf_deal_history;
      if (freshData.pf_deal_favorites !== undefined) state['pf_deal_favorites'] = freshData.pf_deal_favorites;
    } catch {}

    // Toggle panels
    if (viewName === 'history') {
      if (viewFields) viewFields.hidden = true;
      if (viewHistory) viewHistory.hidden = false;
      renderHistory();
    } else {
      if (viewHistory) viewHistory.hidden = true;
      if (viewFields) viewFields.hidden = false;
      render();
    }

    // Persist active view
    api.storage.local.set({ 'pf_active_view': viewName }).catch(() => {});
  }

  navMenuItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetView = item.dataset.view;
      if (targetView) switchView(targetView);
    });
  });

  // =========================================================================
  // History View Controller
  // =========================================================================
  function formatDealDate(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '';

    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (isToday) return `Сегодня, ${timeStr}`;
    if (isYesterday) return `Вчера, ${timeStr}`;

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}, ${timeStr}`;
  }

  function getDealHistory() {
    return Array.isArray(state['pf_deal_history']) ? state['pf_deal_history'] : [];
  }

  function getDealFavorites() {
    return Array.isArray(state['pf_deal_favorites']) ? state['pf_deal_favorites'] : [];
  }

  async function toggleFavorite(dealId) {
    const favs = new Set(getDealFavorites().map(String));
    const idStr = String(dealId);
    if (favs.has(idStr)) {
      favs.delete(idStr);
    } else {
      favs.add(idStr);
    }
    const newFavList = [...favs];
    state['pf_deal_favorites'] = newFavList;
    try {
      await api.storage.local.set({ 'pf_deal_favorites': newFavList });
    } catch (err) {
      console.error('Failed to update favorites:', err);
    }
    renderHistory();
  }

  async function deleteHistoryRecord(deal) {
    try {
      const data = await api.storage.local.get(['pf_deal_history', 'pf_deal_favorites']);
      const list = Array.isArray(data.pf_deal_history)
        ? [...data.pf_deal_history]
        : (Array.isArray(state['pf_deal_history']) ? [...state['pf_deal_history']] : []);

      const getDealId = (item) => {
        if (!item) return '';
        if (item.id) return String(item.id);
        if (item.url) {
          const m = String(item.url).match(/\/deal\/(\d+)/i);
          if (m) return m[1];
        }
        return '';
      };

      const targetId = getDealId(deal);
      const targetTimestamp = deal.timestamp;
      const targetUrl = deal.url;

      // Find the exact single record index to delete
      let deleteIdx = -1;

      // 1. Match by exact timestamp AND deal id / url
      if (targetTimestamp) {
        deleteIdx = list.findIndex(d =>
          d && d.timestamp === targetTimestamp &&
          ((targetId && getDealId(d) === targetId) || (targetUrl && d.url === targetUrl))
        );
      }

      // 2. Fallback: match by timestamp only
      if (deleteIdx === -1 && targetTimestamp) {
        deleteIdx = list.findIndex(d => d && d.timestamp === targetTimestamp);
      }

      // 3. Fallback if no timestamp: match by deal id or url
      if (deleteIdx === -1) {
        deleteIdx = list.findIndex(d =>
          d && (
            (targetId && getDealId(d) === targetId) ||
            (targetUrl && d.url === targetUrl)
          )
        );
      }

      if (deleteIdx !== -1) {
        list.splice(deleteIdx, 1);
      }

      state['pf_deal_history'] = list;
      const toSave = { 'pf_deal_history': list };

      // If no more records for this deal remain in history, remove from favorites as well
      const favList = Array.isArray(data.pf_deal_favorites)
        ? data.pf_deal_favorites
        : (Array.isArray(state['pf_deal_favorites']) ? state['pf_deal_favorites'] : []);
      const remainingForDeal = targetId ? list.some(d => getDealId(d) === targetId) : false;
      if (!remainingForDeal && targetId) {
        const favs = new Set(favList.map(String));
        if (favs.has(targetId)) {
          favs.delete(targetId);
          state['pf_deal_favorites'] = [...favs];
          toSave['pf_deal_favorites'] = state['pf_deal_favorites'];
        }
      }

      await api.storage.local.set(toSave);
      renderHistory();
    } catch (err) {
      console.error('Failed to delete history record:', err);
    }
  }

  // History Tabs Switching
  if (tabAll) {
    tabAll.addEventListener('click', () => {
      historyTab = 'all';
      tabAll.classList.add('active');
      tabAll.setAttribute('aria-selected', 'true');
      if (tabFavorites) {
        tabFavorites.classList.remove('active');
        tabFavorites.setAttribute('aria-selected', 'false');
      }
      renderHistory();
    });
  }

  if (tabFavorites) {
    tabFavorites.addEventListener('click', () => {
      historyTab = 'favorites';
      tabFavorites.classList.add('active');
      tabFavorites.setAttribute('aria-selected', 'true');
      if (tabAll) {
        tabAll.classList.remove('active');
        tabAll.setAttribute('aria-selected', 'false');
      }
      renderHistory();
    });
  }

  // Unique Filter Toggle
  if (btnUnique) {
    btnUnique.addEventListener('click', () => {
      isUniqueFilter = !isUniqueFilter;
      btnUnique.classList.toggle('active', isUniqueFilter);
      renderHistory();
    });
  }

  // Time Period Filter
  if (historyTimeFilter) {
    historyTimeFilter.addEventListener('change', () => {
      historyPeriod = historyTimeFilter.value || 'all';
      renderHistory();
    });
  }

  // History Search
  if (historySearch) {
    historySearch.addEventListener('input', () => {
      if (historySearchClear) {
        historySearchClear.style.display = historySearch.value ? 'block' : 'none';
      }
      renderHistory();
    });
  }

  if (historySearchClear) {
    historySearchClear.addEventListener('click', () => {
      if (historySearch) {
        historySearch.value = '';
        historySearchClear.style.display = 'none';
        historySearch.focus();
        renderHistory();
      }
    });
  }

  // Clear History
  if (btnClearHistory) {
    btnClearHistory.addEventListener('click', async () => {
      const items = getDealHistory();
      if (!items.length) return;
      if (!confirm('Очистить всю историю посещённых сделок?')) return;
      try {
        await api.storage.local.remove(['pf_deal_history']);
        delete state['pf_deal_history'];
        renderHistory();
        updateStatus('История сделок очищена.');
      } catch (err) {
        console.error('Failed to clear history:', err);
      }
    });
  }

  // Render History List
  function renderHistory() {
    if (!historyList) return;
    historyList.replaceChildren();

    const rawHistory = getDealHistory();
    const favSet = new Set(getDealFavorites().map(String));

    // Update tab badges
    if (countAllBadge) countAllBadge.textContent = String(rawHistory.length);
    const favCount = rawHistory.filter(d => favSet.has(String(d.id))).length;
    if (countFavBadge) countFavBadge.textContent = String(favCount);

    let displayList = rawHistory;

    // 1. Filter by Tab ("all" vs "favorites")
    if (historyTab === 'favorites') {
      displayList = displayList.filter(d => favSet.has(String(d.id)));
    }

    // 2. Filter by Time Period (all, today, yesterday, 3days, 7days, 1month, 3months)
    if (historyPeriod && historyPeriod !== 'all') {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const startOfYesterday = startOfToday - 86400000;
      const endOfYesterday = startOfToday;

      displayList = displayList.filter(item => {
        const t = item.timestamp;
        if (!t) return false;
        switch (historyPeriod) {
          case 'today':
            return t >= startOfToday;
          case 'yesterday':
            return t >= startOfYesterday && t < endOfYesterday;
          case '3days':
            return t >= (startOfToday - 2 * 86400000);
          case '7days':
            return t >= (startOfToday - 6 * 86400000);
          case '1month': {
            const d = new Date(now);
            d.setMonth(d.getMonth() - 1);
            return t >= d.getTime();
          }
          case '3months': {
            const d = new Date(now);
            d.setMonth(d.getMonth() - 3);
            return t >= d.getTime();
          }
          default:
            return true;
        }
      });
    }

    // 3. Filter by Unique (deduplicate by dealId, keep latest visit)
    if (isUniqueFilter) {
      const seen = new Set();
      const uniqueItems = [];
      for (const item of displayList) {
        const idKey = String(item.id || item.url);
        if (!seen.has(idKey)) {
          seen.add(idKey);
          uniqueItems.push(item);
        }
      }
      displayList = uniqueItems;
    }

    // 4. Filter by Search Query (by title, #id, or raw id)
    const rawQuery = (historySearch ? historySearch.value : '').trim();
    const query = normalize(rawQuery);
    const cleanIdQuery = rawQuery.replace(/^#/, '').trim().toLowerCase();

    if (query) {
      displayList = displayList.filter(d => {
        const titleStr = normalize(d.title || '');
        const idStr = String(d.id || '').toLowerCase();
        let urlId = '';
        if (d.url) {
          const m = String(d.url).match(/\/deal\/(\d+)/i);
          if (m) urlId = m[1].toLowerCase();
        }
        return (
          titleStr.includes(query) ||
          idStr.includes(query) ||
          (cleanIdQuery && (idStr.includes(cleanIdQuery) || urlId.includes(cleanIdQuery))) ||
          (urlId && urlId.includes(query))
        );
      });
    }

    // Check if list is empty
    if (!displayList.length) {
      if (historyEmpty) {
        historyEmpty.hidden = false;
        if (query) {
          if (historyEmptyTitle) {
            historyEmptyTitle.hidden = false;
            historyEmptyTitle.textContent = 'Ничего не найдено';
          }
          historyEmptyDesc.textContent = `По запросу «${historySearch.value}» совпадений нет.`;
        } else if (historyTab === 'favorites') {
          if (historyEmptyTitle) {
            historyEmptyTitle.hidden = false;
            historyEmptyTitle.textContent = 'Нет избранных сделок';
          }
          historyEmptyDesc.textContent = 'Нажмите звёздочку ★ в истории, чтобы добавить сделку в избранное.';
        } else {
          if (historyEmptyTitle) {
            historyEmptyTitle.hidden = true;
            historyEmptyTitle.textContent = '';
          }
          historyEmptyDesc.textContent = 'Открывайте сделки на странице Pipedrive — они автоматически сохранятся здесь.';
        }
      }
      return;
    }

    if (historyEmpty) historyEmpty.hidden = true;

    // Render cards
    for (const deal of displayList) {
      const isFav = favSet.has(String(deal.id));
      const card = document.createElement('div');
      card.className = 'history-card';

      const body = document.createElement('div');
      body.className = 'history-card-body';

      const link = document.createElement('a');
      link.className = 'deal-link';
      link.href = deal.url || '#';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = deal.title || (deal.id ? `Сделка #${deal.id}` : 'Сделка Pipedrive');
      link.title = deal.title || '';

      // Deal ID from id or url
      let dealNum = deal.id;
      if (!dealNum && deal.url) {
        const m = String(deal.url).match(/\/deal\/(\d+)/i);
        if (m) dealNum = m[1];
      }

      const metaRow = document.createElement('div');
      metaRow.className = 'deal-meta';

      if (dealNum) {
        const idSpan = document.createElement('span');
        idSpan.className = 'deal-id';
        idSpan.textContent = `#${dealNum}`;
        metaRow.append(idSpan);
      }

      const dateSpan = document.createElement('span');
      dateSpan.className = 'deal-date';
      dateSpan.textContent = formatDealDate(deal.timestamp);

      metaRow.append(dateSpan);
      body.append(link, metaRow);

      const actions = document.createElement('div');
      actions.className = 'deal-actions';

      const favBtn = document.createElement('button');
      favBtn.type = 'button';
      favBtn.className = 'btn-favorite' + (isFav ? ' active' : '');
      favBtn.textContent = isFav ? '★' : '☆';
      favBtn.title = isFav ? 'Удалить из избранного' : 'Добавить в избранное';
      favBtn.setAttribute('aria-label', favBtn.title);

      favBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(deal.id);
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn-delete-deal';
      delBtn.textContent = '🗑';
      delBtn.title = 'Удалить эту запись из истории';
      delBtn.setAttribute('aria-label', 'Удалить эту запись из истории');

      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        await deleteHistoryRecord(deal);
      });

      actions.append(favBtn, delBtn);
      card.append(body, actions);
      historyList.append(card);
    }
  }

  // Storage listener for reactive sync
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    let shouldRenderFields = false;
    let shouldRenderHistory = false;

    for (const [id, change] of Object.entries(changes)) {
      if (change.newValue === undefined) delete state[id];
      else state[id] = change.newValue;

      if (id.startsWith('hidden:') || id.startsWith('catalog:')) {
        shouldRenderFields = true;
      }
      if (id === 'pf_deal_history' || id === 'pf_deal_favorites') {
        shouldRenderHistory = true;
      }
    }

    if (shouldRenderFields && currentView === 'fields') render();
    if (shouldRenderHistory && currentView === 'history') renderHistory();
    // Update count badges even when in fields view
    if (shouldRenderHistory && currentView === 'fields') {
      const rawHistory = getDealHistory();
      const favSet = new Set(getDealFavorites().map(String));
      if (countAllBadge) countAllBadge.textContent = String(rawHistory.length);
      if (countFavBadge) countFavBadge.textContent = String(rawHistory.filter(d => favSet.has(String(d.id))).length);
    }
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
    if (currentView === 'fields') {
      render();
    } else if (currentView === 'history') {
      try {
        const freshData = await api.storage.local.get(['pf_deal_history', 'pf_deal_favorites']);
        if (freshData.pf_deal_history !== undefined) state['pf_deal_history'] = freshData.pf_deal_history;
        if (freshData.pf_deal_favorites !== undefined) state['pf_deal_favorites'] = freshData.pf_deal_favorites;
      } catch {}
      renderHistory();
    }
  }

  // Listen for tab switch events
  if (api.tabs?.onActivated) {
    api.tabs.onActivated.addListener(() => checkActiveTab());
  }
  if (api.tabs?.onUpdated) {
    api.tabs.onUpdated.addListener((id, changeInfo) => {
      if (changeInfo.status === 'complete' || changeInfo.url) checkActiveTab();
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
    state = await api.storage.local.get(null);
    applyAccent(state['pf-accent-color'] || '#30d158');
    await cleanupLegacyStorage();

    // Restore active view if previously chosen
    const savedView = state['pf_active_view'];
    if (savedView === 'history' || savedView === 'fields') {
      switchView(savedView);
    } else {
      switchView('fields');
    }

    await checkActiveTab();
  })().catch((err) => {
    console.error('Init error:', err);
  });
})();
