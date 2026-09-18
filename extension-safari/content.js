(() => {
  const { api, key, cleanLabel } = PF;
  const host = location.hostname;
  const GROUP = [
    '[data-testid="fields-list-group"]',
    '[data-test="accordion"]',
    '.cui5-accordion__item',
    '[class*="fields-list-group"]'
  ].join(', ');
  const BLOCK = [
    '[data-testid="detail-block"]',
    '[data-testid="person-block"]',
    '[data-testid="organization-block"]',
    '[data-testid="deal-block"]',
    '[data-testid="lead-block"]',
    '[data-testid$="-block"]'
  ].join(', ');
  let state = {}, visibilityState = {}, timer, running = false, again = false, discoveryPending = false;
  function mark(node, hidden, virtual = false) {
    const mode = virtual ? 'virtual' : '1';
    if (hidden && node.getAttribute('data-pf-hidden') !== mode) node.setAttribute('data-pf-hidden', mode);
    else if (!hidden && node.hasAttribute('data-pf-hidden')) node.removeAttribute('data-pf-hidden');
  }
  const IGNORED_NAMES = new Set([
    '+', 'додати поле', '+ додати поле', 'add field', '+ add field', 'редагувати', 'edit'
  ]);
  function extractFieldName(row) {
    const nameEl = row.querySelector(
      '[data-testid="field-name"], [data-testid="field-label"], [data-testid*="field-name"], [data-testid*="field-label"], [data-test*="field-name"], [data-test*="field-label"], [data-test*="field_name"], [data-test*="field_label"], [data-field-label], [class*="ComponentState__name"], [class*="__name__"], [class*="readLabel"], [class*="field-name"], [class*="fieldName"]'
    );
    if (nameEl) {
      const text = nameEl.textContent.trim();
      if (text && !IGNORED_NAMES.has(text.toLowerCase())) return text;
    }
    const labelEl = row.querySelector('label, [class*="__name"], .cui5-table__cell:first-child');
    if (labelEl) {
      const text = labelEl.textContent.trim();
      if (text && text.length <= 80 && !IGNORED_NAMES.has(text.toLowerCase())) return text;
    }
    return null;
  }
  const ROW_SELECTORS = [
    '[data-testid="fields-list-row"]',
    '[data-testid="field-row"]',
    '[data-testid*="field-row"]',
    '[data-testid*="field-item"]',
    '[data-testid*="fields-list-row"]',
    '[data-field-key]',
    '[data-test*="field_row"]',
    '[data-test*="field-row"]',
    '[class*="sidebarField"]',
    '[class*="ComponentState__sidebarField"]'
  ].join(', ');

  const LABEL_SELECTORS = [
    '[data-testid="field-name"]',
    '[data-testid="field-label"]',
    '[data-testid*="field-name"]',
    '[data-testid*="field-label"]',
    '[data-test*="field-name"]',
    '[data-test*="field-label"]',
    '[data-test*="field_name"]',
    '[data-test*="field_label"]',
    '[data-field-label]',
    '[class*="ComponentState__name"]',
    '[class*="__name__"]',
    '[class*="readLabel"]'
  ].join(', ');

  function findFieldRows(container) {
    const rows = new Set();
    container.querySelectorAll(ROW_SELECTORS).forEach(row => rows.add(row));
    container.querySelectorAll(LABEL_SELECTORS).forEach(labelEl => {
      const row = labelEl.closest(ROW_SELECTORS) ||
        labelEl.closest('tr, [class*="FieldRow"], [class*="fields-list-row"], [class*="sidebarField"], [class*="row"]') ||
        labelEl.parentElement;
      if (row && container.contains(row)) {
        rows.add(row);
      }
    });
    return [...rows];
  }

  function extractBlockLabel(block) {
    const title = block.querySelector(
      '[data-testid="block-collapse"] .cui5-button__label, [data-testid="block-collapse"], [class*="Header-"] button, [data-test="accordion_header"]'
    );
    let text = title?.textContent.trim();
    if (!text) {
      const testId = block.getAttribute('data-testid') || '';
      if (testId === 'detail-block') text = 'Докладні дані';
      else if (testId === 'person-block') text = 'Контактна особа';
      else if (testId === 'organization-block') text = 'Організація';
    }
    return cleanLabel(text);
  }

  function extractGroupLabel(group) {
    if (!group) return '';
    const title = group.querySelector(
      '[data-test="accordion_header"] .cui5-accordion__item-header-content > span, [data-test="accordion_header"] span, [data-test="accordion_header"], [class*="accordion__item-header"] span, [class*="accordion__item-header"]'
    );
    return cleanLabel(title?.textContent.trim());
  }

  function getValidSubgroups() {
    const list = [];
    document.querySelectorAll('[data-test="accordion_header"], .cui5-accordion__item-header, [class*="accordion__item-header"]').forEach(header => {
      const g = header.closest('[data-testid="fields-list-group"]') ||
                header.closest('.cui5-accordion__item') ||
                header.closest('[data-test="accordion"]') ||
                header.parentElement;
      if (g && !list.includes(g)) list.push(g);
    });
    document.querySelectorAll(GROUP).forEach(el => {
      if (extractGroupLabel(el) && !list.some(existing => existing.contains(el) || el.contains(existing))) {
        list.push(el);
      }
    });
    return list;
  }

  function getValidBlocks() {
    const allBlocks = [...document.querySelectorAll(BLOCK)].filter(b => {
      const testId = b.getAttribute('data-testid') || '';
      const isKnown = testId === 'detail-block' || testId === 'person-block' || testId === 'organization-block';
      return isKnown || Boolean(b.querySelector('[data-testid="block-collapse"]'));
    });
    return allBlocks.filter(b => !allBlocks.some(parent => parent !== b && parent.contains(b)));
  }

  function collectBlockRows(block) {
    const rows = new Set();
    const subgroups = getValidSubgroups();
    findFieldRows(block).forEach(r => {
      const insideSubgroup = subgroups.some(g => g.contains(r));
      if (!insideSubgroup) rows.add(r);
    });

    const wrapper = block.closest('div[data-index]') || block.parentElement;
    if (wrapper && wrapper !== document.body && wrapper !== document.documentElement) {
      let sibling = block.nextElementSibling;
      while (sibling) {
        if (
          sibling.matches?.(BLOCK) ||
          sibling.querySelector?.(BLOCK) ||
          sibling.matches?.(GROUP) ||
          sibling.querySelector?.(GROUP) ||
          sibling.matches?.('[data-testid*="organization"], [data-testid*="deal"], [data-testid*="detail"], [data-testid*="person"]') ||
          sibling.querySelector?.('[data-testid*="organization"], [data-testid*="deal"], [data-testid*="detail"], [data-testid*="person"]') ||
          sibling.querySelector?.('[data-testid="block-collapse"]') ||
          sibling.querySelector?.('[data-test="accordion_header"]')
        ) {
          break;
        }
        findFieldRows(sibling).forEach(r => {
          const insideSubgroup = subgroups.some(g => g.contains(r));
          if (!insideSubgroup) rows.add(r);
        });
        sibling = sibling.nextElementSibling;
      }
    }
    return [...rows];
  }

  function applyVisibility() {
    if (!api?.runtime?.id) return;
    try {
      // 1. Process GROUPs (including those nested inside detail-block)
      const groups = getValidSubgroups();
      for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        const label = extractGroupLabel(group);
        if (!label) continue;
        const groupId = key(host, label);
        const isGroupHidden = visibilityState['hidden:' + groupId] === true;

        const outer = group.closest('div[data-index]');
        const target = outer && outer.querySelectorAll('[data-test="accordion_header"]').length <= 1 ? outer : group;
        mark(target, isGroupHidden, target === outer);
        if (target !== group) {
          mark(group, isGroupHidden, false);
        }

        const rows = findFieldRows(group);
        for (let j = 0; j < rows.length; j++) {
          const row = rows[j];
          const field = extractFieldName(row);
          if (!field) continue;
          const fieldId = key(host, label, field);
          const isFieldHidden = isGroupHidden || visibilityState['hidden:' + fieldId] === true;
          mark(row, isFieldHidden, false);
        }
      }

      // 2. Process BLOCKs (detail-block, person-block, organization-block, etc.)
      const blocks = getValidBlocks();
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const label = extractBlockLabel(block);
        if (!label) continue;
        const groupId = key(host, label);
        const isGroupHidden = visibilityState['hidden:' + groupId] === true;

        const hasSubgroups = block.matches('[data-testid="detail-block"]') || groups.some(g => block.contains(g));
        const outer = block.closest('div[data-index]');
        const target = outer && outer.querySelectorAll(BLOCK).length === 1 ? outer : block;

        if (hasSubgroups) {
          // Never hide parent detail-block container completely as it holds the virtual list with inner subgroups
          mark(target, false, target === outer);
          if (target !== block) {
            mark(block, false, false);
          }

          // If the group itself is hidden, hide the block header
          const header = block.querySelector('[data-testid="block-collapse"]')?.closest('[class*="Header-"]') ||
                         block.querySelector('[data-testid="block-collapse"]');
          if (header) {
            mark(header, isGroupHidden, false);
          }
        } else {
          mark(target, isGroupHidden, target === outer);
          if (target !== block) {
            mark(block, isGroupHidden, false);
          }
        }

        const rows = collectBlockRows(block);
        for (let j = 0; j < rows.length; j++) {
          const row = rows[j];
          const field = extractFieldName(row);
          if (!field) continue;
          const fieldId = key(host, label, field);
          const isFieldHidden = isGroupHidden || visibilityState['hidden:' + fieldId] === true;

          const rowOuter = row.closest('div[data-index]');
          const rowTarget = rowOuter && rowOuter !== outer && rowOuter.querySelectorAll(ROW_SELECTORS).length <= 1 ? rowOuter : row;
          mark(rowTarget, isFieldHidden, rowTarget === rowOuter);
          if (rowTarget !== row) {
            mark(row, isFieldHidden, false);
          }
        }
      }
    } catch (e) {
      if (String(e?.message || e).includes('Extension context invalidated')) return;
      console.warn('Pipedrive Fields applyVisibility:', e);
    }
  }

  async function scan(discover = false) {
    if (!api?.runtime?.id) return;
    applyVisibility();
    if (!discover) return;
    if (running) { again = true; return; }
    running = true;
    try {
      const additions = {};
      const removals = [];

      function register(id, entry) {
        const catalogKey = 'catalog:' + id;
        if (JSON.stringify(state[catalogKey]) !== JSON.stringify(entry)) additions[catalogKey] = entry;
      }

      const subgroupFieldNorms = new Set();
      const subgroups = getValidSubgroups();

      subgroups.forEach(group => {
        const label = extractGroupLabel(group);
        if (!label) return;
        const groupId = key(host, label);
        register(groupId, { host, group: label, field: null });
        findFieldRows(group).forEach(row => {
          const field = extractFieldName(row);
          if (!field) return;
          subgroupFieldNorms.add(PF.normalize(field));
          const fieldId = key(host, label, field);
          register(fieldId, { host, group: label, field });
        });
      });

      getValidBlocks().forEach(group => {
        const label = extractBlockLabel(group);
        if (!label) return;
        const groupId = key(host, label);
        register(groupId, { host, group: label, field: null });
        const rows = collectBlockRows(group);
        rows.forEach(row => {
          const field = extractFieldName(row);
          if (!field) return;
          if (subgroupFieldNorms.has(PF.normalize(field))) return;
          const fieldId = key(host, label, field);
          register(fieldId, { host, group: label, field });
        });
      });

      // Clean up stale catalog entries where subgroup fields were previously attributed to detail-block
      Object.entries(state).forEach(([k, item]) => {
        if (!k.startsWith('catalog:pf1:') || !item || item.host !== host || !item.field) return;
        const gNorm = PF.normalize(item.group || '');
        if (gNorm === 'докладні дані' || gNorm === 'detail' || gNorm === 'details') {
          if (subgroupFieldNorms.has(PF.normalize(item.field))) {
            removals.push(k);
            const hiddenK = 'hidden:' + k.replace('catalog:', '');
            if (state[hiddenK] !== undefined) removals.push(hiddenK);
          }
        }
      });

      if (removals.length) {
        try {
          await api.storage.local.remove(removals);
          removals.forEach(k => {
            delete state[k];
            if (k.startsWith('hidden:pf1:')) delete visibilityState[k];
          });
        } catch (removeErr) {
          if (String(removeErr?.message || removeErr).includes('Extension context invalidated')) return;
        }
      }

      if (Object.keys(additions).length) {
        if (!api?.runtime?.id) return;
        try {
          await api.storage.local.set(additions);
          Object.assign(state, additions);
        } catch (storageErr) {
          if (String(storageErr?.message || storageErr).includes('Extension context invalidated')) {
            return;
          }
          throw storageErr;
        }
      }
    } catch (error) {
      if (String(error?.message || error).includes('Extension context invalidated')) {
        return;
      }
      console.warn('Pipedrive Fields:', error);
    } finally {
      running = false;
      if (again) { again = false; scheduleDiscovery(); }
    }
  }

  let discoveryTimer = null;
  function scheduleDiscovery() {
    if (discoveryTimer) clearTimeout(discoveryTimer);
    discoveryTimer = setTimeout(() => {
      discoveryTimer = null;
      scan(true);
    }, 500);
  }

  const relevant = [
    '[data-testid="fields-list-group"]',
    '[data-testid="detail-block"]',
    '[data-testid="person-block"]',
    '[data-testid="organization-block"]',
    '[data-testid$="-block"]',
    '[data-testid*="field"]',
    '[data-field-key]',
    '[class*="sidebarField"]',
    '[data-index]',
    '[data-pf-hidden]'
  ].join(', ');
  function affectsFields(records) {
    return records.some(record => {
      const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (target?.closest(relevant)) return true;
      return [...record.addedNodes, ...record.removedNodes].some(node =>
        node.nodeType === 1 && (node.matches(relevant) || node.querySelector(relevant))
      );
    });
  }
  const pause = delay => new Promise(resolve => setTimeout(resolve, delay));
  const nextPaint = () => new Promise(resolve => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(resolve));
    else setTimeout(resolve, 32);
  });
  function catalogCount() {
    return Object.entries(state).filter(([id, entry]) =>
      id.startsWith('catalog:pf1:') && entry?.host === host
    ).length;
  }
  async function collectAtCurrentPosition() {
    await nextPaint();
    await pause(70);
    await scan(true);
  }
  async function deepDiscoverBlockFields() {
    const originalX = window.scrollX;
    const originalY = window.scrollY;
    const root = document.documentElement;
    const previousBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    try {
      const scrollers = new Set();
      document.querySelectorAll('[data-virtuoso-scroller="true"], [data-testid="virtuoso-scroller"]').forEach(s => scrollers.add(s));
      document.querySelectorAll(`${GROUP}, ${BLOCK}`).forEach(el => {
        el.querySelectorAll('[data-virtuoso-scroller="true"], [data-testid="virtuoso-scroller"]').forEach(s => scrollers.add(s));
        const outer = el.closest('[data-virtuoso-scroller="true"], [data-testid="virtuoso-scroller"]');
        if (outer) scrollers.add(outer);
        let cur = el.parentElement;
        while (cur && cur !== document.body && cur !== document.documentElement) {
          const style = getComputedStyle(cur);
          if (/auto|scroll|overlay/.test(style.overflowY || style.overflow) && cur.scrollHeight > cur.clientHeight + 1) {
            scrollers.add(cur);
            break;
          }
          cur = cur.parentElement;
        }
      });

      for (const scroller of scrollers) {
        if (!scroller || scroller.scrollHeight <= scroller.clientHeight + 1) continue;
        const originalTop = scroller.scrollTop;
        let top = 0;
        while (top < scroller.scrollHeight - scroller.clientHeight) {
          scroller.scrollTop = top;
          await collectAtCurrentPosition();
          top += Math.max(160, Math.floor(scroller.clientHeight * 0.7));
        }
        scroller.scrollTop = scroller.scrollHeight - scroller.clientHeight;
        await collectAtCurrentPosition();
        scroller.scrollTop = originalTop;
      }

      const docHeight = Math.max(
        document.documentElement.scrollHeight || 0,
        document.body?.scrollHeight || 0,
        window.innerHeight || 0
      );
      const maxScroll = Math.max(0, docHeight - (window.innerHeight || 0));
      const endTop = maxScroll > 0 ? maxScroll : 1000;
      const step = Math.max(240, Math.floor((window.innerHeight || 600) * 0.65));
      for (let top = 0; top <= endTop; top += step) {
        window.scrollTo(originalX, top);
        await collectAtCurrentPosition();
      }
      window.scrollTo(originalX, endTop);
      await collectAtCurrentPosition();
    } finally {
      window.scrollTo(originalX, originalY);
      root.style.scrollBehavior = previousBehavior;
      await nextPaint();
    }
  }
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const [id, change] of Object.entries(changes)) {
      if (change.newValue === undefined) {
        delete state[id];
        if (id.startsWith('hidden:pf1:')) delete visibilityState[id];
      } else {
        state[id] = change.newValue;
        if (id.startsWith('hidden:pf1:')) visibilityState[id] = change.newValue;
      }
      if (id === 'pf-accent-color') {
        updateFabAccent(change.newValue);
      }
      if (id === 'pf-deal-fab-enabled') {
        if (change.newValue === false) {
          removeDealFab();
        } else {
          ensureDealFab();
        }
      }
    }
    applyVisibility();
  });
  api.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== 'pf-scan') return;
    ready.then(async () => {
      const before = catalogCount();
      await scan(true);
      await deepDiscoverBlockFields();
      await scan(true);
      respond({ok: true, added: Math.max(0, catalogCount() - before)});
    }).catch(error => {
      console.warn('Pipedrive Fields deep scan:', error);
      respond({ok: false});
    });
    return true;
  });
  const ready = api.storage.local.get(null).then(data => {
    state = data;
    visibilityState = Object.fromEntries(
      Object.entries(data).filter(([id]) => id.startsWith('hidden:pf1:'))
    );
    new MutationObserver(records => {
      if (affectsFields(records)) {
        applyVisibility();
        scheduleDiscovery();
      }
      if (isDealPage()) {
        ensureDealFab();
      }
    }).observe(document.documentElement, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ['data-index', 'data-testid', 'data-field-key', 'class']
    });
    window.addEventListener('scroll', () => {
      applyVisibility();
      scheduleDiscovery();
    }, { passive: true, capture: true });

    // Always schedule discovery on startup and post-render
    scheduleDiscovery();
    setTimeout(scheduleDiscovery, 1200);
    setTimeout(scheduleDiscovery, 3000);

    const hasCatalog = Object.entries(state).some(([id, entry]) =>
      id.startsWith('catalog:pf1:') && entry?.host === host
    );
    // The browser injects content.css at document_start; JS only assigns stable markers.
    if (!hasCatalog) {
      const startupDiscovery = new MutationObserver(records => {
        if (affectsFields(records)) {
          applyVisibility();
          scheduleDiscovery();
        }
      });
      startupDiscovery.observe(document.documentElement, { childList: true, subtree: true });
      // Allow the first SPA render to arrive, even when startup DOM is empty.
      setTimeout(() => startupDiscovery.disconnect(), 60000);
    }
    applyVisibility();
    // Initialize deal visit tracker
    checkUrlNavigation();

    const intervalId = setInterval(() => {
      if (!api?.runtime?.id) {
        clearInterval(intervalId);
        return;
      }
      scan(true);
      checkUrlNavigation();
    }, 60000);
  });
  ready.catch(error => {
    if (String(error?.message || error).includes('Extension context invalidated')) return;
    console.warn('Pipedrive Fields:', error);
  });

  // =========================================================================
  // Deal Visit History Tracker (autonomous background recording)
  // =========================================================================
  let lastRecordedDeal = null;
  let lastRecordedHref = '';
  let pollIntervalId = null;

  function extractDealInfo(urlStr) {
    try {
      const u = new URL(urlStr || location.href);
      const match = u.pathname.match(/\/deal\/(\d+)/i);
      if (match) {
        return {
          dealId: match[1],
          url: u.origin + '/deal/' + match[1]
        };
      }
    } catch {}
    return null;
  }

  function cleanExtractedTitle(raw) {
    if (!raw || typeof raw !== 'string') return '';
    let val = raw.trim();
    if (!val) return '';
    const lower = val.toLowerCase();
    if (lower === 'додати назву' || lower === 'add title' || lower === 'назва угоди' || lower === 'deal title') {
      return '';
    }
    return val;
  }

  function extractDealTitle(dealId) {
    // 1. Primary: Textarea or input inside editable box / h1 / [data-testid="deal-title"]
    const directInputs = document.querySelectorAll(
      'h1 textarea, h1 input, .cui5-editable-text__box textarea, .cui5-editable-text__box input, .cui5-editable-text__input, [data-testid="deal-title"] textarea, [data-testid="deal-title"] input'
    );
    for (const el of directInputs) {
      const val = cleanExtractedTitle(el.value || el.getAttribute('placeholder') || el.textContent);
      if (val) return val;
    }

    // 2. Direct h1 or deal-title container text
    const headings = document.querySelectorAll('h1, [data-testid="deal-title"]');
    for (const h of headings) {
      // Avoid entire page headers if not relevant
      const val = cleanExtractedTitle(h.textContent);
      if (val && (val.includes(dealId) || val.startsWith('#'))) return val;
    }

    // 3. Document title fallback
    if (document.title) {
      const t = document.title.replace(/\s*[-—|•]\s*(?:Угоди|Deals|Сделки|Pipedrive).*$/i, '').trim();
      const cleaned = cleanExtractedTitle(t);
      if (cleaned && (cleaned.includes(dealId) || cleaned.startsWith('#'))) return cleaned;
    }

    return '#' + dealId;
  }

  async function updateDealTitleInStorage(dealId, newTitle) {
    if (!api?.storage?.local || !newTitle || newTitle === '#' + dealId) return;
    try {
      const data = await api.storage.local.get('pf_deal_history');
      const list = Array.isArray(data.pf_deal_history) ? data.pf_deal_history : [];
      let changed = false;
      for (let i = 0; i < Math.min(list.length, 10); i++) {
        if (list[i].id === dealId && (list[i].title === '#' + dealId || !list[i].title || list[i].title !== newTitle)) {
          list[i].title = newTitle;
          changed = true;
        }
      }
      if (changed) {
        await api.storage.local.set({ pf_deal_history: list });
      }
    } catch {}
  }

  function pollUpgradeDealTitle(dealId, maxTries = 20) {
    if (pollIntervalId) clearInterval(pollIntervalId);
    let count = 0;
    pollIntervalId = setInterval(() => {
      count++;
      const currentTitle = extractDealTitle(dealId);
      if (currentTitle && currentTitle !== '#' + dealId) {
        clearInterval(pollIntervalId);
        pollIntervalId = null;
        if (lastRecordedDeal && lastRecordedDeal.dealId === dealId) {
          lastRecordedDeal.title = currentTitle;
        }
        updateDealTitleInStorage(dealId, currentTitle);
      } else if (count >= maxTries) {
        clearInterval(pollIntervalId);
        pollIntervalId = null;
      }
    }, 250);
  }

  async function recordDealVisit() {
    if (!api?.storage?.local) return;
    const dealInfo = extractDealInfo(location.href);
    if (!dealInfo) return;

    const { dealId, url } = dealInfo;
    const now = Date.now();
    const FIVE_MINUTES = 5 * 60 * 1000;
    const HISTORY_LIMIT = 10000;

    let currentTitle = extractDealTitle(dealId);

    try {
      const data = await api.storage.local.get('pf_deal_history');
      const history = Array.isArray(data.pf_deal_history) ? [...data.pf_deal_history] : [];

      // Check if existing record for this deal was created within the last 5 minutes
      const existingIdx = history.findIndex(item => item && String(item.id) === String(dealId));

      if (existingIdx !== -1 && (now - (history[existingIdx].timestamp || 0)) < FIVE_MINUTES) {
        // Within 5 minutes: update timestamp and title (do not add duplicate)
        const oldItem = history[existingIdx];
        const effectiveTitle = (currentTitle && currentTitle !== '#' + dealId)
          ? currentTitle
          : (oldItem.title || '#' + dealId);

        const updatedItem = {
          ...oldItem,
          url,
          title: effectiveTitle,
          timestamp: now
        };

        // Move to top of history
        history.splice(existingIdx, 1);
        history.unshift(updatedItem);

        // Cap at 10000 items
        const trimmed = history.slice(0, HISTORY_LIMIT);
        await api.storage.local.set({ pf_deal_history: trimmed });

        lastRecordedDeal = { dealId, time: now, title: effectiveTitle };

        if (effectiveTitle === '#' + dealId) {
          pollUpgradeDealTitle(dealId);
        }
        return;
      }

      // New record (either first time or > 5 minutes ago)
      const newEntry = {
        id: dealId,
        url,
        title: currentTitle,
        timestamp: now
      };

      const updatedHistory = [newEntry, ...history.filter(Boolean)].slice(0, HISTORY_LIMIT);
      await api.storage.local.set({ pf_deal_history: updatedHistory });

      lastRecordedDeal = { dealId, time: now, title: currentTitle };

      if (currentTitle === '#' + dealId) {
        pollUpgradeDealTitle(dealId);
      }
    } catch (err) {
      console.warn('PF recordDealVisit:', err);
    }
  }

  // =========================================================================
  // Floating Action Button (FAB) for Deal Pages
  // =========================================================================
  let fabContainer = null;
  let fabDropdownOpen = false;

  function isDealPage() {
    try {
      if (!PF.supported(location.href)) return false;
      const path = location.pathname || '';
      // Matches /deal/123, /deal/123/..., /v1/deal/123, etc., but exclude /deals (pipeline/list)
      if (/\/deal\b/i.test(path) && !/^\/deals(?:\/|$|\?)/i.test(path)) {
        return true;
      }
      // DOM check: if detail-block, deal-block or deal-title is in DOM
      if (document.querySelector('[data-testid="detail-block"], [data-testid="deal-block"], [data-testid="deal-title"]')) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  function isColorLight(hex) {
    if (!hex || typeof hex !== 'string') return false;
    const c = hex.replace('#', '');
    const num = parseInt(c.length === 3 ? c.split('').map(x => x + x).join('') : c, 16);
    if (isNaN(num)) return false;
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return (r * 299 + g * 587 + b * 114) / 1000 > 155;
  }

  function updateFabAccent(color) {
    const el = document.getElementById('pf-deal-fab-container') || fabContainer;
    if (!el) return;
    const accent = color || state['pf-accent-color'] || '#FFC500';
    el.style.setProperty('--pf-fab-accent', accent);
    const isLight = isColorLight(accent);
    el.style.setProperty('--pf-fab-text', isLight ? '#111111' : '#ffffff');
    el.style.setProperty('--pf-fab-divider', isLight ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.25)');
  }

  function triggerOpenExtension(targetView, openSettings = false) {
    if (!api?.runtime?.id) return;
    try {
      api.runtime.sendMessage({
        type: 'OPEN_SIDE_PANEL',
        targetView,
        openSettings
      }).catch(() => {});
    } catch {}
  }

  function setFabDropdown(open) {
    fabDropdownOpen = open;
    const fabEl = document.getElementById('pf-deal-fab');
    const menuEl = document.getElementById('pf-deal-fab-menu');
    if (fabEl) {
      if (open) {
        fabEl.classList.add('menu-open', 'pf-expanded');
      } else {
        fabEl.classList.remove('menu-open', 'pf-expanded');
      }
    }
    if (menuEl) {
      if (open) {
        menuEl.classList.add('open');
      } else {
        menuEl.classList.remove('open');
      }
    }
  }

  let catEl = null;
  let leftEyeEl = null;
  let rightEyeEl = null;
  let leftPupil = null;
  let rightPupil = null;
  let catRafId = null;
  let catMouseX = 0;
  let catMouseY = 0;
  let catMouseInside = false;
  let catTrackingActive = false;
  let motionMediaQuery = null;
  let isReducedMotion = false;

  function getEyeCenter(eyeEl) {
    if (!eyeEl) return { x: 0, y: 0, r: 10 };
    const rect = eyeEl.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      r: rect.width / 2
    };
  }

  function updateCatPupils() {
    catRafId = null;
    if (!leftPupil || !rightPupil || !catEl) return;
    if (isReducedMotion) return;

    if (!catMouseInside) {
      leftPupil.classList.add('returning');
      rightPupil.classList.add('returning');
      leftPupil.style.transform = 'translate(0px, 0px)';
      rightPupil.style.transform = 'translate(0px, 0px)';
      return;
    }

    leftPupil.classList.remove('returning');
    rightPupil.classList.remove('returning');

    // Left eye
    const lCenter = getEyeCenter(leftEyeEl);
    const ldx = catMouseX - lCenter.x;
    const ldy = catMouseY - lCenter.y;
    const ldist = Math.hypot(ldx, ldy);
    const langle = Math.atan2(ldy, ldx);
    const lMaxTravel = lCenter.r * 0.45;
    const ltravel = lMaxTravel * (ldist / (ldist + 130));
    const lx = Math.cos(langle) * ltravel;
    const ly = Math.sin(langle) * ltravel;
    leftPupil.style.transform = `translate(${lx.toFixed(2)}px, ${ly.toFixed(2)}px)`;

    // Right eye
    const rCenter = getEyeCenter(rightEyeEl);
    const rdx = catMouseX - rCenter.x;
    const rdy = catMouseY - rCenter.y;
    const rdist = Math.hypot(rdx, rdy);
    const rangle = Math.atan2(rdy, rdx);
    const rMaxTravel = rCenter.r * 0.45;
    const rtravel = rMaxTravel * (rdist / (rdist + 130));
    const rx = Math.cos(rangle) * rtravel;
    const ry = Math.sin(rangle) * rtravel;
    rightPupil.style.transform = `translate(${rx.toFixed(2)}px, ${ry.toFixed(2)}px)`;
  }

  function onCatMouseMove(e) {
    if (isReducedMotion) return;
    catMouseX = e.clientX;
    catMouseY = e.clientY;
    catMouseInside = true;
    if (!catRafId) {
      catRafId = requestAnimationFrame(updateCatPupils);
    }
  }

  function onCatMouseLeave() {
    catMouseInside = false;
    if (!catRafId) {
      catRafId = requestAnimationFrame(updateCatPupils);
    }
  }

  function onMotionQueryChange(e) {
    isReducedMotion = Boolean(e && e.matches);
    if (isReducedMotion) {
      onCatMouseLeave();
    }
  }

  function startCatEyeTracking() {
    if (catTrackingActive) return;
    catTrackingActive = true;

    try {
      motionMediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      isReducedMotion = motionMediaQuery.matches;
      if (motionMediaQuery.addEventListener) {
        motionMediaQuery.addEventListener('change', onMotionQueryChange);
      } else if (motionMediaQuery.addListener) {
        motionMediaQuery.addListener(onMotionQueryChange);
      }
    } catch {
      isReducedMotion = false;
    }

    window.addEventListener('mousemove', onCatMouseMove, { passive: true });
    document.addEventListener('mouseleave', onCatMouseLeave);
    window.addEventListener('blur', onCatMouseLeave);
  }

  function stopCatEyeTracking() {
    if (!catTrackingActive) return;
    catTrackingActive = false;

    window.removeEventListener('mousemove', onCatMouseMove);
    document.removeEventListener('mouseleave', onCatMouseLeave);
    window.removeEventListener('blur', onCatMouseLeave);

    if (motionMediaQuery) {
      if (motionMediaQuery.removeEventListener) {
        motionMediaQuery.removeEventListener('change', onMotionQueryChange);
      } else if (motionMediaQuery.removeListener) {
        motionMediaQuery.removeListener(onMotionQueryChange);
      }
      motionMediaQuery = null;
    }

    if (catRafId) {
      cancelAnimationFrame(catRafId);
      catRafId = null;
    }

    catEl = null;
    leftEyeEl = null;
    rightEyeEl = null;
    leftPupil = null;
    rightPupil = null;
  }

  function ensureDealFab() {
    if (state['pf-deal-fab-enabled'] === false) {
      removeDealFab();
      return;
    }
    if (!isDealPage()) {
      removeDealFab();
      return;
    }

    if (!document.body) return;

    let existing = document.getElementById('pf-deal-fab-container');
    if (existing) {
      if (existing.parentElement !== document.body) {
        document.body.appendChild(existing);
      }
      updateFabAccent();
      catEl = existing.querySelector('#pf-deal-cat');
      leftEyeEl = existing.querySelector('.pf-cat-eye-left');
      rightEyeEl = existing.querySelector('.pf-cat-eye-right');
      leftPupil = existing.querySelector('#pf-cat-pupil-left');
      rightPupil = existing.querySelector('#pf-cat-pupil-right');
      startCatEyeTracking();
      return;
    }

    const catImageUrl = PF.api?.runtime?.getURL ? PF.api.runtime.getURL('deal-cat.png') : 'deal-cat.png';

    fabContainer = document.createElement('div');
    fabContainer.id = 'pf-deal-fab-container';
    updateFabAccent();

    fabContainer.innerHTML = `
      <div id="pf-deal-fab-menu" role="menu" aria-label="Меню расширения">
        <button type="button" class="pf-fab-menu-item" data-view="history" role="menuitem">
          <span class="pf-fab-menu-item-icon">🕒</span>
          <span class="pf-fab-menu-item-label">История сделок</span>
        </button>
        <button type="button" class="pf-fab-menu-item" data-view="fields" role="menuitem">
          <span class="pf-fab-menu-item-icon">📑</span>
          <span class="pf-fab-menu-item-label">Видимость полей</span>
        </button>
        <div class="pf-fab-menu-divider" role="separator"></div>
        <button type="button" class="pf-fab-menu-item" data-view="settings" role="menuitem">
          <span class="pf-fab-menu-item-icon">⚙</span>
          <span class="pf-fab-menu-item-label">Настройки</span>
        </button>
      </div>

      <div id="pf-deal-cat" aria-hidden="true">
        <img class="pf-cat-body" src="${catImageUrl}" alt="" />
        <div class="pf-cat-eye pf-cat-eye-left">
          <div class="pf-cat-pupil" id="pf-cat-pupil-left"></div>
        </div>
        <div class="pf-cat-eye pf-cat-eye-right">
          <div class="pf-cat-pupil" id="pf-cat-pupil-right"></div>
        </div>
      </div>

      <div id="pf-deal-fab" title="Deal History">
        <button type="button" class="pf-fab-main-btn" aria-label="Открыть историю сделок">
          <span class="pf-fab-icon">+</span>
          <span class="pf-fab-label">Deal History</span>
        </button>
        <button type="button" class="pf-fab-arrow-btn" aria-label="Меню расширения" title="Меню разделов" aria-haspopup="true">
          <svg class="pf-fab-arrow-icon" viewBox="0 0 10 6">
            <path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none" />
          </svg>
        </button>
      </div>
    `;

    catEl = fabContainer.querySelector('#pf-deal-cat');
    leftEyeEl = fabContainer.querySelector('.pf-cat-eye-left');
    rightEyeEl = fabContainer.querySelector('.pf-cat-eye-right');
    leftPupil = fabContainer.querySelector('#pf-cat-pupil-left');
    rightPupil = fabContainer.querySelector('#pf-cat-pupil-right');
    startCatEyeTracking();

    // Main button click -> Deal History
    const mainBtn = fabContainer.querySelector('.pf-fab-main-btn');
    mainBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      setFabDropdown(false);
      triggerOpenExtension('history');
    });

    // Arrow trigger click -> Dropdown menu toggle
    const arrowBtn = fabContainer.querySelector('.pf-fab-arrow-btn');
    arrowBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      setFabDropdown(!fabDropdownOpen);
    });

    // Dropdown items click
    const menuItems = fabContainer.querySelectorAll('.pf-fab-menu-item');
    menuItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        setFabDropdown(false);
        const view = item.dataset.view;
        if (view === 'settings') {
          triggerOpenExtension('fields', true);
        } else {
          triggerOpenExtension(view || 'history');
        }
      });
    });

    document.body.appendChild(fabContainer);
  }

  function removeDealFab() {
    stopCatEyeTracking();
    const existing = document.getElementById('pf-deal-fab-container');
    if (existing) {
      existing.remove();
      fabContainer = null;
      fabDropdownOpen = false;
    }
  }

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (fabDropdownOpen && !e.target.closest('#pf-deal-fab-container')) {
      setFabDropdown(false);
    }
  });

  function checkUrlNavigation() {
    if (location.href !== lastRecordedHref) {
      lastRecordedHref = location.href;
      recordDealVisit();
      scheduleDiscovery();
      setTimeout(scheduleDiscovery, 1200);
    }
    ensureDealFab();
  }

  // Hook SPA navigation
  try {
    const origPushState = history.pushState;
    if (origPushState) {
      history.pushState = function() {
        origPushState.apply(this, arguments);
        checkUrlNavigation();
      };
    }
    const origReplaceState = history.replaceState;
    if (origReplaceState) {
      history.replaceState = function() {
        origReplaceState.apply(this, arguments);
        checkUrlNavigation();
      };
    }
  } catch {}

  window.addEventListener('popstate', checkUrlNavigation);
  checkUrlNavigation();

  // Watch for any in-page SPA URL changes or DOM replacements
  new MutationObserver(() => {
    if (location.href !== lastRecordedHref) {
      checkUrlNavigation();
    } else if (isDealPage()) {
      ensureDealFab();
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
