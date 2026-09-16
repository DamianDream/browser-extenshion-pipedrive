(() => {
  const { api, key, cleanLabel } = PF;
  const host = location.hostname;
  const GROUP = '[data-testid="fields-list-group"]';
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
    findFieldRows(block).forEach(r => rows.add(r));

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
        findFieldRows(sibling).forEach(r => rows.add(r));
        sibling = sibling.nextElementSibling;
      }
    }
    return [...rows];
  }

  function applyVisibility() {
    if (!api?.runtime?.id) return;
    try {
      // 1. Process GROUPs
      const groups = document.querySelectorAll(GROUP);
      for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        if (group.closest(BLOCK)) continue;
        const title = group.querySelector('[data-test="accordion_header"] .cui5-accordion__item-header-content > span, [data-test="accordion_header"]');
        const rawLabel = title?.textContent.trim();
        const label = cleanLabel(rawLabel);
        if (!label) continue;
        const groupId = key(host, label);
        const isGroupHidden = visibilityState['hidden:' + groupId] === true;

        const outer = group.closest('div[data-index]');
        const target = outer && outer.querySelectorAll(GROUP).length === 1 ? outer : group;
        mark(target, isGroupHidden, target === outer);
        if (target !== group) {
          mark(group, isGroupHidden, false);
        }

        const rows = findFieldRows(group);
        for (let j = 0; j < rows.length; j++) {
          const row = rows[j];
          if (row.closest(GROUP) !== group) continue;
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
        const group = blocks[i];
        const label = extractBlockLabel(group);
        if (!label) continue;
        const groupId = key(host, label);
        const isGroupHidden = visibilityState['hidden:' + groupId] === true;

        const outer = group.closest('div[data-index]');
        const target = outer && outer.querySelectorAll(BLOCK).length === 1 ? outer : group;
        mark(target, isGroupHidden, target === outer);
        if (target !== group) {
          mark(group, isGroupHidden, false);
        }

        const rows = collectBlockRows(group);
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
      function register(id, entry) {
        const catalogKey = 'catalog:' + id;
        if (JSON.stringify(state[catalogKey]) !== JSON.stringify(entry)) additions[catalogKey] = entry;
      }
      document.querySelectorAll(GROUP).forEach(group => {
        if (group.closest(BLOCK)) return;
        const title = group.querySelector('[data-test="accordion_header"] .cui5-accordion__item-header-content > span, [data-test="accordion_header"]');
        const rawLabel = title?.textContent.trim();
        const label = cleanLabel(rawLabel);
        if (!label) return;
        const groupId = key(host, label);
        register(groupId, { host, group: label, field: null });
        findFieldRows(group).forEach(row => {
          if (row.closest(GROUP) !== group) return;
          const field = extractFieldName(row);
          if (!field) return;
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
          const fieldId = key(host, label, field);
          register(fieldId, { host, group: label, field });
        });
      });
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
          if (/auto|scroll/.test(style.overflowY) && cur.scrollHeight > cur.clientHeight + 1) {
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
    }).observe(document.documentElement, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ['data-index', 'data-testid', 'data-field-key', 'class']
    });
    window.addEventListener('scroll', () => {
      applyVisibility();
    }, { passive: true, capture: true });
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
    if (!hasCatalog) scheduleDiscovery();
    const intervalId = setInterval(() => {
      if (!api?.runtime?.id) {
        clearInterval(intervalId);
        return;
      }
      scan(true);
    }, 60000);
  });
  ready.catch(error => {
    if (String(error?.message || error).includes('Extension context invalidated')) return;
    console.warn('Pipedrive Fields:', error);
  });
})();
